package io.github.berikkkk.muragis.mobile.map

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PointF
import android.view.MotionEvent
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.sources.GeoJsonSource
import kotlin.math.cos
import kotlin.math.hypot

/** Картадағы оқиғалар (ViewModel-ге). */
interface MapEvents {
    fun onMapTap(lat: Double, lon: Double)
    fun onMapLongPress(lat: Double, lon: Double)
    fun onMonumentTap(id: String)
    fun onRouteTap(id: String)
    fun onVertexTap(index: Int)
    fun onVertexMoved(index: Int, lat: Double, lon: Double)
    fun onCameraIdle(lat: Double, lon: Double, zoom: Double)
    /** Өңдеу режимі қосулы ма (нүкте қосу/жылжыту). */
    fun isEditingRoute(): Boolean
}

/**
 * MapLibre картасын басқару: стильді қолдану, деректер көздерін жаңарту, басу/ұзақ басу/саусақпен жылжыту.
 * Деректер (ескерткіштер, маршруттар) стиль ауысқанда қайта жүктеледі — олар негізгі картадан тәуелсіз.
 */
class MapController(private val ctx: Context, val view: MapView, private val events: MapEvents) {
    var map: MapLibreMap? = null; private set
    private var style: Style? = null
    private var styleJson: String = ""
    private val data = HashMap<String, String>()
    private val density = ctx.resources.displayMetrics.density
    private var editPoints: List<RoutePoint> = emptyList()
    private var dragIndex = -1
    private val vertexImages = HashSet<String>()

    fun attach(onReady: () -> Unit) {
        view.getMapAsync { m ->
            map = m
            m.uiSettings.isRotateGesturesEnabled = false
            m.uiSettings.isTiltGesturesEnabled = false
            m.uiSettings.isLogoEnabled = false
            m.uiSettings.isAttributionEnabled = true
            m.setMaxZoomPreference(20.0)
            m.addOnMapClickListener { p -> handleTap(p); true }
            m.addOnMapLongClickListener { p -> events.onMapLongPress(p.latitude, p.longitude); true }
            m.addOnCameraIdleListener {
                val c = m.cameraPosition
                c.target?.let { t -> events.onCameraIdle(t.latitude, t.longitude, c.zoom) }
            }
            installDrag()
            onReady()
        }
    }

    /** Стиль өзгерсе ғана қайта жүктеледі (мөлдірлік — [setOpacity] арқылы, стильді қайта құрмай). */
    fun applyStyle(json: String) {
        val m = map ?: return
        if (json == styleJson) return
        styleJson = json
        style = null
        m.setStyle(Style.Builder().fromJson(json)) { s ->
            style = s
            vertexImages.clear()
            val icons = SymbolIcons.all(ctx, (30 * density).toInt())
            icons.forEach { (k, v) -> s.addImage(k, v) }
            val cs = (44 * density).toInt()
            for (n in 2..99) s.addImage("cl-$n", SymbolIcons.cluster(n.toString(), cs))
            s.addImage("cl-100", SymbolIcons.cluster("99+", cs))
            s.addImage("cl-1k", SymbolIcons.cluster("999+", cs))
            ensureVertexImages(editPoints.size)
            data.forEach { (k, v) -> s.getSourceAs<GeoJsonSource>(k)?.setGeoJson(v) }
        }
    }

    fun setOpacity(layerId: String, base: Boolean, value: Double) {
        style?.getLayerAs<RasterLayer>(if (base) "base" else "ov-$layerId")?.setProperties(PropertyFactory.rasterOpacity(value.toFloat()))
    }

    private fun push(source: String, json: String) {
        data[source] = json
        style?.getSourceAs<GeoJsonSource>(source)?.setGeoJson(json)
    }

    private fun fc(features: JSONArray) = JSONObject().put("type", "FeatureCollection").put("features", features).toString()
    private fun point(lon: Double, lat: Double, props: JSONObject) = JSONObject().put("type", "Feature")
        .put("geometry", JSONObject().put("type", "Point").put("coordinates", JSONArray(listOf(lon, lat)))).put("properties", props)

    fun setMonuments(list: List<Monument>, dimmed: Set<String> = emptySet()) {
        val a = JSONArray()
        for (m in list) a.put(point(m.lon, m.lat, JSONObject().put("id", m.id).put("icon", SymbolIcons.iconName(m.type, m.category)).put("x", if (m.id in dimmed) 1 else 0)))
        push(StyleBuilder.SRC_MON, fc(a))
    }

    fun setSelected(m: Monument?) {
        push(StyleBuilder.SRC_SEL, fc(JSONArray().apply { if (m != null) put(point(m.lon, m.lat, JSONObject())) }))
    }

    fun setRoutes(list: List<Route>, selectedId: String?, hiddenId: String? = null) {
        val a = JSONArray()
        for (r in list) {
            if (r.id == hiddenId || r.points.size < 2) continue
            a.put(JSONObject().put("type", "Feature").put("properties", JSONObject().put("id", r.id).put("v", r.vehicle.code).put("sel", if (r.id == selectedId) 1 else 0))
                .put("geometry", JSONObject().put("type", "LineString").put("coordinates", JSONArray(r.points.map { JSONArray(listOf(it.lon, it.lat)) }))))
        }
        push(StyleBuilder.SRC_ROUTES, fc(a))
    }

    private fun ensureVertexImages(n: Int) {
        val s = style ?: return
        val size = (26 * density).toInt()
        for (i in 1..n) {
            for ((prefix, fill) in listOf("v" to Color.rgb(217, 72, 15), "vs" to Color.rgb(25, 113, 194), "vm" to Color.rgb(102, 56, 160))) {
                val key = "$prefix-$i"
                if (key in vertexImages) continue
                s.addImage(key, SymbolIcons.vertex(i.toString(), size, fill, Color.WHITE))
                vertexImages += key
            }
        }
    }

    fun setEditRoute(points: List<RoutePoint>, selected: Int) {
        editPoints = points
        ensureVertexImages(points.size)
        val line = JSONArray()
        if (points.size >= 2) line.put(JSONObject().put("type", "Feature").put("properties", JSONObject())
            .put("geometry", JSONObject().put("type", "LineString").put("coordinates", JSONArray(points.map { JSONArray(listOf(it.lon, it.lat)) }))))
        push(StyleBuilder.SRC_EDIT, fc(line))
        val pts = JSONArray()
        points.forEachIndexed { i, p ->
            val prefix = when { i == selected -> "vs"; p.monumentId != null -> "vm"; else -> "v" }
            pts.put(point(p.lon, p.lat, JSONObject().put("i", i).put("icon", "$prefix-${i + 1}")))
        }
        push(StyleBuilder.SRC_EDIT_PTS, fc(pts))
    }

    fun setLocation(lat: Double?, lon: Double?, accuracy: Float) {
        val a = JSONArray()
        if (lat != null && lon != null) {
            // r0 — дәлдік радиусы 0-масштабтағы пиксельмен (256 px тайл, 512 px әлем ені MapLibre-де)
            val metersPerPx0 = 156543.03392 * cos(Math.toRadians(lat)) / 2.0
            a.put(point(lon, lat, JSONObject().put("r0", accuracy / metersPerPx0)))
        }
        push(StyleBuilder.SRC_LOC, fc(a))
    }

    /* ---------- Басу ---------- */
    private fun handleTap(p: LatLng) {
        val m = map ?: return
        val sp = m.projection.toScreenLocation(p)
        val box = android.graphics.RectF(sp.x - 18 * density, sp.y - 30 * density, sp.x + 18 * density, sp.y + 8 * density)
        if (events.isEditingRoute()) {
            val v = nearestVertex(sp)
            if (v >= 0) { events.onVertexTap(v); return }
        }
        m.queryRenderedFeatures(box, StyleBuilder.LYR_CLUSTER).firstOrNull()?.let { f ->
            val src = style?.getSourceAs<GeoJsonSource>(StyleBuilder.SRC_MON) ?: return@let
            val z = runCatching { src.getClusterExpansionZoom(f) }.getOrDefault((m.cameraPosition.zoom + 2).toInt())
            m.animateCamera(CameraUpdateFactory.newLatLngZoom(p, z.toDouble() + 0.5))
            return
        }
        m.queryRenderedFeatures(box, StyleBuilder.LYR_MON).firstOrNull()?.getStringProperty("id")?.let { events.onMonumentTap(it); return }
        if (!events.isEditingRoute()) {
            val rb = android.graphics.RectF(sp.x - 12 * density, sp.y - 12 * density, sp.x + 12 * density, sp.y + 12 * density)
            m.queryRenderedFeatures(rb, StyleBuilder.LYR_ROUTES).firstOrNull()?.getStringProperty("id")?.let { events.onRouteTap(it); return }
        }
        events.onMapTap(p.latitude, p.longitude)
    }

    private fun nearestVertex(sp: PointF): Int {
        val m = map ?: return -1
        var best = -1
        var bd = 24 * density
        editPoints.forEachIndexed { i, p ->
            val q = m.projection.toScreenLocation(LatLng(p.lat, p.lon))
            val d = hypot(q.x - sp.x, q.y - sp.y)
            if (d < bd) { bd = d; best = i }
        }
        return best
    }

    private var downX = 0f
    private var downY = 0f
    private var dragMoved = false

    /**
     * Маршрут нүктесін саусақпен жылжыту. Саусақ нүктенің үстіне түссе — бүкіл қимыл бізде (карта жылжымайды):
     * сүйресе — нүкте жылжиды, жай басса — нүкте таңдалады. Басқа жерде — қимылды MapLibre өңдейді.
     */
    @SuppressLint("ClickableViewAccessibility")
    private fun installDrag() {
        val slop = 8 * density
        view.setOnTouchListener { _, e ->
            val m = map ?: return@setOnTouchListener false
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    dragIndex = if (events.isEditingRoute() && e.pointerCount == 1) nearestVertex(PointF(e.x, e.y)) else -1
                    downX = e.x; downY = e.y; dragMoved = false
                    dragIndex >= 0
                }
                MotionEvent.ACTION_MOVE -> {
                    if (dragIndex < 0) return@setOnTouchListener false
                    if (!dragMoved && hypot(e.x - downX, e.y - downY) < slop) return@setOnTouchListener true
                    dragMoved = true
                    val ll = m.projection.fromScreenLocation(PointF(e.x, e.y))
                    val pts = editPoints.toMutableList()
                    if (dragIndex < pts.size) {
                        pts[dragIndex] = RoutePoint(ll.latitude, ll.longitude, null)
                        setEditRoute(pts, dragIndex)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val i = dragIndex
                    dragIndex = -1
                    if (i < 0) return@setOnTouchListener false
                    if (i < editPoints.size) {
                        if (dragMoved) editPoints[i].let { events.onVertexMoved(i, it.lat, it.lon) } else events.onVertexTap(i)
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> {
                    val was = dragIndex >= 0
                    dragIndex = -1
                    was
                }
                else -> dragIndex >= 0
            }
        }
    }

    /* ---------- Камера ---------- */
    fun moveTo(lat: Double, lon: Double, zoom: Double? = null, animate: Boolean = true) {
        val m = map ?: return
        val z = zoom ?: m.cameraPosition.zoom
        val u = CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(LatLng(lat, lon)).zoom(z).build())
        if (animate) m.animateCamera(u, 600) else m.moveCamera(u)
    }

    fun fit(b: Bounds, paddingDp: Int = 48) {
        val m = map ?: return
        if (b.west == b.east && b.south == b.north) { moveTo(b.south, b.west, 15.0); return }
        val lb = LatLngBounds.Builder().include(LatLng(b.north, b.east)).include(LatLng(b.south, b.west)).build()
        m.animateCamera(CameraUpdateFactory.newLatLngBounds(lb, (paddingDp * density).toInt()), 600)
    }

    fun center(): Pair<Double, Double>? = map?.cameraPosition?.target?.let { it.latitude to it.longitude }
    fun zoom(): Double = map?.cameraPosition?.zoom ?: 0.0

    /** Экрандағы тіктөртбұрыштың (пиксельмен) географиялық шекарасы — жүктелетін аумақты таңдау үшін. */
    fun boundsOfScreenRect(left: Float, top: Float, right: Float, bottom: Float): Bounds? {
        val m = map ?: return null
        val a = m.projection.fromScreenLocation(PointF(left, top))
        val b = m.projection.fromScreenLocation(PointF(right, bottom))
        return Bounds(minOf(a.longitude, b.longitude), minOf(a.latitude, b.latitude), maxOf(a.longitude, b.longitude), maxOf(a.latitude, b.latitude))
    }

    @Suppress("unused") private fun unusedLang(l: Lang) = l
}
