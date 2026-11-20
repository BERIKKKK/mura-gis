// Mura GIS Android — негізгі (Electron) жобадан тәуелсіз Gradle жобасы.
// :core — платформаға тәуелсіз логика (Kotlin/JVM): деректер моделі, форматтар, тайлдар, лицензия саясаты.
// :app  — Android қосымшасы (MapLibre, SQLite, WorkManager, Compose).
// Android SDK жоқ ортада (мыс. тек :core тестілері) :app модулін өшіруге болады:  -PcoreOnly=true
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id("com.android.application") version "8.7.3"
        id("org.jetbrains.kotlin.android") version "2.0.21"
        id("org.jetbrains.kotlin.jvm") version "2.0.21"
        id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "mura-gis-android"
include(":core")
val coreOnly = providers.gradleProperty("coreOnly").orNull == "true"
if (!coreOnly) include(":app")
