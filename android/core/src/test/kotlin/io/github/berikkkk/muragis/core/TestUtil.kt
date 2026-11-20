package io.github.berikkkk.muragis.core

import java.io.File
import java.util.concurrent.TimeUnit

object TestUtil {
    fun tmp(name: String): File {
        val dir = File(System.getProperty("mura.testOut") ?: System.getProperty("java.io.tmpdir"), "t").apply { mkdirs() }
        return File(dir, System.nanoTime().toString() + "-" + name).apply { delete() }
    }

    /** Репозиторий түбірі (android/ қалтасының иесі). */
    val repo: File by lazy {
        var d: File? = File("").absoluteFile
        while (d != null && !File(d, "main/gpkg.js").isFile) d = d.parentFile
        d ?: File("")
    }

    val nodeAvailable: Boolean by lazy {
        runCatching { ProcessBuilder("node", "-e", "require('node:sqlite')").start().waitFor(30, TimeUnit.SECONDS) }.getOrDefault(false) &&
            File(repo, "main/gpkg.js").isFile
    }

    /** android/tools/desktop-compat.mjs — жұмыс үстелі кодын Node-та іске қосу. */
    fun desktop(vararg args: String): String {
        val p = ProcessBuilder(listOf("node", "--no-warnings", File(repo, "android/tools/desktop-compat.mjs").path) + args)
            .redirectError(ProcessBuilder.Redirect.INHERIT).start()
        val out = p.inputStream.readBytes().toString(Charsets.UTF_8)
        check(p.waitFor(60, TimeUnit.SECONDS) && p.exitValue() == 0) { "desktop-compat ${args.toList()} failed" }
        return out
    }
}
