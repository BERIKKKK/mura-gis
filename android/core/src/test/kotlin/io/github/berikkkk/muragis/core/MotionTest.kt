package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.geo.MotionClassifier
import io.github.berikkkk.muragis.core.geo.MotionMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos

class MotionTest {
    /** 1 с сайынғы GPS нүктелерін жасайды: [speeds] — әр секундтағы жылдамдық (м/с), бағыты [brg]. */
    private class Sim(val c: MotionClassifier = MotionClassifier()) {
        var t = 0L; var lat = 50.0; var lon = 57.0
        fun step(v: Float, brg: Double = 90.0, acc: Float = 5f, withSpeed: Boolean = true, jitterM: Double = 0.0) =
            run {
                t += 1000
                val r = Math.toRadians(brg)
                lat += v * cos(r) / 111_320.0
                lon += v * kotlin.math.sin(r) / (111_320.0 * cos(Math.toRadians(lat)))
                val jl = jitterM / 111_320.0 * (if (t / 1000 % 2 == 0L) 1 else -1)
                c.update(t, lat + jl, lon, acc, if (withSpeed) v else null, if (withSpeed && v > 0) brg.toFloat() else null)
            }
        fun run(n: Int, v: Float, brg: Double = 90.0, acc: Float = 5f, withSpeed: Boolean = true, jitterM: Double = 0.0) =
            (1..n).map { step(v, brg, acc, withSpeed, jitterM) }.last()
    }

    @Test fun standingStaysStillDespiteJitter() {
        val s = Sim()
        // Тұрған кезде GPS 0–0,8 м/с «жылдамдық» және бірнеше метр ауытқу береді — режим ауыспауы керек
        repeat(60) { i -> s.step(if (i % 7 == 3) 1.6f else (i % 4) * 0.2f, jitterM = 3.0) }
        assertEquals(MotionMode.STILL, s.c.current().mode)
        assertNull(s.c.current().course)
    }

    @Test fun walkThenStop() {
        val s = Sim()
        s.run(2, 1.3f)
        assertEquals("бірден ауыспайды", MotionMode.STILL, s.c.current().mode)
        val m = s.run(6, 1.3f, brg = 45.0)
        assertEquals(MotionMode.WALK, m.mode)
        assertNotNull(m.course)
        s.run(2, 0f)
        assertEquals(MotionMode.WALK, s.c.current().mode)
        val st = s.run(10, 0f)
        assertEquals(MotionMode.STILL, st.mode)
        // Тоқтағанда соңғы бағыт сақталады
        assertEquals(45f, st.course!!, 5f)
    }

    @Test fun driveSurvivesTrafficLight() {
        val s = Sim()
        val d = s.run(15, 12f, brg = 180.0)
        assertEquals(MotionMode.DRIVE, d.mode)
        assertEquals(180f, d.course!!, 1f)
        // Бағдаршамда 30 с тұру — белгі әлі көліктікі
        assertEquals(MotionMode.DRIVE, s.run(30, 0f).mode)
        // Ұзақ тоқтау — «тұр»
        assertEquals(MotionMode.STILL, s.run(20, 0f).mode)
    }

    @Test fun singleSpeedSpikeDoesNotSwitchToDrive() {
        val s = Sim()
        s.run(10, 1.2f)
        assertEquals(MotionMode.WALK, s.c.current().mode)
        s.step(20f); s.step(1.2f); s.step(15f)
        assertEquals(MotionMode.WALK, s.run(10, 1.2f).mode)
    }

    @Test fun noDopplerSpeedUsesDisplacement() {
        val s = Sim()
        val m = s.run(20, 12f, brg = 270.0, withSpeed = false)
        assertEquals(MotionMode.DRIVE, m.mode)
        assertEquals(270f, m.course!!, 3f)
    }

    @Test fun longGapRestartsFromStill() {
        val s = Sim()
        assertEquals(MotionMode.DRIVE, s.run(15, 12f).mode)
        // Қолданба 5 минут фонда болды — қайта ашылғанда адам тұр
        s.t += 300_000
        val m = s.run(3, 0f)
        assertEquals(MotionMode.STILL, m.mode)
        assertNotNull("бағыт сақталады", m.course)
    }

    @Test fun poorAccuracyFixesIgnored() {
        val s = Sim()
        // Желі нүктелері: дәлдігі 100 м, секіріп тұрады — қозғалыс деп саналмайды
        repeat(30) { i -> s.c.update(1000L * (i + 1), 50.0 + (i % 2) * 0.001, 57.0, 100f, null, null) }
        assertEquals(MotionMode.STILL, s.c.current().mode)
    }

    @Test fun courseWrapsAroundNorth() {
        assertTrue(MotionClassifier.circMix(359.0, 1.0, 0.5).let { it < 0.5 || it > 359.5 })
        assertEquals(90.0, MotionClassifier.bearingDeg(50.0, 57.0, 50.0, 57.01), 0.5)
    }
}
