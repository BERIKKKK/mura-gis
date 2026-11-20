package io.github.berikkkk.muragis.core.io

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

internal val JSON = Json { prettyPrint = false }
internal val JSON_PRETTY = Json { prettyPrint = true }

internal fun parseJson(text: String): JsonElement = try {
    JSON.parseToJsonElement(text.removePrefix("﻿"))
} catch (e: Exception) {
    throw FormatException("json", "JSON error")
}

internal fun JsonElement?.obj(): JsonObject? = this as? JsonObject
internal fun JsonElement?.arr(): JsonArray? = this as? JsonArray

/** Қасиеттің мәтіндік мәні (сан не логикалық мән болса да — мәтінге айналдырылады). */
internal fun JsonObject?.str(key: String): String? {
    val v = this?.get(key) ?: return null
    if (v is JsonNull) return null
    return (v as? JsonPrimitive)?.content
}

internal fun JsonObject?.pick(vararg keys: String): String {
    for (k in keys) { val v = str(k)?.trim(); if (!v.isNullOrEmpty()) return v }
    return ""
}

internal fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.let { if (it.isString) it.content.toDoubleOrNull() else it.doubleOrNull }

internal fun jstr(s: String?) = JsonPrimitive(s ?: "")
