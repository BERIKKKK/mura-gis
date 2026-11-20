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
}

/**
 * Құрылғының ішіндегі (127.0.0.1) шағын HTTP-сервер: жергілікті карта файлдарындағы (MBTiles, ZIP, қалта, GeoPackage)
 * тайлдарды карта қозғалтқышына береді — GET /t/{layerId}/{z}/{x}/{y}.
 * Тек loopback интерфейсте тыңдайды (желіден қолжетімсіз), интернет қажет емес. Тайлдар сұралғанда ғана оқылады.
 */
class LocalTileServer(private val provider: TileProvider, threads: Int = 4) : Closeable {
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

    private val PATH = Regex("^/t/([A-Za-z0-9_.-]+)/(\\d{1,2})/(\\d{1,8})/(\\d{1,8})(?:\\.[a-z]+)?(?:\\?.*)?$")

    private fun handle(s: Socket) {
        s.use { sock ->
            try {
                sock.soTimeout = 15_000
                val inp = BufferedInputStream(sock.getInputStream())
                val out = sock.getOutputStream()
                while (running) {
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
                    val m = PATH.matchEntire(parts.getOrNull(1) ?: "")
                    if ((method != "GET" && method != "HEAD") || m == null) {
                        respond(out, 404, "text/plain", "Not found".toByteArray(), keepAlive, method == "HEAD")
                    } else {
                        val (id, z, x, y) = m.destructured
                        val t = runCatching { provider.tile(id, z.toInt(), x.toInt(), y.toInt()) }.getOrNull()
                        if (t == null) respond(out, 204, "text/plain", ByteArray(0), keepAlive, method == "HEAD")
                        else respond(out, 200, t.mime, t.data, keepAlive, method == "HEAD")
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
