package io.github.berikkkk.muragis.mobile

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.os.LocaleListCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.berikkkk.muragis.mobile.ui.MainActivity
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Қосымша іске қосылады, бөлімдер ашылады, интерфейс тілі ауысады (эмуляторда). */
@RunWith(AndroidJUnit4::class)
class AppLaunchTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun tabsOpenInKazakhAndRussian() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("kk")) }
        rule.waitForIdle()
        rule.onNodeWithText("Маршруттар").performClick()
        rule.onNodeWithText("Жаңа маршрут").assertExists()
        rule.onNodeWithText("Карталар").performClick()
        rule.onNodeWithText("Картаны импорттау").assertExists()
        rule.onNodeWithText("Баптаулар").performClick()
        rule.onNodeWithText("Деректерді көрсету тілі").assertExists()

        InstrumentationRegistry.getInstrumentation().runOnMainSync { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("ru")) }
        rule.waitForIdle()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Настройки").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Язык отображения данных").assertExists()
        rule.onNodeWithText("Памятники").performClick()
        assertTrue(rule.onAllNodesWithText("Памятники: 0").fetchSemanticsNodes().isNotEmpty() || rule.onAllNodesWithText("Памятники", substring = true).fetchSemanticsNodes().isNotEmpty())
        InstrumentationRegistry.getInstrumentation().runOnMainSync { AppCompatDelegate.setApplicationLocales(LocaleListCompat.getEmptyLocaleList()) }
    }
}
