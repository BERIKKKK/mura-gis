package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Periods
import io.github.berikkkk.muragis.core.model.Regions
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RegionsAndPeriodTest {
    /** Android тізімі жұмыс үстеліндегі src/js/regions.js-пен (атаулар, орысшасы, реті) бірдей. */
    @Test fun regionsMatchDesktop() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        val d = Json.parseToJsonElement(TestUtil.desktop("regions")).jsonArray
        assertEquals(d.size, Regions.list.size)
        d.forEachIndexed { i, el ->
            val o = el.jsonObject; val r = Regions.list[i]
            assertEquals(o["kk"]!!.jsonPrimitive.content, r.kk)
            assertEquals(o["ru"]!!.jsonPrimitive.content, r.ru)
            assertEquals(o["city"]!!.jsonPrimitive.boolean, r.city)
            val us = o["units"]!!.jsonArray
            assertEquals(r.kk, us.size, r.units.size)
            us.forEachIndexed { j, u ->
                assertEquals(u.jsonObject["kk"]!!.jsonPrimitive.content, r.units[j].kk)
                assertEquals(u.jsonObject["ru"]!!.jsonPrimitive.content, r.units[j].ru)
                assertEquals(u.jsonObject["note"]!!.jsonPrimitive.content, r.units[j].noteKk)
            }
        }
    }

    @Test fun findByEitherLanguage() {
        assertEquals("Ақтөбе облысы", Regions.find("Актюбинская область")!!.kk)
        val r = Regions.find("Ақтөбе облысы")
        assertEquals("город Актобе", Regions.findUnit(r, "Ақтөбе қаласы")!!.ru)
        assertNull(Regions.find("Жоқ облыс"))
    }

    @Test fun periodYearSyncsBothLanguages() {
        assertEquals(Localized("1967 жыл", "1967 год"), Periods.sync(Localized("1967", ""), Lang.KK))
        assertEquals(Localized("1967 жыл", "1967 год"), Periods.sync(Localized("", "1967 г."), Lang.RU))
        assertEquals(Localized("1941–1945 жж.", "1941–1945 гг."), Periods.sync(Localized("1941-1945", "x"), Lang.KK))
        // Мәтін — өзгермейді
        val t = Localized("Қола дәуірі", "Бронзовый век")
        assertEquals(t, Periods.sync(t, Lang.KK))
    }
}
