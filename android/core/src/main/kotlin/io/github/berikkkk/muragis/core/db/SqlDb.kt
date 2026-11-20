package io.github.berikkkk.muragis.core.db

import java.io.Closeable

/** Сұраныс нәтижесінің бір жолы (баған аты бойынша). */
interface Row {
    val columns: List<String>
    fun string(col: String): String?
    fun long(col: String): Long?
    fun double(col: String): Double?
    fun blob(col: String): ByteArray?
    fun isNull(col: String): Boolean
}

/**
 * SQLite-қа ең аз интерфейс. Android-та — android.database.sqlite (app модулі),
 * JVM тестілерінде — sqlite-jdbc. Логика (схема, репозиторийлер, GeoPackage, MBTiles) осы интерфейс арқылы
 * жазылғандықтан, Android құрылғысынсыз тексеріледі.
 * args: null, String, Long/Int, Double/Float, ByteArray, Boolean.
 */
interface SqlDb : Closeable {
    fun exec(sql: String, args: List<Any?> = emptyList())
    fun <T> query(sql: String, args: List<Any?> = emptyList(), map: (Row) -> T): List<T>
    fun <T> tx(block: () -> T): T

    /** Бір жолды курсормен өту (үлкен кестелерді жадқа толық жүктемеу үшін). */
    fun forEach(sql: String, args: List<Any?> = emptyList(), each: (Row) -> Unit) {
        query(sql, args) { each(it) }
    }

    fun scalarLong(sql: String, args: List<Any?> = emptyList()): Long? = query(sql, args) { it.long(it.columns[0]) }.firstOrNull()
    fun scalarString(sql: String, args: List<Any?> = emptyList()): String? = query(sql, args) { it.string(it.columns[0]) }.firstOrNull()

    fun tableExists(name: String): Boolean =
        scalarLong("SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?", listOf(name)) ?: 0L > 0L

    fun columnsOf(table: String): List<String> = query("PRAGMA table_info(\"" + table.replace("\"", "\"\"") + "\")") { it.string("name") ?: "" }
}

/** SQL идентификаторын тырнақшаға алу. */
fun q(id: String) = "\"" + id.replace("\"", "\"\"") + "\""
