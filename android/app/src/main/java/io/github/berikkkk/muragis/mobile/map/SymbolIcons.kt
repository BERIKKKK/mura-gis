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
import io.github.berikkkk.muragis.core.model.PlaceKind
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

    /**
     * Өзге нысандардың белгісі: түріне қарай түс және ақ таңба (жұмыс үстеліндегі src/marks/places.js KINDS-пен бірдей).
     * Пішіні — дөңгеленген шаршы: ескерткіш белгілерінен (SVG пішіндер) бірден ажыратылады.
     * Таңбалар — Lucide иконкалары (https://lucide.dev, ISC лицензиясы; src/vendor/lucide/LICENSE): 24×24 тордағы SVG path
     * деректері өзгеріссіз (тек <circle> → path, ал арка жалаушалары PathParser үшін бос орынмен ажыратылған).
     */
    class PlaceStyle(val fill: Int, val paths: List<String>)

    private fun circle(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0z"

    val PLACE_STYLE: Map<PlaceKind, PlaceStyle> = mapOf(
        // Lucide: house
        PlaceKind.SETTLEMENT to PlaceStyle(Color.rgb(109, 76, 159), listOf(
            "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
            "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z")),
        // Lucide: snowflake
        PlaceKind.QYSTAU to PlaceStyle(Color.rgb(141, 110, 99), listOf(
            "m10 20-1.25-2.5L6 18", "M10 4 8.75 6.5 6 6", "m14 20 1.25-2.5L18 18", "m14 4 1.25 2.5L18 6", "m17 21-3-6h-4", "m17 3-3 6 1.5 3",
            "M2 12h6.5L10 9", "m20 10-1.5 2 1.5 2", "M22 12h-6.5L14 15", "m4 10 1.5 2L4 14", "m7 21 3-6-1.5-3", "m7 3 3 6h4")),
        // Lucide: sun
        PlaceKind.ZHAILAU to PlaceStyle(Color.rgb(46, 125, 50), listOf(
            circle(12f, 12f, 4f), "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2",
            "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41")),
        // Lucide: leaf
        PlaceKind.KUZEU to PlaceStyle(Color.rgb(230, 108, 0), listOf(
            "M11 20a10 10 0 0 0 10-10 25.9 25.9 0 0 0-1.04-7.281 1 1 0 0 0-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0 0 11 20",
            "M2 21a5 5 0 0 1 2.911-4.544C7.613 15.212 8.351 15.24 11 13")),
        // Lucide: sprout
        PlaceKind.KOKTEU to PlaceStyle(Color.rgb(124, 179, 66), listOf(
            "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3",
            "M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4", "M5 21h14")),
        // Lucide: tent
        PlaceKind.TURAQ to PlaceStyle(Color.rgb(84, 110, 122), listOf("M3.5 21 14 3", "M20.5 21 10 3", "M15.5 21 12 15l-3.5 6", "M2 21h20")),
        // Lucide: circle-dot
        PlaceKind.WELL to PlaceStyle(Color.rgb(21, 101, 192), listOf(circle(12f, 12f, 1f), circle(12f, 12f, 10f))),
        // Lucide: droplet
        PlaceKind.SPRING to PlaceStyle(Color.rgb(0, 151, 167), listOf(
            "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z")),
        // Lucide: circle-small
        PlaceKind.OTHER to PlaceStyle(Color.rgb(117, 117, 117), listOf(circle(12f, 12f, 6f))),
    )

    fun placeIconName(k: PlaceKind) = "pl-" + k.code

    /** Карта мен тізімдегі белгі (бір сурет): ақ жиек, түрдің түсі, ортасында ақ таңба (сызық қалыңдығы 2.4 — жұмыс үстеліндегідей). */
    fun place(k: PlaceKind, sizePx: Int): Bitmap {
        val st = PLACE_STYLE.getValue(k)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val s = sizePx.toFloat()
        p.color = Color.WHITE; cv.drawRoundRect(RectF(0f, 0f, s, s), s * 0.28f, s * 0.28f, p)
        val inset = s * 0.11f
        p.color = st.fill; cv.drawRoundRect(RectF(inset, inset, s - inset, s - inset), s * 0.2f, s * 0.2f, p)
        val g = s * 0.58f
        cv.save()
        cv.translate((s - g) / 2, (s - g) / 2)
        cv.scale(g / 24f, g / 24f)
        p.style = Paint.Style.STROKE; p.color = Color.WHITE; p.strokeWidth = 2.4f
        p.strokeCap = Paint.Cap.ROUND; p.strokeJoin = Paint.Join.ROUND
        for (d in st.paths) runCatching { PathParser.createPathFromPathData(d) }.getOrNull()?.let { cv.drawPath(it, p) }
        cv.restore()
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

    /**
     * Жаяу жүргендегі бағыт «шамы»: кескіннің ортасынан (орын нүктесінен) жоғары (солтүстікке) қарай кеңейетін
     * жартылай мөлдір трапеция, алыс шеті біртіндеп сөнеді. Картада [icon-rotate] арқылы жүру бағытына бұрылады.
     */
    fun cone(sizePx: Int): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val s = sizePx.toFloat(); val c = s / 2f
        val near = c - s * 0.02f; val far = s * 0.04f
        val path = Path().apply {
            moveTo(c - s * 0.07f, near)
            lineTo(c - s * 0.30f, far)
            lineTo(c + s * 0.30f, far)
            lineTo(c + s * 0.07f, near)
            close()
        }
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.style = Paint.Style.FILL
        p.shader = android.graphics.LinearGradient(0f, near, 0f, far, Color.argb(150, 30, 111, 217), Color.argb(0, 30, 111, 217), android.graphics.Shader.TileMode.CLAMP)
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
