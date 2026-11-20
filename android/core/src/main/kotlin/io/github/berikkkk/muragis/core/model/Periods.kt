package io.github.berikkkk.muragis.core.model

import java.util.Locale

/**
 * Мерзім (дәуір) өрісінің екі тілдегі мәнін синхрондау. Жазылған мәтін танылса, екінші тілдің мәні септігімен
 * дұрыс құрылады; танылмаса — ештеңе өзгермейді (әр тілде өзі жазылады).
 *
 *   Жыл / аралық:  «1967» → «1967 жыл» / «1967 год»;  «1941–1945» → «1941–1945 жж.» / «1941–1945 гг.»
 *   Дәуірлер:      «Тас дәуірі» ↔ «Каменный век», «Қола дәуірі» ↔ «Эпоха бронзы»,
 *                  «Ерте темір дәуірі» ↔ «Эпоха раннего железа», «Орта ғасыр дәуірі» ↔ «Эпоха средневековья» т.б.
 *   Ғасырлар:      «XX ғасыр» ↔ «XX век»;  «XVII–XIX ғасырлар» ↔ «XVII–XIX века»;  «XIX ғ.» ↔ «XIX в.»
 *                  «XX ғасырдың басы / ортасы / соңы» ↔ «начало / середина / конец XX века»
 *                  «XIX ғасырдың бірінші / екінші жартысы» ↔ «первая / вторая половина XIX века»
 *                  «б.з.б. VII–IV ғасырлар» ↔ «VII–IV века до н. э.»
 *   Бірнеше бөлік: үтірмен («Ерте темір дәуірі, б.з.б. V ғасыр») не аралық сызықпен
 *                  («XIX ғасырдың соңы – XX ғасырдың басы») — әр бөлігі танылса ғана.
 * Рим цифрлары латын әрпімен де, кириллицаның ұқсас әріптерімен де танылады (І, Ү, Х, С, М — жұмыс үстеліндегі
 * src/marks/sort.js ережесі, [Sorting.romanToken]); цифр жазылған күйінде қалады.
 */
object Periods {
    private val KK = Locale("kk")
    private val RU = Locale("ru")

    private val YEAR = Regex("""^\s*(\d{1,4})\s*(ж\.?|жыл|г\.?|год)?\s*$""", RegexOption.IGNORE_CASE)
    private val YEAR_RANGE = Regex("""^\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(жж\.?|жылдар|гг\.?|годы)?\s*$""", RegexOption.IGNORE_CASE)

    /** Жыл/аралық болса — (kk, ru), әйтпесе null. */
    fun normalize(text: String): Pair<String, String>? {
        YEAR.matchEntire(text)?.let { m -> val y = m.groupValues[1]; return "$y жыл" to "$y год" }
        YEAR_RANGE.matchEntire(text)?.let { m -> val r = m.groupValues[1] + "–" + m.groupValues[2]; return "$r жж." to "$r гг." }
        return null
    }

    /* ---------------- Дәуірлер ---------------- */
    /** [kk] — жазылу нұсқалары (бірінші — шығыс түрі), [ru] — сол сияқты. */
    private class Epoch(val kk: List<String>, val ru: List<String>)

    private val EPOCHS = listOf(
        Epoch(listOf("тас дәуірі"), listOf("каменный век", "эпоха камня")),
        Epoch(listOf("ерте тас дәуірі"), listOf("ранний каменный век")),
        Epoch(listOf("палеолит дәуірі", "палеолит"), listOf("эпоха палеолита", "палеолит")),
        Epoch(listOf("мезолит дәуірі", "мезолит"), listOf("эпоха мезолита", "мезолит")),
        Epoch(listOf("неолит дәуірі", "неолит"), listOf("эпоха неолита", "неолит")),
        Epoch(listOf("энеолит дәуірі", "энеолит"), listOf("эпоха энеолита", "энеолит")),
        Epoch(listOf("қола дәуірі"), listOf("эпоха бронзы", "бронзовый век")),
        Epoch(listOf("ерте қола дәуірі"), listOf("эпоха ранней бронзы")),
        Epoch(listOf("орта қола дәуірі"), listOf("эпоха средней бронзы")),
        Epoch(listOf("кейінгі қола дәуірі", "соңғы қола дәуірі"), listOf("эпоха поздней бронзы")),
        Epoch(listOf("ерте темір дәуірі"), listOf("эпоха раннего железа", "ранний железный век")),
        Epoch(listOf("темір дәуірі"), listOf("железный век", "эпоха железа")),
        Epoch(listOf("орта ғасыр дәуірі", "орта ғасырлар дәуірі", "орта ғасырлар", "орта ғасыр"), listOf("эпоха средневековья", "средневековье", "средние века")),
        Epoch(listOf("ерте орта ғасырлар", "ерте орта ғасыр дәуірі"), listOf("раннее средневековье")),
        Epoch(listOf("дамыған орта ғасырлар"), listOf("развитое средневековье")),
        Epoch(listOf("кейінгі орта ғасырлар", "кейінгі орта ғасыр дәуірі"), listOf("позднее средневековье")),
        Epoch(listOf("жаңа заман"), listOf("новое время")),
        Epoch(listOf("қазіргі заман"), listOf("новейшее время")),
    )

    /* ---------------- Ғасырлар ---------------- */
    private enum class Part(val kk: String, val ru: String, val ruIn: List<String>) {
        START("басы", "начало", listOf("начало", "в начале", "начале")),
        MIDDLE("ортасы", "середина", listOf("середина", "в середине", "середине")),
        END("соңы", "конец", listOf("конец", "в конце", "конце")),
        FIRST_HALF("бірінші жартысы", "первая половина", listOf("первая половина", "в первой половине", "первой половине")),
        SECOND_HALF("екінші жартысы", "вторая половина", listOf("вторая половина", "во второй половине", "второй половине")),
    }

    /** [from], [to] — рим цифры жазылған күйінде; [abbr] — «ғ.» / «в.» қысқартуы; [bc] — б.з.б. / до н. э. */
    private data class Century(val from: String, val to: String?, val part: Part?, val abbr: Boolean, val bc: Boolean)

    private const val R = """([^\s\d\-–—.,;]+)"""      // рим цифры (кейін romanToken арқылы тексеріледі)
    private const val D = """\s*[-–—]\s*"""
    private val KK_BC = Regex("""^(б\.?\s*з\.?\s*б\.?|біздің заманымызға дейін(гі)?)\s+""")
    private val KK_CENT = Regex("""^$R(?:$D$R)?\s*(ғасырлардың|ғасырдың|ғасырлар|ғасыр|ғғ\.?|ғ\.?)(?:\s+(басы|ортасы|соңы|бірінші жартысы|екінші жартысы))?$""")
    private val RU_BC = Regex("""\s+(до\s*н\.?\s*э\.?|до нашей эры)$""")
    private val RU_CENT = Regex("""^(?:(начало|в начале|начале|середина|в середине|середине|конец|в конце|конце|первая половина|в первой половине|первой половине|вторая половина|во второй половине|второй половине)\s+)?$R(?:$D$R)?\s*(века|веков|век|вв\.?|в\.?)$""")

    private fun roman(s: String?): Boolean = s != null && Sorting.romanToken(s.uppercase(KK)) != null

    private fun parseKkCentury(src: String): Century? {
        var s = src
        val bc = KK_BC.find(s)?.also { s = s.substring(it.range.last + 1) } != null
        val m = KK_CENT.matchEntire(s) ?: return null
        val a = m.groupValues[1]; val b = m.groupValues[2].ifEmpty { null }
        if (!roman(a) || (b != null && !roman(b))) return null
        val noun = m.groupValues[3]
        val part = m.groupValues[4].ifEmpty { null }?.let { p -> Part.entries.first { it.kk == p } }
        return Century(a, b, part, !noun.startsWith("ғас"), bc)
    }

    private fun parseRuCentury(src: String): Century? {
        var s = src
        val bcm = RU_BC.find(s)
        val bc = bcm != null
        if (bcm != null) s = s.substring(0, bcm.range.first)
        val m = RU_CENT.matchEntire(s) ?: return null
        val part = m.groupValues[1].ifEmpty { null }?.let { p -> Part.entries.first { p in it.ruIn } }
        val a = m.groupValues[2]; val b = m.groupValues[3].ifEmpty { null }
        if (!roman(a) || (b != null && !roman(b))) return null
        val noun = m.groupValues[4]
        return Century(a, b, part, !noun.startsWith("век"), bc)
    }

    private fun Century.span() = if (to == null) from else "$from–$to"

    private fun Century.kk(): String {
        val plural = to != null
        val noun = when {
            abbr -> if (plural) "ғғ." else "ғ."
            part != null -> if (plural) "ғасырлардың" else "ғасырдың"
            else -> if (plural) "ғасырлар" else "ғасыр"
        }
        return (if (bc) "б.з.б. " else "") + span() + " " + noun + (part?.let { " " + it.kk } ?: "")
    }

    private fun Century.ru(): String {
        val plural = to != null
        val noun = when {
            abbr -> if (plural) "вв." else "в."
            part != null -> if (plural) "веков" else "века"
            else -> if (plural) "века" else "век"
        }
        return (part?.let { it.ru + " " } ?: "") + span() + " " + noun + if (bc) " до н. э." else ""
    }

    /* ---------------- Бір бөлікті аудару ---------------- */
    private fun lowerOf(s: String, lang: Lang) = s.trim().replace(Regex("\\s+"), " ").lowercase(if (lang == Lang.KK) KK else RU).replace('ё', 'е')

    private fun translatePiece(piece: String, from: Lang): String? {
        val t = lowerOf(piece, from)
        if (t.isEmpty()) return null
        normalize(t)?.let { (kk, ru) -> return if (from == Lang.KK) ru else kk }
        EPOCHS.firstOrNull { e -> t in (if (from == Lang.KK) e.kk else e.ru) }?.let { e -> return if (from == Lang.KK) e.ru[0] else e.kk[0] }
        // Ғасыр: рим цифры жазылған күйінде қалуы үшін бастапқы мәтіннен (тек бос орындары қысқартылған) талданады
        val raw = piece.trim().replace(Regex("\\s+"), " ")
        val c = if (from == Lang.KK) parseKkCentury(lowerKeepRoman(raw, KK)) else parseRuCentury(lowerKeepRoman(raw, RU))
        return c?.let { if (from == Lang.KK) it.ru() else it.kk() }
    }

    /** Мәтін кіші әріпке келтіріледі, бірақ рим цифры болуы мүмкін сөздер (бас әріппен жазылған) өзгермейді. */
    private fun lowerKeepRoman(s: String, loc: Locale): String =
        Regex("""[\p{L}Ⅰ-ⅿ]+""").replace(s) { m -> if (Sorting.romanToken(m.value) != null) m.value else m.value.lowercase(loc) }

    /** Бүкіл мәтінді екінші тілге аудару: барлық бөлігі танылса — нәтиже, әйтпесе null. */
    fun translate(text: String, from: Lang): String? {
        val src = text.trim()
        if (src.isEmpty()) return null
        val pieces = src.split(Regex("""\s*[,;]\s*"""))
        val out = pieces.map { piece ->
            // Аралық сызықпен (бос орынмен) бөлінген бөліктер: «XIX ғасырдың соңы – XX ғасырдың басы»
            val sub = piece.split(Regex("""\s+[-–—]\s+"""))
            sub.map { translatePiece(it, from) ?: return null }.joinToString(" – ")
        }.joinToString(", ")
        return capitalizeLike(src, out, if (from == Lang.KK) RU else KK)
    }

    /** Бастапқы мәтін бас әріптен басталса — аударма да. */
    private fun capitalizeLike(src: String, out: String, loc: Locale): String {
        val first = src.firstOrNull { it.isLetter() } ?: return out
        if (!first.isUpperCase() || Sorting.romanToken(src.takeWhile { it.isLetter() }) != null) return out
        val i = out.indexOfFirst { it.isLetter() }
        return if (i < 0) out else out.substring(0, i) + out.substring(i, i + 1).uppercase(loc) + out.substring(i + 1)
    }

    /**
     * Синхрондау: [edited] тіліндегі мән танылса — екінші тілдің мәні құрылады. Екінші тілде қолмен жазылған,
     * танылмайтын мәтін болса — ол өзгертілмейді (пайдаланушының аудармасы сақталады).
     * Жыл/аралық жазылса, екі тілдің мәні де толық түрге келтіріледі («1967» → «1967 жыл» / «1967 год»).
     */
    fun sync(p: Localized, edited: Lang): Localized {
        val src = p[edited].ifBlank { p[edited.other] }
        val lang = if (p[edited].isBlank()) edited.other else edited
        normalize(src)?.let { (kk, ru) -> return Localized(kk, ru) }
        val tr = translate(src, lang) ?: return p
        val target = p[lang.other]
        if (target.isNotBlank() && translate(target, lang.other) == null) return p
        return p.with(lang.other, tr)
    }
}
