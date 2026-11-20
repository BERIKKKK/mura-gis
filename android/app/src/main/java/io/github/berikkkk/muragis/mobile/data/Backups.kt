package io.github.berikkkk.muragis.mobile.data

import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Дерекқордың автоматты сақтық көшірмелері (files/backups, соңғы 7 көшірме).
 * Қосымша іске қосылғанда, соңғы көшірмеден 24 сағат өтсе — жаңа көшірме жасалады. Қалпына келтіру — баптаулардан.
 */
class Backups(private val dir: File, private val dbFile: File) {
    init { dir.mkdirs() }

    fun list(): List<File> = dir.listFiles { f -> f.name.endsWith(".db") }?.sortedByDescending { it.name } ?: emptyList()

    fun create(db: AndroidSqlDb): File {
        val name = "mura-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(Date()) + ".db"
        val out = File(dir, name)
        if (Build.VERSION.SDK_INT >= 30) {
            db.sqlite.execSQL("VACUUM INTO ?", arrayOf(out.path))
        } else {
            db.sqlite.rawQuery("PRAGMA wal_checkpoint(FULL)", null).use { it.moveToFirst() }
            dbFile.copyTo(out, overwrite = true)
        }
        list().drop(7).forEach { it.delete() }
        return out
    }

    /** Көшірмені қалпына келтіру: дерекқор жабылған күйде шақырылады. Алдыңғы күйі де көшірмеге сақталады. */
    fun restore(backup: File) {
        val safety = File(dir, "before-restore-" + System.currentTimeMillis() + ".db")
        if (dbFile.isFile) dbFile.copyTo(safety, overwrite = true)
        for (suffix in listOf("-wal", "-shm", "-journal")) File(dbFile.path + suffix).delete()
        backup.copyTo(dbFile, overwrite = true)
    }
}
