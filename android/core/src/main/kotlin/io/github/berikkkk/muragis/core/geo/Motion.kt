package io.github.berikkkk.muragis.core.geo

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/** Қозғалыс режимі: тұр / жаяу / көлікпен. */
enum class MotionMode { STILL, WALK, DRIVE }

/**
 * [mode] — қазіргі режим; [course] — соңғы сенімді қозғалыс бағыты (градус, солтүстіктен сағат тілімен),
 * әлі белгісіз болса null. Тоқтағанда бағыт сақталады (карта кенет бұрылмауы үшін).
 */
data class Motion(val mode: MotionMode = MotionMode.STILL, val course: Float? = null, val speed: Float = 0f)

/**
 * GPS нүктелерінен қозғалыс режимін анықтау (интернетсіз — тек GPS нүктелері, Доплер жылдамдығы болса — соны пайдаланады).
 *
 * GPS ауытқуы режимді жиі ауыстырмауы үшін:
 * - жылдамдық — соңғы бірнеше нүктенің медианасы (жалғыз «секіріс» әсер етпейді);
 * - ауысу шегі екеу (гистерезис) және шарт белгілі бір уақыт бойы үздіксіз орындалуы керек;
 * - көліктен шығу ұзақ күтеді — бағдаршамда тұрғанда үшбұрыш нүктеге айналып кетпейді;
 * - дәлдігі нашар нүкте (желі нүктесі т.б.) жылдамдықты өсірмейді.
 *
 * Уақыт — монотонды сағат ([tMs], мыс. `Location.elapsedRealtimeNanos / 1e6`), жүйелік уақыт емес.
 */
class MotionClassifier {
    private var mode = MotionMode.STILL
    private var course: Double? = null
    private val speeds = ArrayDeque<Pair<Long, Float>>()
    private var lastT = Long.MIN_VALUE
    private var lastGoodT = 0L
    private var lastLat = 0.0; private var lastLon = 0.0; private var lastAcc = 0f; private var hasLast = false
    /** Режимді ауыстыру шарты қашаннан бері орындалып тұр (кандидат режим және басталған уақыты). */
    private var candidate: MotionMode? = null
    private var candidateSince = 0L

    fun reset() {
        mode = MotionMode.STILL; course = null; speeds.clear(); lastT = Long.MIN_VALUE; hasLast = false; candidate = null
    }

    fun update(tMs: Long, lat: Double, lon: Double, accuracy: Float, speed: Float?, bearing: Float?): Motion {
        // Уақыт кері кетсе не ұзақ үзіліс болса (мыс. GPS өшіп-қосылды) — жиналған жылдамдықтар ескі
        if (lastT != Long.MIN_VALUE && (tMs <= lastT || tMs - lastT > GAP_MS)) {
            if (tMs <= lastT) return current()
            // Үзілістен кейінгі жағдай белгісіз (мыс. қолданба фонда болды) — «тұр»-дан қайта бастаймыз, бағыт сақталады
            speeds.clear(); candidate = null; hasLast = false; mode = MotionMode.STILL
        }
        lastT = tMs
        val good = accuracy <= MAX_ACC
        // Жылдамдық: GPS-тің өз (Доплер) жылдамдығы, жоқ болса — екі дәл нүкте арасындағы ығысудан.
        // Дәлдігі нашар нүкте есепке алынбайды (желі нүктесінің секірісі «жылдамдық» болып көрінбеуі үшін).
        val v: Float? = when {
            !good -> null
            speed != null -> speed
            hasLast -> {
                val dt = (tMs - lastGoodT) / 1000.0
                // Нүктелердің дәлдігінен кіші ығысу — шу, жылдамдық деп саналмайды
                val d = (distM(lastLat, lastLon, lat, lon) - (accuracy + lastAcc) / 2).coerceAtLeast(0.0)
                if (dt > 0) (d / dt).toFloat() else null
            }
            else -> null
        }
        // Бағыт үшін ығысудан есептелген курс (GPS бағыты жоқ болса)
        val moveBrg = if (hasLast && good && distM(lastLat, lastLon, lat, lon) >= MIN_COURSE_M) bearingDeg(lastLat, lastLon, lat, lon) else null
        if (good) { lastLat = lat; lastLon = lon; lastAcc = accuracy; lastGoodT = tMs; hasLast = true }

        if (v != null) speeds.addLast(tMs to v)
        while (speeds.size > WINDOW || (speeds.isNotEmpty() && tMs - speeds.first().first > WINDOW_MS)) speeds.removeFirst()
        val med = median()

        // Режим: гистерезис + уақыт бойы ұсталуы керек
        val want = when (mode) {
            MotionMode.STILL -> when { med >= DRIVE_ENTER -> MotionMode.DRIVE; med >= STILL_EXIT -> MotionMode.WALK; else -> MotionMode.STILL }
            MotionMode.WALK -> when { med >= DRIVE_ENTER -> MotionMode.DRIVE; med < WALK_EXIT -> MotionMode.STILL; else -> MotionMode.WALK }
            MotionMode.DRIVE -> when { med >= DRIVE_EXIT -> MotionMode.DRIVE; med >= WALK_EXIT -> MotionMode.WALK; else -> MotionMode.STILL }
        }
        if (want == mode) candidate = null
        else {
            // «Ұсталу» уақыты ауысу бағыты (жоғары/төмен) өзгермесе жалғасады; ауысқанда — соңғы қалаған режимге
            val c = candidate
            if (c == null || (c > mode) != (want > mode)) candidateSince = tMs
            candidate = want
            val need = when {
                mode == MotionMode.DRIVE -> DRIVE_HOLD_EXIT_MS
                want == MotionMode.DRIVE -> DRIVE_HOLD_ENTER_MS
                want > mode -> WALK_HOLD_ENTER_MS
                else -> WALK_HOLD_EXIT_MS
            }
            if (tMs - candidateSince >= need) { mode = want; candidate = null }
        }

        // Бағыт: тек жүріп келе жатқанда жаңарады (баяулағанда GPS бағыты кездейсоқ болады)
        val inst = v ?: med
        if (mode != MotionMode.STILL && inst >= COURSE_MIN_SPEED) {
            val b = if (bearing != null && speed != null && good) bearing.toDouble() else moveBrg
            if (b != null) {
                val k = if (mode == MotionMode.DRIVE) 0.6 else 0.35
                course = course?.let { c -> circMix(c, b, k) } ?: norm(b)
            }
        }
        return current()
    }

    fun current() = Motion(mode, course?.toFloat(), median())

    private fun median(): Float {
        if (speeds.isEmpty()) return 0f
        val s = speeds.map { it.second }.sorted()
        val n = s.size
        return if (n % 2 == 1) s[n / 2] else (s[n / 2 - 1] + s[n / 2]) / 2
    }

    companion object {
        /** STILL → WALK, м/с (~3,2 км/сағ). */
        const val STILL_EXIT = 0.9f
        /** WALK → STILL, м/с. */
        const val WALK_EXIT = 0.5f
        /** → DRIVE, м/с (18 км/сағ; жүгіру мен жаяу жүру бұдан төмен). */
        const val DRIVE_ENTER = 5.0f
        /** DRIVE → төменгі режим, м/с (~9 км/сағ: кептелісте баяу жүру көлік болып қалады). */
        const val DRIVE_EXIT = 2.5f
        const val WALK_HOLD_ENTER_MS = 3_000L
        const val WALK_HOLD_EXIT_MS = 5_000L
        const val DRIVE_HOLD_ENTER_MS = 4_000L
        /** Көліктен шығу: бағдаршамда, кептелісте тұру — көліктегі күй (белгі ауыспайды). */
        const val DRIVE_HOLD_EXIT_MS = 40_000L
        /** Дәлдігі бұдан нашар нүкте жылдамдықты өсірмейді, м. */
        const val MAX_ACC = 30f
        const val WINDOW = 5
        const val WINDOW_MS = 8_000L
        const val GAP_MS = 20_000L
        const val MIN_COURSE_M = 3.0
        const val COURSE_MIN_SPEED = 0.8f

        fun norm(a: Double) = ((a % 360) + 360) % 360

        /** Екі бұрышты бірлік шеңбер арқылы араластыру (359° мен 1°-тың ортасы — 0°). */
        fun circMix(a: Double, b: Double, k: Double): Double {
            val ra = Math.toRadians(a); val rb = Math.toRadians(b)
            return norm(Math.toDegrees(atan2((1 - k) * sin(ra) + k * sin(rb), (1 - k) * cos(ra) + k * cos(rb))))
        }

        fun distM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val x = Math.toRadians(lon2 - lon1) * cos(Math.toRadians((lat1 + lat2) / 2))
            val y = Math.toRadians(lat2 - lat1)
            return hypot(x, y) * 6_371_000.0
        }

        fun bearingDeg(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val x = Math.toRadians(lon2 - lon1) * cos(Math.toRadians((lat1 + lat2) / 2))
            val y = Math.toRadians(lat2 - lat1)
            if (abs(x) < 1e-12 && abs(y) < 1e-12) return 0.0
            return norm(Math.toDegrees(atan2(x, y)))
        }
    }
}
