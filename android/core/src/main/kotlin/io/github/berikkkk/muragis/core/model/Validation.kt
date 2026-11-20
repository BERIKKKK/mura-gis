package io.github.berikkkk.muragis.core.model

import kotlin.math.abs
import kotlin.math.roundToLong

/** Жұмыс үстеліндегі main/marks.js және main/routes.js тексерулерімен бірдей шектеулер. */
object Limits {
    const val NAME = 200
    const val PERIOD = 120
    const val OBLAST = 80
    const val DISTRICT = 80
    const val PLACE = 1500
    const val NOTE = 3000
    const val ROUTE_END_NAME = 120
    const val ROUTE_MAX_POINTS = 20000
}

class ValidationException(val code: String, message: String) : IllegalArgumentException(message)

object Validation {
    fun validCoord(lat: Double, lon: Double) =
        lat.isFinite() && lon.isFinite() && abs(lat) <= 90.0 && abs(lon) <= 180.0

    fun round(v: Double, digits: Int): Double {
        val k = Math.pow(10.0, digits.toDouble())
        return (v * k).roundToLong() / k
    }

    /** Ұзындықты Юникод таңбасы (code point) бойынша қысқарту — JS-тегі [...s].slice(0, n) сияқты. */
    fun cut(s: String?, max: Int): String {
        val t = (s ?: "").trim()
        if (t.codePointCount(0, t.length) <= max) return t
        return t.substring(0, t.offsetByCodePoints(0, max))
    }

    private fun Localized.cut(max: Int) = Localized(cut(kk, max), cut(ru, max))

    /** Ескерткішті тексеріп, қалыпқа келтіру. Атауы кемінде бір тілде болуы керек. */
    fun clean(m: Monument): Monument {
        if (!validCoord(m.lat, m.lon)) throw ValidationException("coord", "Invalid coordinates")
        val name = m.name.cut(Limits.NAME)
        if (name.isBlank()) throw ValidationException("name", "Name is required")
        return m.copy(
            lat = round(m.lat, 8), lon = round(m.lon, 8),
            name = name,
            period = m.period.cut(Limits.PERIOD),
            oblast = m.oblast.cut(Limits.OBLAST),
            district = m.district.cut(Limits.DISTRICT),
            place = m.place.cut(Limits.PLACE),
            note = m.note.cut(Limits.NOTE),
        )
    }

    /** Маршрутты тексеру: кемінде 2 нүкте, координаталар 1e-7 дәлдікке дейін. */
    fun clean(r: Route): Route {
        val pts = r.points.filter { validCoord(it.lat, it.lon) }
            .map { it.copy(lat = round(it.lat, 7), lon = round(it.lon, 7)) }
        if (pts.size < 2) throw ValidationException("points", "A route needs at least 2 points")
        if (pts.size > Limits.ROUTE_MAX_POINTS) throw ValidationException("points", "Too many points")
        val checked = if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(r.checked)) r.checked else ""
        return r.copy(
            points = pts,
            name = r.name.cut(Limits.NAME),
            aName = r.aName.cut(Limits.ROUTE_END_NAME),
            bName = r.bName.cut(Limits.ROUTE_END_NAME),
            note = r.note.cut(Limits.NOTE),
            checked = checked,
        )
    }
}
