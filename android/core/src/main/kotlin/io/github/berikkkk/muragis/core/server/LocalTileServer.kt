package io.github.berikkkk.muragis.core.server

import java.io.BufferedInputStream
import java.io.Closeable
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Тайл жауабы: деректер және MIME түрі. */
data class TileResponse(val data: ByteArray, val mime: String)

fun interface TileProvider {
    /** layerId бойынша тайл; null — тайл жоқ (204). */
    fun tile(layerId: String, z: Int, x: Int, y: Int): TileResponse?

    /** Карта пакетінің ресурсы (стиль, қаріп, белгіше): path — мыс. "glyphs/Noto Sans Regular/0-255.pbf". */
    fun resource(layerId: String, path: String): TileResponse? = null

    /** Пакеттегі қосымша растр жиынының тайлы (мыс. жер бедерінің көлеңкесі). */
    fun extraTile(layerId: String, set: String, z: Int, x: Int, y: Int): TileResponse? = null
}

/**
 * Құрылғының ішіндегі (127.0.0.1) шағын HTTP-сервер: жергілікті карта файлдарындағы (MBTiles, ZIP, қалта, GeoPackage)
 * тайлдарды карта қозғалтқышына береді — GET /t/{layerId}/{z}/{x}/{y}; офлайн пакеттің ресурстары — GET /r/{layerId}/{path},
 * қосымша растр жиыны — GET /s/{layerId}/{set}/{z}/{x}/{y}.
 * Тек loopback интерфейсте тыңдайды (желіден қолжетімсіз), интернет қажет емес. Тайлдар сұралғанда ғана оқылады.
 */
class LocalTileServer(private val provider: TileProvider, threads: Int = 16) : Closeable {
    private val socket = ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))
    private val pool: ExecutorService = Executors.newFixedThreadPool(threads) { r -> Thread(r, "mura-tiles").apply { isDaemon = true } }
    @Volatile private var running = true
    val port: Int get() = socket.localPort
    val baseUrl: String get() = "http://127.0.0.1:$port"

    fun template(layerId: String) = "$baseUrl/t/$layerId/{z}/{x}/{y}"

    private val acceptThread = Thread({
        while (running) {
            val s = try { socket.accept() } catch (e: Exception) { if (running) continue else break }
            pool.execute { handle(s) }
        }
    }, "mura-tiles-accept").apply { isDaemon = true; start() }

    private val RES = Regex("^/r/([A-Za-z0-9_.-]+)/([^?]+)(?:\\?.*)?$")
    private val SET = Regex("^/s/([A-Za-z0-9_.-]+)/([A-Za-z0-9_-]+)/(\\d{1,2})/(\\d{1,8})/(\\d{1,8})(?:\\.[a-z]+)?(?:\\?.*)?$")
    private val PATH = Regex("^/t/([A-Za-z0-9_.-]+)/(\\d{1,2})/(\\d{1,8})/(\\d{1,8})(?:\\.[a-z]+)?(?:\\?.*)?$")

    private fun handle(s: Socket) {
        s.use { sock ->
            try {
                sock.soTimeout = 15_000
                val inp = BufferedInputStream(sock.getInputStream())
                val out = sock.getOutputStream()
                var first = true
                while (running) {
                    // Бос тұрған keep-alive қосылымы ағынды ұзақ ұстамасын: келесі сұранысты қысқа күтеміз
                    // (векторлық стиль тайл, қаріп, белгішені бір мезетте сұрайды — басқа қосылымдар кезекте қалмауы керек)
                    if (!first) sock.soTimeout = 2_000
                    first = false
                    val line = readLine(inp) ?: return
                    if (line.isEmpty()) continue
                    var keepAlive = line.endsWith("HTTP/1.1")
                    while (true) {
                        val h = readLine(inp) ?: return
                        if (h.isEmpty()) break
                        val lower = h.lowercase()
                        if (lower.startsWith("connection:")) keepAlive = !lower.contains("close")
                    }
                    val parts = line.split(' ')
                    val method = parts.getOrNull(0) ?: ""
                    val path = parts.getOrNull(1) ?: ""
                    val head = method == "HEAD"
                    val m = PATH.matchEntire(path)
                    val r = if (m == null) RES.matchEntire(path) else null
                    val st = if (m == null && r == null) SET.matchEntire(path) else null
                    if ((method != "GET" && !head) || (m == null && r == null && st == null)) {
                        respond(out, 404, "text/plain", "Not found".toByteArray(), keepAlive, head)
                    } else if (m != null) {
                        val (id, z, x, y) = m.destructured
                        val t = runCatching { provider.tile(id, z.toInt(), x.toInt(), y.toInt()) }.getOrNull()
                        if (t == null) respond(out, 204, "text/plain", ByteArray(0), keepAlive, head)
                        else respond(out, 200, t.mime, t.data, keepAlive, head)
                    } else if (r != null) {
                        val (id, p) = r.destructured
                        val name = runCatching { java.net.URLDecoder.decode(p.replace("+", "%2B"), "UTF-8") }.getOrDefault(p)
                        // Жолдан шығуға тыйым (..), тек пакет ішіндегі атаулар
                        val t = if (name.contains("..")) null else runCatching { provider.resource(id, name) }.getOrNull()
                        if (t == null) respond(out, 404, "text/plain", "Not found".toByteArray(), keepAlive, head)
                        else respond(out, 200, t.mime, t.data, keepAlive, head)
                    } else {
                        val (id, set, z, x, y) = st!!.destructured
                        val t = runCatching { provider.extraTile(id, set, z.toInt(), x.toInt(), y.toInt()) }.getOrNull()
                        if (t == null) respond(out, 204, "text/plain", ByteArray(0), keepAlive, head)
                        else respond(out, 200, t.mime, t.data, keepAlive, head)
                    }
                    if (!keepAlive) return
                }
            } catch (e: SocketTimeoutException) {
            } catch (e: SocketException) {
            } catch (e: Exception) {
            }
        }
    }

    private fun readLine(inp: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = inp.read()
            if (c < 0) return if (sb.isEmpty()) null else sb.toString()
            if (c == '\n'.code) return sb.toString().trimEnd('\r')
            if (sb.length > 8192) return null
            sb.append(c.toChar())
        }
    }

    private fun respond(out: OutputStream, code: Int, mime: String, body: ByteArray, keepAlive: Boolean, head: Boolean) {
        val status = when (code) { 200 -> "OK"; 204 -> "No Content"; else -> "Not Found" }
        val hdr = StringBuilder("HTTP/1.1 $code $status\r\n")
            .append("Content-Type: ").append(mime).append("\r\n")
            .append("Content-Length: ").append(body.size).append("\r\n")
            .append("Cache-Control: no-store\r\n")
            .append("Connection: ").append(if (keepAlive) "keep-alive" else "close").append("\r\n\r\n")
        out.write(hdr.toString().toByteArray(Charsets.US_ASCII))
        if (!head && body.isNotEmpty()) out.write(body)
        out.flush()
    }

    override fun close() {
        running = false
        runCatching { socket.close() }
        pool.shutdownNow()
        acceptThread.interrupt()
    }
}
