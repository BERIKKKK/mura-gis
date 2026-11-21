package io.github.berikkkk.muragis.mobile.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.Xml
import androidx.core.graphics.PathParser
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.MonumentType
import org.xmlpull.v1.XmlPullParser

/**
 * Ескерткіш белгілері — жұмыс үстеліндегі QGIS параметрлі SVG файлдары (assets/symbols, src/marks/symbols-тен көшірме).
 * param(fill) / param(outline) санаттың түсімен ауыстырылады (жұмыс үстеліндегідей). Қарапайым SVG: path, circle, rect, g.
 */
object SymbolIcons {
    private val FILES = mapOf(
        MonumentType.ARCHEO to "archaeology", MonumentType.ARCH to "architectural", MonumentType.ENSEMBLE to "ensemble",
        MonumentType.SACRED to "sacred", MonumentType.ART to "monumental",
    )

    fun iconName(t: MonumentType, c: Category) = "sym-" + t.code + "-" + (c.code.ifEmpty { "none" })

    /** Барлық түр × санат белгілері: атауы → сурет. widthPx — ені (биіктігі 1,25 есе). */
    fun all(ctx: Context, widthPx: Int): Map<String, Bitmap> {
        val out = HashMap<String, Bitmap>()
        for ((t, f) in FILES) {
            val svg = runCatching { ctx.assets.open("symbols/$f.svg").use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull() ?: continue
            for (c in Category.entries) out[iconName(t, c)] = render(svg, c, widthPx)
        }
        return out
    }

    private fun color(v: String?, c: Category): Int? {
        if (v == null) return null
        var s = v.trim()
        if (s.startsWith("param(fill)")) return c.fill.toInt()
        if (s.startsWith("param(outline)")) return c.outline.toInt()
        s = s.replace(Regex("param\\([\\w-]+\\)\\s*"), "")
        if (s == "none" || s.isEmpty()) return null
        return runCatching { Color.parseColor(if (s.length == 4 && s.startsWith("#")) "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] else s) }.getOrNull()
    }

    private fun num(v: String?, def: Float = 0f) = v?.replace(Regex("param\\([\\w-]+\\)\\s*"), "")?.trim()?.toFloatOrNull() ?: def

    private data class Style(val fill: Int?, val stroke: Int?, val width: Float, val cap: Paint.Cap, val join: Paint.Join, val fillOpacity: Float)

    fun render(svg: String, c: Category, widthPx: Int): Bitmap {
        val h = (widthPx * 1.25f).toInt()
        val bmp = Bitmap.createBitmap(widthPx, h, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        cv.scale(widthPx / 64f, h / 80f)
        val p = Xml.newPullParser()
        p.setInput(svg.reader())
        val stack = ArrayDeque<Style>()
        stack.addLast(Style(Color.BLACK, null, 1f, Paint.Cap.BUTT, Paint.Join.MITER, 1f))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        while (p.next() != XmlPullParser.END_DOCUMENT) {
            if (p.eventType == XmlPullParser.END_TAG && p.name == "g") { if (stack.size > 1) stack.removeLast(); continue }
            if (p.eventType != XmlPullParser.START_TAG) continue
            val parent = stack.last()
            fun a(n: String): String? = p.getAttributeValue(null, n)
            val st = Style(
                fill = if (a("fill") != null) color(a("fill"), c) else parent.fill,
                stroke = if (a("stroke") != null) color(a("stroke"), c) else parent.stroke,
                width = a("stroke-width")?.let { num(it, 1f) } ?: parent.width,
                cap = when (a("stroke-linecap")) { "round" -> Paint.Cap.ROUND; "square" -> Paint.Cap.SQUARE; null -> parent.cap; else -> Paint.Cap.BUTT },
                join = when (a("stroke-linejoin")) { "round" -> Paint.Join.ROUND; "bevel" -> Paint.Join.BEVEL; null -> parent.join; else -> Paint.Join.MITER },
                fillOpacity = a("fill-opacity")?.let { num(it, 1f) } ?: parent.fillOpacity,
            )
            val path: Path? = when (p.name) {
                "g" -> { stack.addLast(st); null }
                "path" -> a("d")?.let { runCatching { PathParser.createPathFromPathData(it) }.getOrNull() }
                "circle" -> Path().apply { addCircle(num(a("cx")), num(a("cy")), num(a("r")), Path.Direction.CW) }
                "rect" -> Path().apply {
                    val x = num(a("x")); val y = num(a("y")); val rx = num(a("rx"), num(a("ry")))
                    addRoundRect(RectF(x, y, x + num(a("width")), y + num(a("height"))), rx, rx, Path.Direction.CW)
                }
                else -> null
            }
            if (path != null) {
                st.fill?.let {
                    paint.style = Paint.Style.FILL; paint.color = it; paint.alpha = (255 * st.fillOpacity).toInt().coerceIn(0, 255)
                    cv.drawPath(path, paint)
                }
                st.stroke?.let {
                    paint.style = Paint.Style.STROKE; paint.color = it; paint.strokeWidth = st.width
                    paint.strokeCap = st.cap; paint.strokeJoin = st.join
                    cv.drawPath(path, paint)
                }
            }
        }
        return bmp
    }

    /** Кластер белгісі: дөңгелек және ішінде сан (карта шрифттерсіз жұмыс істейді — мәтін суретте). */
    fun cluster(label: String, sizePx: Int): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = sizePx / 2f
        p.color = Color.argb(90, 138, 75, 42); cv.drawCircle(r, r, r, p)
        p.color = Color.rgb(138, 75, 42); cv.drawCircle(r, r, r * 0.74f, p)
        p.color = Color.WHITE; p.textAlign = Paint.Align.CENTER; p.isFakeBoldText = true
        p.textSize = sizePx * if (label.length >= 4) 0.27f else 0.36f
        val fm = p.fontMetrics
        cv.drawText(label, r, r - (fm.ascent + fm.descent) / 2, p)
        return bmp
    }

    /** Маршрут нүктесінің нөмірі (өңдеу режимінде). */
    /**
     * Орынның бағыт көрсеткіші (навигация үшбұрышы): ұшы жоғары (солтүстікке) қарайды, картада [icon-rotate] арқылы
     * қозғалыс бағытына бұрылады. Ақ жиекті көк үшбұрыш — кез келген карта түсінде көрінеді.
     */
    fun arrow(sizePx: Int): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val s = sizePx.toFloat()
        val path = Path().apply {
            moveTo(s * 0.5f, s * 0.08f)
            lineTo(s * 0.86f, s * 0.90f)
            lineTo(s * 0.5f, s * 0.70f)
            lineTo(s * 0.14f, s * 0.90f)
            close()
        }
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.style = Paint.Style.STROKE; p.strokeJoin = Paint.Join.ROUND; p.strokeWidth = s * 0.10f; p.color = Color.WHITE
        cv.drawPath(path, p)
        p.style = Paint.Style.FILL; p.color = Color.rgb(30, 111, 217)
        cv.drawPath(path, p)
        return bmp
    }

    fun vertex(label: String, sizePx: Int, fill: Int, ring: Int): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = sizePx / 2f
        p.color = ring; cv.drawCircle(r, r, r, p)
        p.color = fill; cv.drawCircle(r, r, r * 0.78f, p)
        p.color = Color.WHITE; p.textAlign = Paint.Align.CENTER; p.isFakeBoldText = true
        p.textSize = sizePx * if (label.length >= 3) 0.34f else 0.46f
        val fm = p.fontMetrics
        cv.drawText(label, r, r - (fm.ascent + fm.descent) / 2, p)
        return bmp
    }
}
