package io.github.berikkkk.muragis.mobile

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
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

/** Қосымша іске қосылады, негізгі панель мен мәзір бөлімдері ашылады, интерфейс тілі ауысады (эмуляторда). */
@RunWith(AndroidJUnit4::class)
class AppLaunchTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun menuSectionsOpenInKazakhAndRussian() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("kk")) }
        rule.waitForIdle()
        // Негізгі экран: бес батырмалы панель
        listOf("Мәзір", "Дәлдеу", "Жазу", "Маршрут", "Қабаттар").forEach { rule.onNodeWithText(it).assertExists() }
        rule.onNodeWithText("Қабаттар").performClick()
        rule.onNodeWithText("Картаны импорттау").assertExists()
        rule.onNodeWithContentDescription("Жабу").performClick()
        rule.onNodeWithText("Мәзір").performClick()
        rule.onNodeWithText("Маршруттар").performClick()
        rule.onNodeWithText("Қолмен сызу").assertExists()
        rule.onNodeWithContentDescription("Артқа").performClick()
        rule.onNodeWithText("Координата енгізу").performClick()
        rule.onNodeWithText("Картада көрсету").assertExists()
        rule.onNodeWithContentDescription("Артқа").performClick()
        rule.onNodeWithText("Баптаулар").performClick()
        rule.onNodeWithText("Zoom батырмаларының орны").assertExists()
        rule.onNodeWithText("Деректерді көрсету тілі").assertExists()

        InstrumentationRegistry.getInstrumentation().runOnMainSync { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("ru")) }
        rule.waitForIdle()
        // Мәзір ашық күйінде қалады (ViewModel тіл ауысқанда сақталады)
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Настройки").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Язык отображения данных").assertExists()
        rule.onNodeWithContentDescription("Назад").performClick()
        rule.onNodeWithText("Памятники").performClick()
        assertTrue(rule.onAllNodesWithText("Памятники", substring = true).fetchSemanticsNodes().isNotEmpty())
        InstrumentationRegistry.getInstrumentation().runOnMainSync { AppCompatDelegate.setApplicationLocales(LocaleListCompat.getEmptyLocaleList()) }
    }
}
