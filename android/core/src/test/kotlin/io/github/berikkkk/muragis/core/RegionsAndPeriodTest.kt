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
    }

    private fun kk2ru(s: String) = Periods.translate(s, Lang.KK)
    private fun ru2kk(s: String) = Periods.translate(s, Lang.RU)

    @Test fun epochsTranslateBothWays() {
        assertEquals("Каменный век", kk2ru("Тас дәуірі"))
        assertEquals("Эпоха бронзы", kk2ru("Қола дәуірі"))
        assertEquals("Эпоха раннего железа", kk2ru("Ерте темір дәуірі"))
        assertEquals("Эпоха средневековья", kk2ru("Орта ғасыр дәуірі"))
        assertEquals("Ерте темір дәуірі", ru2kk("Эпоха раннего железа"))
        assertEquals("тас дәуірі", ru2kk("каменный век"))
        assertEquals("Орта ғасыр дәуірі", ru2kk("Эпоха средневековья"))
    }

    @Test fun centuriesWithCasesAndRomanInAnyAlphabet() {
        assertEquals("XX век", kk2ru("XX ғасыр"))
        assertEquals("ХХ век", kk2ru("ХХ ғасыр"))                       // кириллица Х
        assertEquals("начало XX века", kk2ru("XX ғасырдың басы"))
        assertEquals("середина ХХ века", kk2ru("ХХ ғасырдың ортасы"))
        assertEquals("конец XIX века", kk2ru("XIX ғасырдың соңы"))
        assertEquals("вторая половина XIX века", kk2ru("XIX ғасырдың екінші жартысы"))
        assertEquals("XVII–XIX века", kk2ru("XVII-XIX ғасырлар"))
        assertEquals("конец XVII–XIX веков", kk2ru("XVII–XIX ғасырлардың соңы"))
        assertEquals("VII–IV века до н. э.", kk2ru("б.з.б. VII–IV ғасырлар"))
        assertEquals("ІҮ в.", kk2ru("ІҮ ғ."))                           // ІҮ = IV (кириллица)
        assertEquals("XX ғасырдың басы", ru2kk("начало XX века"))
        assertEquals("XX ғасырдың соңы", ru2kk("в конце XX века"))
        assertEquals("б.з.б. VII–IV ғасырлар", ru2kk("VII–IV века до н. э."))
        assertEquals("XIX ғ.", ru2kk("XIX в."))
        assertEquals("Ерте темір дәуірі, б.з.б. V ғасыр", ru2kk("Эпоха раннего железа, V век до н. э."))
        assertEquals("конец XIX века – начало XX века", kk2ru("XIX ғасырдың соңы – XX ғасырдың басы"))
        assertNull(kk2ru("Сүткент қорымы"))
        assertNull(kk2ru("СМ ғасыр"))                                    // рим цифры емес
    }

    @Test fun syncKeepsManualTranslation() {
        assertEquals(Localized("Қола дәуірі", "Эпоха бронзы"), Periods.sync(Localized("Қола дәуірі", ""), Lang.KK))
        // Орысшасы қолмен жазылған (танылмайды) — өзгермейді
        val manual = Localized("Қола дәуірі", "андроновская культура")
        assertEquals(manual, Periods.sync(manual, Lang.KK))
        // Танылатын ескі аударма жаңарады
        assertEquals(Localized("XX ғасыр", "XX век"), Periods.sync(Localized("XX ғасыр", "XIX век"), Lang.KK))
        assertEquals(Localized("начало XX века", "начало XX века").copy(kk = "XX ғасырдың басы"), Periods.sync(Localized("", "начало XX века"), Lang.RU))
    }
}
