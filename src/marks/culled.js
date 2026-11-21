/* Mura GIS: мыңдаған нүктені картада қатпай көрсету (белгілер мен импортталған нүктелер үшін).
   • DOM-белгі (L.marker, SVG) тек картаның көрініп тұрған бөлігіндегі (+ шетіндегі) нүктелерге жасалады;
     карта жылжығанда (moveend) тек айырмасы қосылады / алынады, жасалған белгілер кэште қалады.
   • Көрініп тұрған нүкте limit-тен көп болса (кіші масштаб) — бәрі бір canvas-қа шағын дөңгелек болып салынады:
     мыңдаған DOM элементінің орнына бір <canvas>.
   • sig(item) — нүктенің картадағы түріне әсер ететін мәндер: өзгермесе белгі қайта жасалмайды. */
const L = globalThis.L;

export function culledLayer(map, o) {
  const limit = o.limit || 500, pad = o.pad ?? 0.3;
  const group = L.layerGroup();
  const renderer = L.canvas({ padding: 0.4, tolerance: 4 });
  const dotGroup = L.layerGroup();
  const pins = new Map();     // id → { mk, sig }
  const dots = new Map();     // id → { mk, sig }
  let list = [], mode = '', raf = 0;

  function dropStale(cache, holder, byId) {
    for (const [id, p] of cache) {
      const it = byId.get(id);
      if (!it || o.sig(it) !== p.sig) { holder.removeLayer(p.mk); cache.delete(id); }
    }
  }
  function syncDots() {
    for (const it of list) {
      if (dots.has(it.id)) continue;
      const mk = o.dot(it, renderer);
      dots.set(it.id, { mk, sig: o.sig(it) });
      dotGroup.addLayer(mk);
    }
  }
  function sync() {
    raf = 0;
    if (!map.hasLayer(group)) return;
    const b = map.getBounds().pad(pad);
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
    const inView = [];
    for (const it of list) if (it.lat >= s && it.lat <= n && it.lon >= w && it.lon <= e) inView.push(it);
    // Дөңгелектер қабаты картадан алынбайды — тек canvas жасырылады: мыңдаған нүктені алып / қайта қосу қымбат
    const showDots = on => { if (renderer._container) renderer._container.style.display = on ? '' : 'none'; };
    if (inView.length > limit) {
      if (mode !== 'dots') for (const p of pins.values()) group.removeLayer(p.mk);
      syncDots();
      if (!group.hasLayer(dotGroup)) group.addLayer(dotGroup);
      showDots(true);
      mode = 'dots';
      return;
    }
    showDots(false);
    const want = new Set();
    for (const it of inView) {
      let p = pins.get(it.id);
      if (!p) { p = { mk: o.pin(it), sig: o.sig(it) }; pins.set(it.id, p); }
      want.add(it.id);
      if (!group.hasLayer(p.mk)) group.addLayer(p.mk);
    }
    for (const [id, p] of pins) {
      if (want.has(id)) continue;
      group.removeLayer(p.mk);
      if (pins.size > limit * 4) pins.delete(id);   // кэш шектеулі: алыс белгілер қайта керек болғанда жасалады
    }
    mode = 'pins';
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(sync); };
  map.on('moveend', schedule);
  group.on('add', schedule);

  return {
    layer: group,
    /** Жаңа тізім: өзгерген / өшірілген нүктелердің белгілері алынады, қалғандары қайта қолданылады. */
    setData(next) {
      list = next.filter(it => Number.isFinite(it.lat) && Number.isFinite(it.lon));
      const byId = new Map(list.map(it => [it.id, it]));
      dropStale(pins, group, byId);
      dropStale(dots, dotGroup, byId);
      if (mode === 'dots') syncDots();
      schedule();
    },
    /** Барлық белгіні қайта жасау (мысалы, жазулар қосылып / өшірілгенде). */
    rebuild(withDots) {
      for (const p of pins.values()) group.removeLayer(p.mk);
      pins.clear();
      if (withDots) { dotGroup.clearLayers(); dots.clear(); }
      schedule();
    },
    syncNow() { if (raf) cancelAnimationFrame(raf); sync(); },
    pin: id => pins.get(id)?.mk || null,
    /** Нүкте қазіргі тізімде бар ма (сүзгіден өткен бе). */
    has: id => list.some(it => it.id === id),
    eachPin(fn) { for (const p of pins.values()) fn(p.mk); },
    get mode() { return mode; },
  };
}

/** Тізімді бөлшектеп салу: алдымен step карточка, қалғаны тізім соңына айналдырғанда (IntersectionObserver).
    pieces — HTML жолдарының итераторы (генератор): карточкалар тек көрсетілерде ғана құрастырылады. total — қалғанын санау үшін. */
export function progressiveList(box, step = 150) {
  let io = null;
  return function paint(pieces, total, tail = '') {
    if (io) { io.disconnect(); io = null; }
    const it = pieces[Symbol.iterator]();
    let shown = 0;
    box.innerHTML = '';
    const more = () => {
      if (io) io.disconnect();
      box.querySelector(':scope > .mk-more')?.remove();
      let html = '', done = false;
      for (let k = 0; k < step; k++) {
        const r = it.next();
        if (r.done) { done = true; break; }
        html += r.value; shown++;
      }
      box.insertAdjacentHTML('beforeend', html);
      if (done || shown >= total) { if (tail) box.insertAdjacentHTML('beforeend', tail); io = null; return; }
      const s = document.createElement('div');
      s.className = 'mk-more qa-empty';
      s.textContent = 'Тағы ' + (total - shown) + '…';
      box.appendChild(s);
      io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) more(); });
      io.observe(s);
    };
    more();
  };
}
