package io.github.berikkkk.muragis.core.geo

import kotlin.math.abs
import kotlin.math.floor

/**
 * Координаталарды енгізу — жұмыс үстеліндегі src/qorgau/app.js (parseOne, splitPair, parsePair) логикасының көшірмесі.
 * Бір мәннің пішімдері:
 *   ондық градус ........... 50.412345 · 50,412345 · 50.412345° · N50.412345 · -57.1
 *   градус + ондық минут ... 50°24.7407′ · 50 24.7407 · 50:24.7407
 *   градус + минут + секунд  50°24′44.44″ · 50 24 44.44 · 50°24'44,44"С · 50 24 44.44 с.ш.
 * Жарты шар әріптері: N/С, S/Ю/О, E/В/Ш, W/З/Б.
 */
object Coords {
    enum class Error { EMPTY, NO_NUMBER, TOO_MANY, MARK_REPEATED, NO_DEGREES, NO_MINUTES, DEG_NOT_INT, MIN_RANGE, SEC_RANGE, MIN_NOT_INT, SPLIT, LAT_RANGE, LON_RANGE }

    sealed interface One {
        data class Ok(val v: Double, val hemi: Char?, val isLon: Boolean) : One
        data class Err(val error: Error) : One
    }

    sealed interface Pair {
        data class Ok(val lat: Double, val lon: Double, val swapped: Boolean) : Pair
        data class Err(val error: Error, val lonPart: Boolean = false) : Pair
    }

    private val LETTER = Regex("[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+")
    private const val NEG_HEMI = "SWЮЗОБ"
    private const val LON_HEMI = "EWЕВЗШБ"

    fun normalize(s: String?): String = (s ?: "")
        .replace(Regex("[−–—]"), "-").replace("''", "″").replace(Regex("[‘’`´′]"), "'").replace(Regex("[“”″]"), "\"")
        .replace(Regex("[º˚]"), "°").replace(Regex("(\\d),(\\d)"), "$1.$2").replace(Regex("\\s+"), " ").trim()

    private data class Tok(val v: Double, val neg: Boolean, val mark: Char?)

    fun parseOne(str: String?): One {
        var s = normalize(str)
        if (s.isEmpty()) return One.Err(Error.EMPTY)
        val letters = LETTER.findAll(s).joinToString("") { it.value }.uppercase()
        val hemi = letters.firstOrNull()
        s = s.replace(LETTER, " ")
        // Сандар арасындағы нүкте ғана ондық бөлгіш; қалғаны (мыс. «с.ш.») — бос орын
        s = buildString {
            for (i in s.indices) {
                val c = s[i]
                if (c == '.') {
                    val ok = i > 0 && s[i - 1].isDigit() && i + 1 < s.length && s[i + 1].isDigit()
                    append(if (ok) '.' else ' ')
                } else append(c)
            }
        }
        val toks = Regex("(-?\\+?\\d+(?:\\.\\d+)?)\\s*([°'\"])?").findAll(s).map {
            val num = it.groupValues[1]
            Tok(num.replace("+", "").toDouble(), num.startsWith("-"), it.groupValues[2].firstOrNull())
        }.toList()
        if (toks.isEmpty()) return One.Err(Error.NO_NUMBER)
        if (toks.size > 3) return One.Err(Error.TOO_MANY)
        val slot = arrayOfNulls<Tok>(3)
        val idx = mapOf('°' to 0, '\'' to 1, '"' to 2)
        for (t in toks) if (t.mark != null) {
            val k = idx.getValue(t.mark)
            if (slot[k] != null) return One.Err(Error.MARK_REPEATED)
            slot[k] = t
        }
        for (t in toks) if (t.mark == null) {
            val k = slot.indexOfFirst { it == null }
            if (k < 0) return One.Err(Error.TOO_MANY)
            slot[k] = t
        }
        val d0 = slot[0] ?: return One.Err(Error.NO_DEGREES)
        if (slot[2] != null && slot[1] == null) return One.Err(Error.NO_MINUTES)
        val d = abs(d0.v)
        val m = slot[1]?.v ?: 0.0
        val sec = slot[2]?.v ?: 0.0
        val neg = toks[0].neg || (hemi != null && NEG_HEMI.contains(hemi))
        if (toks.size > 1 && d != floor(d)) return One.Err(Error.DEG_NOT_INT)
        if (m < 0 || m >= 60) return One.Err(Error.MIN_RANGE)
        if (sec < 0 || sec >= 60) return One.Err(Error.SEC_RANGE)
        if (toks.size == 3 && m != floor(m)) return One.Err(Error.MIN_NOT_INT)
        val v = d + m / 60 + sec / 3600
        return One.Ok(if (neg) -v else v, hemi, hemi != null && LON_HEMI.contains(hemi))
    }

    private fun inLat(v: Double) = v in 40.5..55.5
    private fun inLon(v: Double) = v in 46.4..87.4

    /** Ендік пен бойлықты бөлек өрістерден оқу (Қазақстан шегінде ауысып кетсе — түзетіледі, жұмыс үстеліндегідей). */
    fun parsePair(a: String?, b: String?): Pair {
        val pa = parseOne(a)
        val pb = parseOne(b)
        if (pa is One.Err) return Pair.Err(pa.error, false)
        if (pb is One.Err) return Pair.Err(pb.error, true)
        pa as One.Ok; pb as One.Ok
        var lat = pa.v
        var lon = pb.v
        var swapped = false
        if (pa.isLon && pb.hemi != null && !pb.isLon) {
            lat = pb.v; lon = pa.v; swapped = true
        } else if (abs(lat) > 90 && abs(lon) <= 90) {
            lat = pb.v; lon = pa.v; swapped = true
        } else if (!inLat(lat) && inLon(lat) && inLat(lon)) {
            lat = pb.v; lon = pa.v; swapped = true
        }
        if (abs(lat) > 90) return Pair.Err(Error.LAT_RANGE)
        if (abs(lon) > 180) return Pair.Err(Error.LON_RANGE)
        return Pair.Ok(lat, lon, swapped)
    }

    /** Бір жолдағы жұп («50.1, 57.2», «N50°10' E57°20'», «50 10 30 57 20 30» т.б.). */
    fun parseLine(line: String?): Pair {
        val parts = splitPair(line) ?: return Pair.Err(Error.SPLIT)
        return parsePair(parts.first, parts.second)
    }

    fun splitPair(line: String?): kotlin.Pair<String, String>? {
        val s = normalize(line).replace(Regex("^(№\\s*)?\\d{1,4}\\s*[).:\\-]\\s+"), "")
        for (sep in listOf(Regex("\\s*[;\\t|]\\s*"), Regex("\\s*,\\s+"), Regex("\\s*/\\s*"))) {
            val parts = s.split(sep).filter { p -> p.any { it.isDigit() } }
            if (parts.size == 2) return parts[0] to parts[1]
            if (parts.size == 3 && Regex("^\\s*\\d{1,4}\\s*$").matches(parts[0])) return parts[1] to parts[2]
        }
        val hemiRe = Regex("(?:^|[\\s\\d°'\"])([NSEWСЮЕВЗШБО])(?:\\.?\\s*[шдШД]\\.?)?(?=[\\s\\d]|$)", RegexOption.IGNORE_CASE)
        val hs = hemiRe.findAll(s).toList()
        if (hs.size >= 2) {
            val firstDigit = s.indexOfFirst { it.isDigit() }
            val pos1 = hs[0].groups[1]!!.range.first
            if (pos1 < firstDigit) {
                val pos2 = hs[1].groups[1]!!.range.first
                return s.substring(0, pos2) to s.substring(pos2)
            }
            val end1 = hs[0].range.last + 1
            return s.substring(0, end1) to s.substring(end1)
        }
        val degs = Regex("-?\\d+(?:\\.\\d+)?\\s*°").findAll(s).toList()
        if (degs.size >= 2) return s.substring(0, degs[1].range.first) to s.substring(degs[1].range.first)
        var nums = Regex("-?\\d+(?:\\.\\d+)?").findAll(s).map { it.value }.toList()
        if (nums.size % 2 == 1 && nums.size >= 3 && Regex("^\\d{1,4}$").matches(nums[0])) nums = nums.drop(1)
        if (nums.size in setOf(2, 4, 6)) {
            val h = nums.size / 2
            return nums.take(h).joinToString(" ") to nums.drop(h).joinToString(" ")
        }
        return null
    }

    /** 50.412345 → 50°24′44,44″ (жұмыс үстеліндегі dms() пішімі; [comma] — ондық үтір). */
    fun dms(v: Double, comma: Boolean = true): String {
        val a = abs(v)
        var d = floor(a).toInt()
        val mf = (a - d) * 60
        var m = floor(mf).toInt()
        var s = Math.round((mf - m) * 60 * 100) / 100.0
        if (s >= 60) { s = 0.0; m++ }
        if (m >= 60) { m = 0; d++ }
        val sec = String.format(java.util.Locale.ROOT, "%05.2f", s).let { if (comma) it.replace('.', ',') else it }
        return d.toString() + "°" + m.toString().padStart(2, '0') + "′" + sec + "″"
    }

    fun dmsLat(lat: Double) = dms(lat) + if (lat < 0) " S" else " N"
    fun dmsLon(lon: Double) = dms(lon) + if (lon < 0) " W" else " E"

    fun decimal(v: Double, digits: Int = 6) = String.format(java.util.Locale.ROOT, "%.${digits}f", v)
}
