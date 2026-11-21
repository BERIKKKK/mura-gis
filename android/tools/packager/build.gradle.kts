// Mura GIS офлайн карта пакеттерін дайындау құралы (Android қолданбасына кірмейді).
// Сипаттамасы және іске қосу реті — tools/packager/README.md.
plugins {
    id("org.jetbrains.kotlin.jvm")
    application
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":core"))
    implementation("org.xerial:sqlite-jdbc:3.46.1.3")
    testImplementation("junit:junit:4.13.2")
}

application {
    mainClass.set("io.github.berikkkk.muragis.packager.MainKt")
    applicationDefaultJvmArgs = listOf("-Xmx6g", "-Dfile.encoding=UTF-8")
}

tasks.named<JavaExec>("run") { workingDir = rootProject.projectDir }
