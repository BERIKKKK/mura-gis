package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.Row
import io.github.berikkkk.muragis.core.db.SqlDb
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet

/** Тестілерге арналған SqlDb (sqlite-jdbc). Android-тағы AndroidSqlDb-мен бірдей семантика. */
class JdbcSqlDb(path: String) : SqlDb {
    val conn: Connection = DriverManager.getConnection("jdbc:sqlite:$path")
    private var depth = 0

    private fun bind(st: java.sql.PreparedStatement, args: List<Any?>) {
        args.forEachIndexed { i, a ->
            when (a) {
                null -> st.setNull(i + 1, java.sql.Types.NULL)
                is String -> st.setString(i + 1, a)
                is Int -> st.setLong(i + 1, a.toLong())
                is Long -> st.setLong(i + 1, a)
                is Double -> st.setDouble(i + 1, a)
                is Float -> st.setDouble(i + 1, a.toDouble())
                is Boolean -> st.setLong(i + 1, if (a) 1 else 0)
                is ByteArray -> st.setBytes(i + 1, a)
                else -> st.setString(i + 1, a.toString())
            }
        }
    }

    override fun exec(sql: String, args: List<Any?>) {
        conn.prepareStatement(sql).use { st -> bind(st, args); st.execute() }
    }

    override fun <T> query(sql: String, args: List<Any?>, map: (Row) -> T): List<T> {
        conn.prepareStatement(sql).use { st ->
            bind(st, args)
            val hasRs = st.execute()
            if (!hasRs) return emptyList()
            st.resultSet.use { rs ->
                val md = rs.metaData
                val cols = (1..md.columnCount).map { md.getColumnLabel(it) }
                val row = RsRow(rs, cols)
                val out = ArrayList<T>()
                while (rs.next()) out += map(row)
                return out
            }
        }
    }

    override fun <T> tx(block: () -> T): T {
        if (depth > 0) { depth++; try { return block() } finally { depth-- } }
        conn.autoCommit = false
        depth = 1
        try {
            val r = block(); conn.commit(); return r
        } catch (e: Throwable) {
            conn.rollback(); throw e
        } finally {
            depth = 0; conn.autoCommit = true
        }
    }

    override fun close() = conn.close()

    private class RsRow(val rs: ResultSet, override val columns: List<String>) : Row {
        private fun idx(c: String) = columns.indexOf(c).let { if (it < 0) -1 else it + 1 }
        override fun string(col: String): String? { val i = idx(col); return if (i < 0) null else rs.getObject(i)?.let { if (it is ByteArray) String(it) else it.toString() } }
        override fun long(col: String): Long? { val i = idx(col); if (i < 0) return null; val o = rs.getObject(i) ?: return null; return (o as? Number)?.toLong() ?: o.toString().toLongOrNull() }
        override fun double(col: String): Double? { val i = idx(col); if (i < 0) return null; val o = rs.getObject(i) ?: return null; return (o as? Number)?.toDouble() ?: o.toString().toDoubleOrNull() }
        override fun blob(col: String): ByteArray? { val i = idx(col); return if (i < 0) null else rs.getBytes(i) }
        override fun isNull(col: String): Boolean { val i = idx(col); return i < 0 || rs.getObject(i) == null }
    }
}
