package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/**
 * Жұмыс үстеліндегі мәзір иконкаларымен бірдей Lucide иконкалары (https://lucide.dev, ISC лицензиясы;
 * src/vendor/lucide/LICENSE). 24×24 тордағы path деректері өзгеріссіз: <circle>/<line> → path, арка жалаушалары
 * бос орынмен ажыратылған (PathParser үшін). Сызық — 2, ұштары дөңгелек; түсі Icon(tint) арқылы беріледі.
 */
object LucideIcons {
    private fun circle(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0z"

    private fun icon(name: String, vararg paths: String): ImageVector {
        val b = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
        for (d in paths) b.addPath(
            PathParser().parsePathString(d).toNodes(), fill = null, stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
        )
        return b.build()
    }

    /** Ескерткіштер (Desktop: «Ескерткіштер» батырмасы). */
    val Landmark by lazy {
        icon("landmark", "M10 18v-7", "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z",
            "M14 18v-7", "M18 18v-7", "M3 22h18", "M6 18v-7")
    }

    /** Өзге нысандар (Desktop: «Өзге нысандар» батырмасы). */
    val MapPinned by lazy {
        icon("map-pinned",
            "M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0",
            "M4.474 15h-.197a1 1 0 0 0-.969.753l-1.097 4.35a1.5 1.5 0 0 0 1.444 1.898L20.344 22a1.5 1.5 0 0 0 1.446-1.897l-1.098-4.35a1 1 0 0 0-.969-.753h-.197",
            circle(12f, 8f, 2f))
    }

    /** Маршруттар (Desktop: «Маршруттар» қызметі). */
    val Route by lazy {
        icon("route", "M9 5h8.5a1 1 0 0 1 0 7h-11a1 1 0 0 0 0 7H15", circle(18f, 19f, 3f), circle(6f, 5f, 3f))
    }

    /** Координата енгізу (Desktop: координата панелін ашу). */
    val Locate by lazy {
        icon("locate", "M2 12h3", "M19 12h3", "M12 2v3", "M12 19v3", circle(12f, 12f, 7f))
    }

    /** Баптаулар (Desktop: «Баптаулар»). */
    val Settings by lazy {
        icon("settings",
            "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
            circle(12f, 12f, 3f))
    }

    /** Бағдарлама туралы (Lucide «info»). */
    val Info by lazy { icon("info", circle(12f, 12f, 10f), "M12 16v-4", "M12 8h.01") }
}
