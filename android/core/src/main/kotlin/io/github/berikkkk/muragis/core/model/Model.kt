package io.github.berikkkk.muragis.core.model

import java.security.SecureRandom
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Деректер тілі. Интерфейс тілінен тәуелсіз таңдалады. */
enum class Lang(val code: String) {
    KK("kk"), RU("ru");

    val other: Lang get() = if (this == KK) RU else KK

    companion object {
        fun of(code: String?): Lang = entries.firstOrNull { it.code == code?.lowercase() } ?: KK
    }
}

/**
 * Бір мәтіндік өрістің қазақша және орысша мәндері.
 * Әр тіл — бөлек мән: бір тілді өзгерту екіншісіне тимейді (тек [with] арқылы, нақты тілге).
 */
data class Localized(val kk: String = "", val ru: String = "") {
    operator fun get(lang: Lang): String = if (lang == Lang.KK) kk else ru

    /** Тек [lang] тіліндегі мәнді ауыстырады; екінші тілдің мәні өзгермейді. */
    fun with(lang: Lang, value: String): Localized = if (lang == Lang.KK) copy(kk = value) else copy(ru = value)

    /** Көрсету үшін: таңдалған тілде бос болса — екінші тілдегі мән (fallback). */
    fun display(lang: Lang): String = get(lang).ifBlank { get(lang.other) }

    fun isBlank(): Boolean = kk.isBlank() && ru.isBlank()

    fun matches(query: String): Boolean =
        kk.contains(query, ignoreCase = true) || ru.contains(query, ignoreCase = true)

    companion object {
        val EMPTY = Localized()
        fun of(lang: Lang, value: String) = EMPTY.with(lang, value)
    }
}

/** «Тарихи-мәдени мұра объектілерін қорғау және пайдалану туралы» Заңның 5-бабы — ескерткіш түрлері (жұмыс үстеліндегі кодтар). */
enum class MonumentType(val code: String, val kk: String, val ru: String) {
    ARCHEO("archeo", "Археология ескерткіштері", "Памятники археологии"),
    ARCH("arch", "Қала құрылысы және сәулет ескерткіштері", "Памятники градостроительства и архитектуры"),
    ENSEMBLE("ensemble", "Ансамбльдер мен кешендер", "Ансамбли и комплексы"),
    SACRED("sacred", "Киелі объектілер", "Сакральные объекты"),
    ART("art", "Монументтік өнер құрылыстары", "Сооружения монументального искусства");

    fun label(lang: Lang) = if (lang == Lang.KK) kk else ru

    companion object {
        fun of(code: String?) = entries.firstOrNull { it.code == code } ?: ARCHEO
        fun byLabel(label: String?) = entries.firstOrNull { it.kk == label || it.ru == label }
    }
}

/** 6-бап — санаттар. Түстер жұмыс үстеліндегі белгілермен бірдей. */
enum class Category(val code: String, val kk: String, val ru: String, val fill: Long, val outline: Long, val order: Int) {
    INTL("intl", "Халықаралық маңызы бар", "Международного значения", 0xFF8E3FC4, 0xFF3E1460, 0),
    REP("rep", "Республикалық маңызы бар", "Республиканского значения", 0xFFE0202E, 0xFF6B0710, 1),
    LOCAL("local", "Жергілікті маңызы бар", "Местного значения", 0xFFF28C00, 0xFF7A4100, 2),
    NONE("", "Анықталмаған", "Не определена", 0xFF8E8A80, 0xFF3F3B35, 3);

    fun label(lang: Lang) = if (lang == Lang.KK) kk else ru

    companion object {
        fun of(code: String?) = entries.firstOrNull { it.code == (code ?: "") } ?: NONE
        fun byLabel(label: String?) = entries.firstOrNull { it.kk == label || it.ru == label }
    }
}

/** 3–5-баптар — құқықтық мәртебе. */
enum class Status(val code: String, val kk: String, val ru: String) {
    STATE("state", "Тарих және мәдениет ескерткіші (Мемлекеттік тізімге енгізілген)", "Памятник истории и культуры (включён в Государственный список)"),
    PRELIM("prelim", "Алдын ала есепке алу тізіміне енгізілген объект", "Объект, включённый в список предварительного учёта"),
    ARCHREG("archreg", "Археологиялық жұмыстар барысында анықталған объект (тізілімде)", "Объект, выявленный в ходе археологических работ (в реестре)"),
    EXCLUDED("excluded", "Мәртебесінен айырылған (Мемлекеттік тізімнен алып тасталған)", "Лишён статуса (исключён из Государственного списка)");

    fun label(lang: Lang) = if (lang == Lang.KK) kk else ru

    companion object {
        fun of(code: String?) = entries.firstOrNull { it.code == code } ?: STATE
        fun byLabel(label: String?) = entries.firstOrNull { it.kk == label || it.ru == label }
    }
}

/**
 * Ескерткіш (жұмыс үстеліндегі «белгі», gpkg marks қабаты).
 * Мәтіндік өрістер екі тілде; type/category/status — тілге тәуелсіз кодтар.
 * [extra] — басқа бағдарламадан келген, бізге белгісіз қасиеттер (JSON нысаны мәтін түрінде): экспортта жоғалмайды.
 */
data class Monument(
    val id: String = Ids.newId(),
    val lat: Double,
    val lon: Double,
    val name: Localized = Localized.EMPTY,
    val period: Localized = Localized.EMPTY,
    val oblast: Localized = Localized.EMPTY,
    val district: Localized = Localized.EMPTY,
    val place: Localized = Localized.EMPTY,
    val note: Localized = Localized.EMPTY,
    val type: MonumentType = MonumentType.ARCHEO,
    val category: Category = Category.NONE,
    val status: Status = Status.STATE,
    val createdAt: String = "",
    val createdBy: String = "",
    val updatedAt: String = "",
    val updatedBy: String = "",
    val extra: String = "",
)

/**
 * Өзге нысанның түрі — ескерткіш емес, бірақ далада бағдар болатын нысандар. Кодтар жұмыс үстеліндегімен бірдей
 * (main/places.js); тізімге жаңа түр тек соңына қосылады, бар код өзгертілмейді.
 */
enum class PlaceKind(val code: String, val kk: String, val ru: String) {
    SETTLEMENT("settlement", "Елді мекен", "Населённый пункт"),
    QYSTAU("qystau", "Қыстау", "Зимовка (қыстау)"),
    ZHAILAU("zhailau", "Жайлау", "Летнее пастбище (жайлау)"),
    KUZEU("kuzeu", "Күзеу", "Осеннее стойбище (күзеу)"),
    KOKTEU("kokteu", "Көктеу", "Весеннее стойбище (көктеу)"),
    TURAQ("turaq", "Тұрақ", "Стоянка"),
    WELL("well", "Құдық", "Колодец"),
    SPRING("spring", "Бұлақ", "Родник"),
    OTHER("other", "Басқа", "Другое");

    fun label(lang: Lang) = if (lang == Lang.KK) kk else ru

    companion object {
        fun of(code: String?) = entries.firstOrNull { it.code == code } ?: OTHER
        fun byLabel(label: String?) = entries.firstOrNull { it.kk == label || it.ru == label }
    }
}

/**
 * Өзге нысан (елді мекен, қыстау, құдық…): тек түрі, атауы (міндетті емес) және координатасы.
 * Ескерткіштерден бөлек сақталады (жұмыс үстелі: жобаның places қабаты). [extra] — бізге белгісіз қасиеттер.
 */
data class Place(
    val id: String = Ids.newId(),
    val lat: Double,
    val lon: Double,
    val name: Localized = Localized.EMPTY,
    val kind: PlaceKind = PlaceKind.OTHER,
    val createdAt: String = "",
    val createdBy: String = "",
    val updatedAt: String = "",
    val updatedBy: String = "",
    val extra: String = "",
) {
    /** Көрсетілетін атау: атауы бос болса — түрінің атауы. */
    fun title(lang: Lang): String = name.display(lang).ifBlank { kind.label(lang) }
}

/** Маршрут нүктесі; [monumentId] бар болса — нүкте ескерткішке байланған. */
data class RoutePoint(val lat: Double, val lon: Double, val monumentId: String? = null)

enum class Vehicle(val code: String) {
    CAR("car"), OFFROAD("4x4"), FOOT("foot");

    companion object { fun of(code: String?) = entries.firstOrNull { it.code == code } ?: OFFROAD }
}

enum class Season(val code: String) {
    ALL("all"), DRY("dry");

    companion object { fun of(code: String?) = entries.firstOrNull { it.code == code } ?: ALL }
}

/** Маршрут (жұмыс үстеліндегі routes қабатымен үйлесімді). */
data class Route(
    val id: String = Ids.newId(),
    val name: Localized = Localized.EMPTY,
    val aName: Localized = Localized.EMPTY,
    val bName: Localized = Localized.EMPTY,
    val note: Localized = Localized.EMPTY,
    val vehicle: Vehicle = Vehicle.OFFROAD,
    val season: Season = Season.ALL,
    val checked: String = "",
    val points: List<RoutePoint> = emptyList(),
    val createdAt: String = "",
    val createdBy: String = "",
    val updatedAt: String = "",
    val updatedBy: String = "",
    val extra: String = "",
)

object Ids {
    private val rnd = SecureRandom()
    private val ID = Regex("^[0-9a-f]{16}$")

    /** Жұмыс үстеліндегідей 16 таңбалы hex идентификатор (8 кездейсоқ байт). */
    fun newId(): String {
        val b = ByteArray(8)
        rnd.nextBytes(b)
        return b.joinToString("") { "%02x".format(it) }
    }

    fun isValid(id: String?) = id != null && ID.matches(id)

    private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    /** JavaScript-тің toISOString() пішімі (миллисекундпен, UTC) — жұмыс үстеліндегі updated_at-пен салыстыруға жарайды. */
    fun now(): String = ISO.format(Instant.now())
}
