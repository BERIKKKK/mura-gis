package io.github.berikkkk.muragis.mobile.map

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PointF
import android.view.Choreographer
import android.view.MotionEvent
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.gestures.MoveGestureDetector
import org.maplibre.android.gestures.StandardScaleGestureDetector
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.sources.GeoJsonSource
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
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
    /** Пайдаланушы картаны бір саусақпен жылжытты (GPS-ке еру режимін өшіру үшін). Масштабтау еруді өшірмейді. */
    fun onUserGesture() {}
    /** Картаның бұрылу бұрышы өзгерді (компас батырмасы үшін), градус. */
    fun onBearing(bearing: Double) {}
    fun onPinTap() {}
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
            m.uiSettings.isCompassEnabled = false // өз компас батырмамыз бар (zoom астында)
            m.setMaxZoomPreference(20.0)
            m.addOnMapClickListener { p -> handleTap(p); true }
            m.addOnMapLongClickListener { p -> events.onMapLongPress(p.latitude, p.longitude); true }
            // Еру режимін тек бір саусақпен жылжыту өшіреді: екі саусақпен масштабтау / екі рет басу еруді бұзбайды
            // (бұрын кез келген қимыл, соның ішінде zoom, еруді өшіретін — карта орынмен бірге қозғалмай қалатын).
            m.addOnMoveListener(object : MapLibreMap.OnMoveListener {
                override fun onMoveBegin(d: MoveGestureDetector) { gestures++; if (d.pointersCount <= 1) events.onUserGesture() }
                override fun onMove(d: MoveGestureDetector) {}
                override fun onMoveEnd(d: MoveGestureDetector) { gestures = maxOf(0, gestures - 1); holdAfterGesture() }
            })
            m.addOnScaleListener(object : MapLibreMap.OnScaleListener {
                override fun onScaleBegin(d: StandardScaleGestureDetector) { gestures++ }
                override fun onScale(d: StandardScaleGestureDetector) {}
                override fun onScaleEnd(d: StandardScaleGestureDetector) { gestures = maxOf(0, gestures - 1); holdAfterGesture() }
            })
            // Екі рет басу (zoom) сияқты қимыл анимациялары — кадр сайынғы камера жаңартуы оларды үзбеуі үшін
            m.addOnCameraMoveStartedListener { r -> if (!frameMove && r == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) holdAfterGesture() }
            m.addOnCameraMoveListener { events.onBearing(m.cameraPosition.bearing) }
            m.addOnCameraIdleListener {
                // Еру кезіндегі кадр сайынғы жылжу — сақтауды сиретеміз ([onFrame])
                if (frameMove || System.nanoTime() - frameMoveAt < 100_000_000L) return@addOnCameraIdleListener
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
            val ps = (30 * density).toInt()
            s.addImage("loc-arrow", SymbolIcons.arrow((30 * density).toInt()))
            s.addImage("plan-a", SymbolIcons.vertex(ctx.getString(io.github.berikkkk.muragis.mobile.R.string.point_a), ps, Color.rgb(35, 36, 31), Color.WHITE))
            s.addImage("plan-b", SymbolIcons.vertex(ctx.getString(io.github.berikkkk.muragis.mobile.R.string.point_b), ps, Color.rgb(34, 81, 201), Color.WHITE))
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

    /**
     * Орын: [direction] — қозғалыс/телефон бағыты (градус, солтүстіктен сағат тілімен); null болса — бағытсыз нүкте.
     * [visible] false болса — белгі көрсетілмейді, бірақ орын камераның еруі үшін есепке алынады.
     * Белгі жаңа нүктеге секірмейді: алдыңғы GPS нүктесінен жаңасына дейін нүктелер арасындағы уақыт ішінде бірқалыпты жылжиды.
     */
    fun setLocation(lat: Double?, lon: Double?, accuracy: Float, direction: Float? = null, visible: Boolean = true) {
        locVisible = visible
        locDir = direction?.toDouble()
        locAcc = accuracy.toDouble()
        if (lat == null || lon == null) {
            curLat = null; curLon = null; curDir = null; fixAt = 0L
            push(StyleBuilder.SRC_LOC, fc(JSONArray()))
            return
        }
        if (lat != toLat || lon != toLon || curLat == null) {
            val now = System.nanoTime()
            val cl = curLat; val cn = curLon
            if (cl == null || cn == null || fixAt == 0L || distM(cl, cn, lat, lon) > JUMP_M) {
                // Алғашқы нүкте не үлкен секіріс (мыс. желі нүктесінен GPS-ке) — бірден орнына; камера оған тегіс жетеді
                curLat = lat; curLon = lon; curAcc = locAcc; posAnim = false
                camOffValid = false
            } else {
                fromLat = cl; fromLon = cn
                fromAt = now
                // Келесі нүкте келгенде белгі дәл осы нүктеге жетеді — қозғалыс үзіліссіз болады
                posDur = (now - fixAt).coerceIn(MIN_STEP_NS, MAX_STEP_NS)
                posAnim = true
            }
            toLat = lat; toLon = lon
            fixAt = now
        }
        locDirty = true
        kick()
    }

    private fun pushLocation() {
        val lat = curLat; val lon = curLon
        val a = JSONArray()
        if (lat != null && lon != null && locVisible) {
            // r0 — дәлдік радиусы 0-масштабтағы пиксельмен (256 px тайл, 512 px әлем ені MapLibre-де)
            val metersPerPx0 = 156543.03392 * cos(Math.toRadians(lat)) / 2.0
            val props = JSONObject().put("r0", curAcc / metersPerPx0)
            curDir?.let { props.put("brg", it) }
            a.put(point(lon, lat, props))
        }
        push(StyleBuilder.SRC_LOC, fc(a))
    }

    private fun line(pts: List<LatLon>, props: JSONObject) = JSONObject().put("type", "Feature").put("properties", props)
        .put("geometry", JSONObject().put("type", "LineString").put("coordinates", JSONArray(pts.map { JSONArray(listOf(it.lon, it.lat)) })))

    /** Есептелген маршрут: желі бойындағы бөлік және желіден тыс түзу бөліктер; А/Б нүктелері. */
    fun setPlan(main: List<LatLon>, off: List<List<LatLon>>, a: LatLon?, b: LatLon?) {
        val f = JSONArray()
        if (main.size >= 2) f.put(line(main, JSONObject().put("off", 0)))
        off.filter { it.size >= 2 }.forEach { f.put(line(it, JSONObject().put("off", 1))) }
        push(StyleBuilder.SRC_PLAN, fc(f))
        val p = JSONArray()
        a?.let { p.put(point(it.lon, it.lat, JSONObject().put("icon", "plan-a"))) }
        b?.let { p.put(point(it.lon, it.lat, JSONObject().put("icon", "plan-b"))) }
        push(StyleBuilder.SRC_PLAN_PTS, fc(p))
    }

    fun setTrack(pts: List<LatLon>) {
        push(StyleBuilder.SRC_TRACK, fc(JSONArray().apply { if (pts.size >= 2) put(line(pts, JSONObject())) }))
    }

    fun setPin(p: LatLon?) {
        push(StyleBuilder.SRC_PIN, fc(JSONArray().apply { if (p != null) put(point(p.lon, p.lat, JSONObject())) }))
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
            animateCam(CameraUpdateFactory.newLatLngZoom(p, z.toDouble() + 0.5), 300)
            return
        }
        if (!events.isEditingRoute()) {
            val pb = android.graphics.RectF(sp.x - 16 * density, sp.y - 16 * density, sp.x + 16 * density, sp.y + 16 * density)
            if (m.queryRenderedFeatures(pb, StyleBuilder.LYR_PIN).isNotEmpty()) { events.onPinTap(); return }
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
        if (animate) animateCam(u, 600) else { m.moveCamera(u); camOffValid = false }
    }

    /** Бағдарлама анимациясы (жылжу, масштаб): ол біткенше кадр сайынғы еру камераны ұстамайды, анимацияны үзбейді. */
    private fun animateCam(u: org.maplibre.android.camera.CameraUpdate, ms: Int) {
        val m = map ?: return
        apiAnims++
        camOffValid = false
        m.animateCamera(u, ms, object : MapLibreMap.CancelableCallback {
            override fun onFinish() { apiAnims = maxOf(0, apiAnims - 1); kick() }
            override fun onCancel() { apiAnims = maxOf(0, apiAnims - 1); kick() }
        })
    }

    fun fit(b: Bounds, paddingDp: Int = 48) {
        val m = map ?: return
        if (b.west == b.east && b.south == b.north) { moveTo(b.south, b.west, 15.0); return }
        val lb = LatLngBounds.Builder().include(LatLng(b.north, b.east)).include(LatLng(b.south, b.west)).build()
        animateCam(CameraUpdateFactory.newLatLngBounds(lb, (paddingDp * density).toInt()), 600)
    }

    /**
     * Нүкте экранның жоғарғы бөлігіне ([fracY] — биіктіктің үлесі) келетіндей камераны жылжыту: төменгі парақ
     * (ескерткіш карточкасы) ашылғанда белгі оның астында қалмайды.
     */
    fun revealAbove(lat: Double, lon: Double, fracY: Float = 0.28f) {
        val m = map ?: return
        val w = view.width.toFloat(); val h = view.height.toFloat()
        if (w <= 0f || h <= 0f) return
        val p = m.projection.toScreenLocation(LatLng(lat, lon))
        val c = m.projection.fromScreenLocation(PointF(w / 2f + (p.x - w / 2f), h / 2f + (p.y - h * fracY)))
        animateCam(CameraUpdateFactory.newLatLng(c), 400)
    }

    fun zoomBy(delta: Double) {
        val m = map ?: return
        animateCam(CameraUpdateFactory.zoomBy(delta), 250)
    }

    /** Саусақ қимылы жүріп жатыр ма (сол кезде камераны еру анимациясымен бұзбаймыз). */
    private var gestures = 0

    /**
     * GPS-ке еру режимі: масштабтау экран ортасына (яғни орынға) қатысты болады — орын ортадан кетпейді.
     * Режим өшкенде — әдеттегідей саусақтар арасындағы нүктеге қатысты.
     */
    fun setFollowFocus(on: Boolean) {
        val m = map ?: return
        m.uiSettings.focalPoint = if (on && view.width > 0) PointF(view.width / 2f, (view.height + navTop()) / 2f) else null
    }

    /**
     * Навигация режимі: орын экранның төменгі бөлігінде (алдағы жол көбірек көрінеді) — камераның жоғарғы шегінісі.
     * Шегініс пен бұрылу тегіс өзгереді; режим өшкенде карта солтүстікке қайтады.
     */
    var navigation = false
        set(v) {
            if (field == v) return
            field = v
            navExit = !v
            if (v) navBearing = null // алдыңғы навигацияның ескі бағытына бұрылмау үшін
            if (map?.uiSettings?.focalPoint != null) setFollowFocus(true)
            kick()
        }
    private fun navTop(): Float = if (navigation) view.height * 0.35f else 0f

    /**
     * Камера орынға ереді ([on]; масштаб өзгермейді) және, [bearing] берілсе, навигация режимінде карта бұрылады.
     * Камера GPS нүктесіне емес, тегіс жылжитын орын белгісіне ереді — сондықтан қозғалыс секірмейді.
     */
    fun follow(on: Boolean, bearing: Double? = null) {
        if (on && !followOn) camOffValid = false
        followOn = on
        if (bearing != null) navBearing = bearing
        kick()
    }

    /* ---------- Орын мен камераның тегіс қозғалысы (әр кадрда) ---------- */
    private val choreographer = Choreographer.getInstance()
    private val frameCb = Choreographer.FrameCallback { t -> onFrame(t) }
    private var frameQueued = false
    private var lastFrame = 0L
    /** Камераны өзіміз жылжытып жатырмыз (MapLibre оқиғаларын қимылдан ажырату үшін). */
    private var frameMove = false
    private var frameMoveAt = 0L
    private var apiAnims = 0
    private var holdUntil = 0L
    private var lastSave = 0L
    private var camMoved = false

    private var followOn = false
    private var navBearing: Double? = null
    /** Навигациядан шығу: солтүстікке және шегініссіз күйге қайту аяқталмады. */
    private var navExit = false

    // Белгінің көрінетін күйі (cur*) және соңғы GPS нүктесі (to*)
    private var curLat: Double? = null
    private var curLon: Double? = null
    private var curAcc = 0.0
    private var curDir: Double? = null
    private var fromLat = 0.0; private var fromLon = 0.0
    private var toLat = Double.NaN; private var toLon = Double.NaN
    private var fromAt = 0L; private var posDur = 1L; private var posAnim = false
    private var fixAt = 0L
    private var locAcc = 0.0
    private var locDir: Double? = null
    private var locVisible = true
    private var locDirty = false

    /** Камера ортасының орыннан ауытқуы (қимыл/анимациядан кейін камера орынға секірмей, тегіс оралады). */
    private var camOffLat = 0.0; private var camOffLon = 0.0; private var camOffValid = false

    private fun kick() {
        if (frameQueued || map == null) return
        frameQueued = true
        choreographer.postFrameCallback(frameCb)
    }

    /** Саусақ қимылынан кейінгі инерция/zoom анимациясы аяқталғанша камераны ұстамау. */
    private fun holdAfterGesture() { holdUntil = System.nanoTime() + HOLD_NS; camOffValid = false; kick() }

    /** Карта экраны жабылғанда кадр циклін тоқтату. */
    fun release() { choreographer.removeFrameCallback(frameCb); frameQueued = false }

    private fun onFrame(now: Long) {
        frameQueued = false
        val m = map ?: return
        val dt = if (lastFrame == 0L) 0.016 else ((now - lastFrame) / 1e9).coerceIn(0.001, 0.1)
        lastFrame = now
        var busy = false

        // 1) Орын белгісі: GPS нүктелері арасында бірқалыпты жылжу, бағыт пен дәлдік шеңбері — тегіс
        if (posAnim) {
            val k = ((now - fromAt).toDouble() / posDur).coerceIn(0.0, 1.0)
            curLat = fromLat + (toLat - fromLat) * k
            curLon = fromLon + (toLon - fromLon) * k
            if (k >= 1.0) posAnim = false else busy = true
            locDirty = true
        }
        val ta = locAcc
        if (abs(curAcc - ta) > 0.05) { curAcc += (ta - curAcc) * ease(dt, 0.3); busy = true; locDirty = true } else if (curAcc != ta) { curAcc = ta; locDirty = true }
        val td = locDir
        val cd = curDir
        if (td == null || cd == null) { if (cd != td) { curDir = td; locDirty = true } }
        else {
            val d = angleDelta(cd, td)
            if (d != 0.0) {
                curDir = if (abs(d) < 0.1) td else { busy = true; norm(cd + d * ease(dt, 0.2)) }
                locDirty = true
            }
        }
        if (locDirty) { locDirty = false; pushLocation() }

        // 2) Камера: орынға еру, навигациядағы бұрылу мен шегініс
        val free = gestures == 0 && apiAnims == 0 && now >= holdUntil
        if (!free) {
            camOffValid = false
            if (followOn || navigation || navExit) busy = true
        } else {
            val c = m.cameraPosition
            val b = CameraPosition.Builder(c)
            var changed = false
            val lat = curLat; val lon = curLon
            if (followOn && lat != null && lon != null) {
                val t = c.target
                if (!camOffValid) {
                    camOffLat = (t?.latitude ?: lat) - lat; camOffLon = (t?.longitude ?: lon) - lon; camOffValid = true
                } else {
                    val f = 1 - ease(dt, 0.18)
                    camOffLat *= f; camOffLon *= f
                }
                if (abs(camOffLat) < 1e-7 && abs(camOffLon) < 1e-7) { camOffLat = 0.0; camOffLon = 0.0 } else busy = true
                val nl = lat + camOffLat; val nn = lon + camOffLon
                if (t == null || t.latitude != nl || t.longitude != nn) { b.target(LatLng(nl, nn)); changed = true }
            }
            // Навигацияда — қозғалыс бағыты, әйтпесе — солтүстік жоғарыда (режим өшкенде тегіс қайтады)
            // (Навигациядан тыс шегініс пен бұрышқа тиіспейміз — мыс. fit() қойған шегініс сақталады.)
            if (navigation || navExit) {
                var pending = false
                val tb = if (navigation) navBearing else 0.0
                if (tb != null) {
                    val d = angleDelta(c.bearing, tb)
                    if (abs(d) > 0.0) {
                        b.bearing(if (abs(d) < 0.1) tb else { pending = true; norm(c.bearing + d * ease(dt, 0.3)) }); changed = true
                    }
                }
                val pTop = c.padding?.getOrNull(1) ?: 0.0
                val tp = navTop().toDouble()
                if (abs(pTop - tp) >= 0.5) {
                    b.padding(0.0, pTop + (tp - pTop) * ease(dt, 0.15), 0.0, 0.0); pending = true; changed = true
                } else if (pTop != tp) { b.padding(0.0, tp, 0.0, 0.0); changed = true }
                if (pending) busy = true else navExit = false
            }
            if (changed) {
                frameMove = true
                try { m.moveCamera(CameraUpdateFactory.newCameraPosition(b.build())) } finally { frameMove = false }
                frameMoveAt = System.nanoTime()
                camMoved = true
            }
        }
        // Соңғы камера орнын жиі емес сақтау (қозғалыс тоқтағанда не 5 с сайын)
        if (camMoved && (!busy || now - lastSave > SAVE_NS)) {
            camMoved = false
            lastSave = now
            val c = m.cameraPosition
            c.target?.let { t -> events.onCameraIdle(t.latitude, t.longitude, c.zoom) }
        }
        if (busy) kick() else lastFrame = 0L
    }

    private fun ease(dt: Double, tau: Double) = 1 - exp(-dt / tau)
    private fun norm(a: Double) = ((a % 360) + 360) % 360
    /** [a]-дан [b]-ға ең қысқа бұрылу, градус (−180…180). */
    private fun angleDelta(a: Double, b: Double): Double { var d = (b - a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d }
    private fun distM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val x = Math.toRadians(lon2 - lon1) * cos(Math.toRadians((lat1 + lat2) / 2))
        val y = Math.toRadians(lat2 - lat1)
        return hypot(x, y) * 6_371_000.0
    }

    private companion object {
        const val MIN_STEP_NS = 300_000_000L
        const val MAX_STEP_NS = 1_500_000_000L
        const val HOLD_NS = 450_000_000L
        const val SAVE_NS = 5_000_000_000L
        /** Бұдан үлкен секіріс интерполяцияланбайды (белгі бірден жаңа орынға). */
        const val JUMP_M = 300.0
    }

    fun center(): Pair<Double, Double>? = map?.cameraPosition?.target?.let { it.latitude to it.longitude }
    fun zoom(): Double = map?.cameraPosition?.zoom ?: 0.0

    /** Картаның ортасындағы масштаб: 1 dp неше метр (MapLibre: әлем ені 512·2^zoom dp, Web Mercator). */
    fun metersPerDp(): Double {
        val c = map?.cameraPosition ?: return 0.0
        val lat = c.target?.latitude ?: return 0.0
        return 40_075_016.686 * cos(Math.toRadians(lat)) / (512.0 * Math.pow(2.0, c.zoom))
    }

    /** Экрандағы тіктөртбұрыштың (пиксельмен) географиялық шекарасы — жүктелетін аумақты таңдау үшін. */
    fun boundsOfScreenRect(left: Float, top: Float, right: Float, bottom: Float): Bounds? {
        val m = map ?: return null
        val a = m.projection.fromScreenLocation(PointF(left, top))
        val b = m.projection.fromScreenLocation(PointF(right, bottom))
        return Bounds(minOf(a.longitude, b.longitude), minOf(a.latitude, b.latitude), maxOf(a.longitude, b.longitude), maxOf(a.latitude, b.latitude))
    }

    @Suppress("unused") private fun unusedLang(l: Lang) = l
}
