package io.github.berikkkk.muragis.core.io

import org.w3c.dom.Document
import org.w3c.dom.Element
import org.w3c.dom.Node
import java.io.StringReader
import javax.xml.parsers.DocumentBuilderFactory
import org.xml.sax.InputSource

/** Импорт файлының қатесі (UI-да [code] бойынша аударылады). */
class FormatException(val code: String, message: String = code) : Exception(message)

internal object Xml {
    fun parse(str: String, kind: String): Document {
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = true
        // XXE-ден қорғау (кейбір платформаларда бұл баптаулар жоқ — елемейміз)
        runCatching { f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
        runCatching { f.setFeature("http://xml.org/sax/features/external-general-entities", false) }
        runCatching { f.setFeature("http://xml.org/sax/features/external-parameter-entities", false) }
        runCatching { f.isExpandEntityReferences = false }
        return try {
            f.newDocumentBuilder().parse(InputSource(StringReader(str.removePrefix("﻿"))))
        } catch (e: Exception) {
            throw FormatException("xml", "$kind: XML error")
        }
    }

    fun local(n: Node): String = n.localName ?: n.nodeName.substringAfter(':')

    fun elements(root: Node, localName: String): List<Element> {
        val out = ArrayList<Element>()
        fun walk(n: Node) {
            var c = n.firstChild
            while (c != null) {
                if (c is Element) {
                    if (local(c) == localName) out.add(c)
                    walk(c)
                }
                c = c.nextSibling
            }
        }
        walk(root)
        return out
    }

    fun child(el: Element?, localName: String): Element? {
        var c = el?.firstChild
        while (c != null) {
            if (c is Element && local(c) == localName) return c
            c = c.nextSibling
        }
        return null
    }

    fun text(el: Element?): String = el?.textContent?.trim() ?: ""

    fun esc(s: String?): String = (s ?: "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace("\"", "&quot;").replace("'", "&apos;")

    /** HTML тегтерін алып тастау (KML description). */
    fun stripHtml(s: String?): String = (s ?: "")
        .replace(Regex("(?i)<br\\s*/?>|</p>|</div>|</li>|</tr>"), "\n")
        .replace(Regex("<[^>]+>"), " ")
        .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
        .replace(' ', ' ').replace(Regex("[ \\t]+"), " ").replace(Regex(" ?\\n ?"), "\n").replace(Regex("\\n{3,}"), "\n\n").trim()
}
