package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.model.Sorting
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CoordsAndSortTest {
    private fun one(s: String) = (Coords.parseOne(s) as Coords.One.Ok).v

    @Test fun decimalAndDms() {
        assertEquals(50.412345, one("50.412345"), 1e-9)
        assertEquals(50.412345, one("50,412345"), 1e-9)
        assertEquals(50 + 24.7407 / 60, one("50°24.7407′"), 1e-9)
        assertEquals(50 + 24 / 60.0 + 44.44 / 3600, one("50°24′44,44″"), 1e-9)
        assertEquals(50 + 24 / 60.0 + 44.44 / 3600, one("50 24 44.44 с.ш."), 1e-9)
        assertEquals(-57.1, one("-57.1"), 1e-9)
        assertEquals(-57.1, one("W57.1"), 1e-9)
        assertTrue(Coords.parseOne("50 61") is Coords.One.Err)
    }

    @Test fun pairs() {
        val p = Coords.parseLine("N50°24′44″ E57°10′00″") as Coords.Pair.Ok
        assertEquals(50 + 24 / 60.0 + 44 / 3600.0, p.lat, 1e-9)
        assertEquals(57 + 10 / 60.0, p.lon, 1e-9)
        // Қазақстан шегінде ауысып кеткен ендік/бойлық түзетіледі
        val s = Coords.parsePair("68.12", "42.65") as Coords.Pair.Ok
        assertTrue(s.swapped); assertEquals(42.65, s.lat, 1e-9)
        val q = Coords.parseLine("42.651234, 68.123456") as Coords.Pair.Ok
        assertEquals(68.123456, q.lon, 1e-9)
        assertEquals("50°24′44,44″", Coords.dms(50 + 24 / 60.0 + 44.44 / 3600))
    }

    @Test fun romanSortingLikeDesktop() {
        assertEquals("Қабантау-4 қорғаны", Sorting.arabizeRoman("Қабантау-ІҮ қорғаны"))
        assertEquals("Х. Досмұхамедұлы", Sorting.arabizeRoman("Х. Досмұхамедұлы"))
        val names = listOf("Қабантау-V қорғаны", "Қабантау-IV қорғаны", "Әулие ата", "Арыс", "Қабантау-ХІ")
        assertEquals(listOf("Арыс", "Әулие ата", "Қабантау-IV қорғаны", "Қабантау-V қорғаны", "Қабантау-ХІ"), names.sortedWith(Sorting::compareNames))
    }

    @Test fun distanceMatchesDesktopFormula() {
        // routes/graph.js dist([42.3, 69.6], [42.5, 68.9]) — Node-та есептелген мән
        val d = Geo.distance(42.3, 69.6, 42.5, 68.9)
        assertEquals(61_441.0, d, 300.0)
        assertEquals(0.0, Geo.length(listOf(LatLon(1.0, 1.0))), 0.0)
    }
}
