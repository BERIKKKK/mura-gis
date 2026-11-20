package io.github.berikkkk.muragis.mobile.data

import android.database.Cursor
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import io.github.berikkkk.muragis.core.db.Row
import io.github.berikkkk.muragis.core.db.SqlDb
import java.io.File

/**
 * core модулінің SqlDb интерфейсі — Android-тың өз SQLite-ы арқылы.
 * Сұраныс параметрлері түрімен байланыстырылады (rawQuery тек жолдарды қабылдайтындықтан CursorFactory арқылы).
 */
class AndroidSqlDb private constructor(val sqlite: SQLiteDatabase) : SqlDb {

    companion object {
        /** Қосымшаның негізгі дерекқоры (WAL режимі — оқу мен жазу бірін-бірі бөгемейді). */
        fun openReadWrite(file: File): AndroidSqlDb {
            file.parentFile?.mkdirs()
            val db = SQLiteDatabase.openDatabase(file.path, null,
                SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.NO_LOCALIZED_COLLATORS or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING)
            return AndroidSqlDb(db)
        }

        /** Сыртқы файл (MBTiles, GeoPackage): тек оқу. */
        fun openReadOnly(file: File): AndroidSqlDb =
            AndroidSqlDb(SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS))

        /** Жаңа файл (экспорт, MBTiles жазу): android_metadata кестесінсіз (GeoPackage таза болуы үшін). */
        fun create(file: File): AndroidSqlDb {
            file.parentFile?.mkdirs()
            return AndroidSqlDb(SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.NO_LOCALIZED_COLLATORS))
        }
    }

    private fun bind(p: SQLiteProgram, args: List<Any?>) {
        args.forEachIndexed { i, a ->
            val k = i + 1
            when (a) {
                null -> p.bindNull(k)
                is String -> p.bindString(k, a)
                is Int -> p.bindLong(k, a.toLong())
                is Long -> p.bindLong(k, a)
                is Double -> p.bindDouble(k, a)
                is Float -> p.bindDouble(k, a.toDouble())
                is Boolean -> p.bindLong(k, if (a) 1 else 0)
                is ByteArray -> p.bindBlob(k, a)
                else -> p.bindString(k, a.toString())
            }
        }
    }

    override fun exec(sql: String, args: List<Any?>) {
        val head = sql.trimStart().take(6).uppercase()
        if (head.startsWith("PRAGMA") || head.startsWith("SELECT")) {
            // PRAGMA ... = ... нәтиже қайтаруы мүмкін — rawQuery арқылы
            query(sql, args) { }
            return
        }
        if (args.isEmpty()) { sqlite.execSQL(sql); return }
        sqlite.compileStatement(sql).use { st -> bind(st, args); st.execute() }
    }

    override fun <T> query(sql: String, args: List<Any?>, map: (Row) -> T): List<T> {
        val factory = SQLiteDatabase.CursorFactory { _, driver, editTable, q ->
            bind(q, args)
            SQLiteCursor(driver, editTable, q)
        }
        sqlite.rawQueryWithFactory(factory, sql, null, "").use { c ->
            val row = CursorRow(c)
            val out = ArrayList<T>(c.count.coerceAtLeast(0))
            while (c.moveToNext()) out += map(row)
            return out
        }
    }

    override fun <T> tx(block: () -> T): T {
        sqlite.beginTransactionNonExclusive()
        try {
            val r = block()
            sqlite.setTransactionSuccessful()
            return r
        } finally {
            sqlite.endTransaction()
        }
    }

    override fun close() = sqlite.close()

    private class CursorRow(val c: Cursor) : Row {
        override val columns: List<String> = c.columnNames.toList()
        private fun idx(col: String) = c.getColumnIndex(col)
        override fun string(col: String): String? = idx(col).let { i ->
            if (i < 0 || c.isNull(i)) null else if (c.getType(i) == Cursor.FIELD_TYPE_BLOB) String(c.getBlob(i)) else c.getString(i)
        }
        override fun long(col: String): Long? = idx(col).let { if (it < 0 || c.isNull(it)) null else c.getLong(it) }
        override fun double(col: String): Double? = idx(col).let { if (it < 0 || c.isNull(it)) null else c.getDouble(it) }
        override fun blob(col: String): ByteArray? = idx(col).let { if (it < 0 || c.isNull(it)) null else c.getBlob(it) }
        override fun isNull(col: String): Boolean = idx(col).let { it < 0 || c.isNull(it) }
    }
}
