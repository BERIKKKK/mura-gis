package io.github.berikkkk.muragis.packager

import java.awt.BasicStroke
import java.awt.Color
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.Ellipse2D
import java.awt.geom.Path2D
import java.awt.image.BufferedImage

/**
 * Векторлық карта стилінің белгішелері (sprite): Java2D-мен салынады, сыртқы файлсыз.
 * Нәтиже — MapLibre sprite пішімі: sprite.json + sprite.png (және @2x).
 */
object Sprite {
    private const val S = 17   // белгіше өлшемі, логикалық пиксель

    private val icons: Map<String, (Graphics2D) -> Unit> = linkedMapOf(
        "peak" to { g -> g.color = Color(0x6B4E3A); g.fill(tri(8.5, 3.0, 14.0)) },
        "spring" to { g -> circleIcon(g, Color(0x1E78C8)); g.color = Color.WHITE; g.fill(Ellipse2D.Double(6.0, 6.0, 5.0, 5.0)) },
        "well" to { g -> g.color = Color(0x1E78C8); g.stroke = BasicStroke(2f); g.draw(Ellipse2D.Double(3.5, 3.5, 10.0, 10.0)); g.fill(Ellipse2D.Double(7.0, 7.0, 3.0, 3.0)) },
        "worship" to { g -> circleIcon(g, Color(0x5B5B5B)); g.color = Color.WHITE; g.fill(Path2D.Double().apply { moveTo(8.5, 4.0); lineTo(12.0, 8.0); lineTo(12.0, 13.0); lineTo(5.0, 13.0); lineTo(5.0, 8.0); closePath() }) },
        "tower" to { g -> g.color = Color(0x5B5B5B); g.stroke = BasicStroke(1.6f); g.draw(Path2D.Double().apply { moveTo(5.0, 15.0); lineTo(8.5, 2.0); lineTo(12.0, 15.0); moveTo(6.2, 10.0); lineTo(10.8, 10.0) }) },
        "station" to { g -> circleIcon(g, Color(0x444444)); g.color = Color.WHITE; g.fillRect(5, 6, 7, 5); g.fillRect(6, 12, 2, 2); g.fillRect(9, 12, 2, 2) },
        "cemetery" to { g -> g.color = Color(0x6E7F5A); g.stroke = BasicStroke(2f); g.drawLine(8, 3, 8, 14); g.drawLine(5, 7, 11, 7) },
        "historic" to { g -> circleIcon(g, Color(0x8A4B2A)); g.color = Color.WHITE; g.fillRect(6, 5, 5, 8); g.fillRect(5, 12, 7, 2) },
        "attraction" to { g -> circleIcon(g, Color(0xB5651D)); g.color = Color.WHITE; g.fill(star(8.5, 8.5, 5.0, 2.2)) },
        "settlement" to { g -> g.color = Color.WHITE; g.fill(Ellipse2D.Double(4.0, 4.0, 9.0, 9.0)); g.color = Color(0x333333); g.stroke = BasicStroke(1.6f); g.draw(Ellipse2D.Double(4.0, 4.0, 9.0, 9.0)); g.fill(Ellipse2D.Double(6.5, 6.5, 4.0, 4.0)) },
    )

    private fun circleIcon(g: Graphics2D, c: Color) {
        g.color = Color.WHITE; g.fill(Ellipse2D.Double(0.5, 0.5, 16.0, 16.0))
        g.color = c; g.fill(Ellipse2D.Double(1.5, 1.5, 14.0, 14.0))
    }

    private fun tri(cx: Double, top: Double, bottom: Double) = Path2D.Double().apply {
        moveTo(cx, top); lineTo(cx + 6, bottom); lineTo(cx - 6, bottom); closePath()
    }

    private fun star(cx: Double, cy: Double, ro: Double, ri: Double) = Path2D.Double().apply {
        for (i in 0 until 10) {
            val r = if (i % 2 == 0) ro else ri
            val a = Math.PI / 5 * i - Math.PI / 2
            val x = cx + r * Math.cos(a); val y = cy + r * Math.sin(a)
            if (i == 0) moveTo(x, y) else lineTo(x, y)
        }
        closePath()
    }

    /** ratio = 1 не 2. Қайтарады: (sprite.json мәтіні, sprite.png байттары). */
    fun build(ratio: Int): Pair<String, ByteArray> {
        val px = S * ratio
        val per = 5
        val img = BufferedImage(px * per, px * ((icons.size + per - 1) / per), BufferedImage.TYPE_INT_ARGB)
        val json = StringBuilder("{")
        icons.entries.forEachIndexed { i, (name, draw) ->
            val x = (i % per) * px; val y = (i / per) * px
            val g = img.createGraphics()
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g.translate(x, y); g.scale(ratio.toDouble(), ratio.toDouble())
            draw(g); g.dispose()
            if (i > 0) json.append(',')
            json.append("\"$name\":{\"x\":$x,\"y\":$y,\"width\":$px,\"height\":$px,\"pixelRatio\":$ratio}")
        }
        json.append('}')
        return json.toString() to Codec.png(img)
    }
}
