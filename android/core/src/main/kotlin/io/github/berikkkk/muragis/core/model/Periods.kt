package io.github.berikkkk.muragis.core.model

/**
 * Мерзім өрісі: жыл не жылдар аралығы жазылса — екі тілдегі мәні бірге қойылады.
 *   «1967», «1967 ж.», «1967 жыл», «1967 г.», «1967 год» → kk «1967 жыл», ru «1967 год»
 *   «1941–1945», «1941-1945 жж.», «1941–1945 гг.»      → kk «1941–1945 жж.», ru «1941–1945 гг.»
 * Басқа мәтін («Қола дәуірі», «XIX ғ.») өзгермейді — оны әр тілде өзі жазады.
 */
object Periods {
    private val YEAR = Regex("""^\s*(\d{1,4})\s*(ж\.?|жыл|г\.?|год)?\s*$""", RegexOption.IGNORE_CASE)
    private val RANGE = Regex("""^\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(жж\.?|жылдар|гг\.?|годы)?\s*$""", RegexOption.IGNORE_CASE)

    /** Жыл/аралық болса — (kk, ru), әйтпесе null. */
    fun normalize(text: String): Pair<String, String>? {
        YEAR.matchEntire(text)?.let { m -> val y = m.groupValues[1]; return "$y жыл" to "$y год" }
        RANGE.matchEntire(text)?.let { m -> val r = m.groupValues[1] + "–" + m.groupValues[2]; return "$r жж." to "$r гг." }
        return null
    }

    /** [edited] тіліндегі мән жыл/аралық болса — екі тіл де соған сай қойылады; әйтпесе мән өзгеріссіз қайтады. */
    fun sync(p: Localized, edited: Lang): Localized {
        val src = p[edited].ifBlank { p[edited.other] }
        val n = normalize(src) ?: return p
        return Localized(n.first, n.second)
    }
}
