plugins {
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.xerial:sqlite-jdbc:3.46.1.3")
}

tasks.test {
    // Кросс-тексеру тестіне (жұмыс үстелі gpkg.js) шығыс файлдар қалтасы
    systemProperty("mura.testOut", layout.buildDirectory.dir("test-out").get().asFile.absolutePath)
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

// Үлкен карта файлы: ~400 МБ MBTiles және ~100 000 жазбалы ZIP, JVM жады 128 МБ-пен шектеулі.
// Файлдар жадқа толық жүктелсе, тест OutOfMemoryError-мен құлайды.  ./gradlew -PcoreOnly=true :core:largeFileTest
tasks.register<Test>("largeFileTest") {
    description = "Үлкен карта файлдарын шектеулі жадпен ашу"
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    maxHeapSize = "128m"
    systemProperty("mura.large", "true")
    systemProperty("mura.testOut", layout.buildDirectory.dir("test-out").get().asFile.absolutePath)
    filter { includeTestsMatching("*LargeFileTest*") }
    testLogging { events("passed", "failed", "standard_out"); showStandardStreams = true }
}
