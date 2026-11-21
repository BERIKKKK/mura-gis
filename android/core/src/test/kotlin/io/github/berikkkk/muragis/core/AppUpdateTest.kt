package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.update.AppUpdate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Properties

class AppUpdateTest {

    @Test
    fun versionCodesFollowVersionProperties() {
        assertEquals(9901, AppUpdate.versionCode("1.0.0-alpha.1"))
        assertEquals(9902, AppUpdate.versionCode("1.0.0-alpha.2"))
        assertEquals(19901, AppUpdate.versionCode("2.0.0-alpha.1"))
        assertEquals(10000, AppUpdate.versionCode("1.0.0"))
        assertTrue(AppUpdate.versionCode("2.0.0-beta.1")!! > AppUpdate.versionCode("2.0.0-alpha.9")!!)
        assertTrue(AppUpdate.versionCode("2.0.0")!! > AppUpdate.versionCode("2.0.0-rc.2")!!)
        assertNull(AppUpdate.versionCode("v1.4.1-x"))
        // Қолданбаның өз нұсқасы да осы ережеге сай болуы керек (әйтпесе жаңарту дұрыс салыстырылмайды)
        val p = Properties().apply { File("../version.properties").inputStream().use { load(it) } }
        assertEquals(p.getProperty("versionCode").toInt(), AppUpdate.versionCode(p.getProperty("versionName")))
    }

    private val json = """
        [
          {"tag_name":"v1.4.1","draft":false,"prerelease":false,"html_url":"https://github.com/x/r/v1.4.1","assets":[]},
          {"tag_name":"android/v2.0.0-alpha.1","draft":false,"prerelease":true,"html_url":"https://github.com/x/a2",
           "assets":[{"name":"MuraGIS-Android-2.0.0-alpha.1.apk","size":45871152,"browser_download_url":"https://github.com/x/a2.apk"}]},
          {"tag_name":"android/v9.0.0","draft":true,"assets":[]},
          {"tag_name":"maps-kobda-2026-11-20","draft":false,"assets":[]},
          {"tag_name":"android/v1.0.0-alpha.2","draft":false,"prerelease":false,"html_url":"https://github.com/x/a1","assets":[]}
        ]
    """.trimIndent()

    @Test
    fun picksNewestAndroidReleaseIgnoringDraftsAndDesktop() {
        val r = AppUpdate.latest(json)!!
        assertEquals("2.0.0-alpha.1", r.version)
        assertEquals("https://github.com/x/a2.apk", r.apkUrl)
        assertEquals(45871152L, r.apkSize)
        assertTrue(r.prerelease)
        assertEquals(r, AppUpdate.newer(json, 9902))
        assertNull(AppUpdate.newer(json, 19901))
        assertNull(AppUpdate.latest("not json"))
    }
}
