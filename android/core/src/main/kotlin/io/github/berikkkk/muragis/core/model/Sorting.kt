package io.github.berikkkk.muragis.core.model

/**
 * Ескерткіштерді сұрыптау — жұмыс үстеліндегі src/marks/sort.js көшірмесі:
 * атаудағы рим цифрлары (латын да, кирилл де: IV / ІҮ → 4) санмен салыстырылады,
 * қазақ әліпбиінің реті: А Ә Б В Г Ғ Д Е Ё Ж З И Й К Қ Л М Н Ң О Ө П Р С Т У Ұ Ү Ф Х Һ Ц Ч Ш Щ Ъ Ы І Ь Э Ю Я.
 */
object Sorting {
    private val STRONG = mapOf('I' to 'I', 'І' to 'I', 'Ӏ' to 'I', 'V' to 'V', 'Ү' to 'V', 'Ѵ' to 'V', 'X' to 'X', 'Х' to 'X')
    private val WEAK = mapOf('L' to 'L', 'C' to 'C', 'D' to 'D', 'M' to 'M', 'С' to 'C', 'М' to 'M', 'У' to 'V')
    private val UNI = listOf("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "L", "C", "D", "M")
    private val VALID = Regex("^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
    private val VAL = mapOf('I' to 1, 'V' to 5, 'X' to 10, 'L' to 50, 'C' to 100, 'D' to 500, 'M' to 1000)
    private const val DASHES = "-‐‑‒–—―"

    private fun uniRoman(c: Int): String? = when (c) {
        in 0x2160..0x216F -> UNI[c - 0x2160]
        in 0x2170..0x217F -> UNI[c - 0x2170]
        else -> null
    }

    fun romanToken(word: String, afterDash: Boolean = false, beforeDot: Boolean = false): Int? {
        if (word.isEmpty()) return null
        val latin = StringBuilder()
        var strong = false
        var count = 0
        var i = 0
        while (i < word.length) {
            val cp = word.codePointAt(i); i += Character.charCount(cp); count++
            val u = uniRoman(cp)
            if (u != null) { latin.append(u); strong = true; continue }
            val ch = String(Character.toChars(cp))
            if (ch != ch.uppercase()) return null
            val c = ch[0]
            val st = STRONG[c]
            if (st != null) { latin.append(st); strong = true; continue }
            val wk = WEAK[c] ?: return null
            latin.append(wk)
        }
        if (!strong) return null
        if (!afterDash && beforeDot && count == 1) return null
        val r = latin.toString()
        if (!VALID.matches(r)) return null
        var n = 0
        for (k in r.indices) {
            val v = VAL.getValue(r[k]); val nx = if (k + 1 < r.length) VAL.getValue(r[k + 1]) else 0
            n += if (v < nx) -v else v
        }
        return if (n in 1..3999) n else null
    }

    private val WORD = Regex("[\\p{L}\\u2160-\\u217F]+")

    fun arabizeRoman(s: String?): String {
        val str = s ?: ""
        return WORD.replace(str) { m ->
            val off = m.range.first
            val prev = if (off > 0) str[off - 1] else null
            val next = if (m.range.last + 1 < str.length) str[m.range.last + 1] else null
            if ((prev != null && prev.isDigit()) || (next != null && next.isDigit())) return@replace m.value
            romanToken(m.value, prev != null && DASHES.contains(prev), next == '.')?.toString() ?: m.value
        }
    }

    fun nameKey(s: String?): String = arabizeRoman(s).replace(Regex("[‐‑‒–—―-]+"), " ")
        .replace(Regex("[«»\"“”„'’]"), "").replace(Regex("\\s+"), " ").trim()

    private const val KK = "аәбвгғдеёжзийкқлмнңоөпрстуұүфхһцчшщъыіьэюя"
    private val RANK = KK.withIndex().associate { it.value to it.index }
    private val TOKEN = Regex("\\d+|[\\s\\S]")

    private fun tokens(s: String?) = TOKEN.findAll(java.text.Normalizer.normalize((s ?: "").lowercase(java.util.Locale("kk")), java.text.Normalizer.Form.NFC)).map { it.value }.toList()

    private fun rank(t: String): Int {
        val ch = t[0]
        RANK[ch]?.let { return 1000 + it }
        if (ch.isWhitespace()) return 0
        val type = Character.getType(ch)
        val punct = type in setOf(
            Character.CONNECTOR_PUNCTUATION.toInt(), Character.DASH_PUNCTUATION.toInt(), Character.START_PUNCTUATION.toInt(), Character.END_PUNCTUATION.toInt(),
            Character.INITIAL_QUOTE_PUNCTUATION.toInt(), Character.FINAL_QUOTE_PUNCTUATION.toInt(), Character.OTHER_PUNCTUATION.toInt(),
            Character.MATH_SYMBOL.toInt(), Character.CURRENCY_SYMBOL.toInt(), Character.MODIFIER_SYMBOL.toInt(), Character.OTHER_SYMBOL.toInt(),
        )
        if (punct) return 10 + (t.codePointAt(0) % 900)
        return 2000 + t.codePointAt(0)
    }

    fun compareText(a: String?, b: String?): Int {
        val x = tokens(a); val y = tokens(b)
        for (i in 0 until minOf(x.size, y.size)) {
            val p = x[i]; val q = y[i]
            if (p == q) continue
            val dp = p[0].isDigit(); val dq = q[0].isDigit()
            if (dp && dq) {
                val d = p.toBigInteger().compareTo(q.toBigInteger())
                if (d != 0) return d
                if (p.length != q.length) return p.length - q.length
                continue
            }
            if (dp != dq) return if (dp) -1 else 1
            return rank(p) - rank(q)
        }
        return x.size - y.size
    }

    fun compareNames(a: String?, b: String?): Int =
        compareText(nameKey(a), nameKey(b)).takeIf { it != 0 } ?: (a ?: "").compareTo(b ?: "")

    private fun blankLast(x0: String, y0: String): Int {
        val x = x0.trim(); val y = y0.trim()
        if (x.isEmpty() != y.isEmpty()) return if (x.isNotEmpty()) -1 else 1
        return compareText(x, y)
    }

    /** Өзге нысандар: атауы бойынша (атауы жоқтары — түрінің атауымен), сосын түрі бойынша. */
    fun sortPlaces(list: List<Place>, lang: Lang): List<Place> = list.sortedWith { a, b ->
        compareNames(a.title(lang), b.title(lang)).let { if (it != 0) it else a.kind.ordinal - b.kind.ordinal }
    }

    /** Құжаттағы рет: санат, облыс, аудан, атау (жұмыс үстеліндегі sortMarks). */
    fun sortMonuments(list: List<Monument>, lang: Lang): List<Monument> = list.sortedWith { a, b ->
        (a.category.order - b.category.order).takeIf { it != 0 }
            ?: blankLast(a.oblast.display(lang), b.oblast.display(lang)).takeIf { it != 0 }
            ?: blankLast(a.district.display(lang), b.district.display(lang)).takeIf { it != 0 }
            ?: compareNames(a.name.display(lang), b.name.display(lang)).takeIf { it != 0 }
            ?: compareText(a.period.display(lang), b.period.display(lang))
    }
}
