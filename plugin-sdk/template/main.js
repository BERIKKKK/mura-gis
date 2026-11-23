/* Mura GIS плагинінің шаблоны (Plugin API 1). Қолжетімдісі — тек globalThis.mura (plugin-sdk/types/mura-plugin.d.ts).
   Командалар манифесттегі contributes[*].command атауларымен тіркеледі. */
'use strict';

mura.commands.register('hello', async (ctx) => {
  await mura.i18n.ready();
  const t = mura.i18n.t;
  const info = await mura.project.info();                     // рұқсат: project.metadata
  const { radius } = await mura.settings.get();
  const count = ((await mura.storage.get('count')) || 0) + 1;  // плагиннің жеке деректері (рұқсат керек емес)
  await mura.storage.set('count', count);

  const r = await mura.ui.dialog({
    title: t('title'),
    body: [
      { type: 'text', text: t('project', { name: info.open ? info.name : '—', oblast: info.oblast || '—' }) },
      { type: 'text', tone: 'muted', text: t('runs', { n: count }) },
      { type: 'field', key: 'radius', kind: 'number', label: t('radius'), value: radius },
    ],
    buttons: [{ id: 'cancel', title: t('cancel') }, { id: 'pick', title: t('pick'), primary: true }],
  });
  if (!r || r.button !== 'pick') return { ok: false };

  const p = await mura.map.pick({ message: t('pickMsg') });     // рұқсат: map.layers
  if (!p) return { ok: false };
  const R = Number(r.values.radius) > 0 ? Number(r.values.radius) : radius;
  const ring = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    ring.push([p.lon + (R / (111320 * Math.cos(p.lat * Math.PI / 180))) * Math.cos(a), p.lat + (R / 110540) * Math.sin(a)]);
  }
  ring[48] = ring[0].slice();
  const circle = { type: 'Polygon', coordinates: [ring] };
  await mura.map.showTemporary(circle, { color: '#2f6f73', fillOpacity: 0.12 }, { fit: true });
  const ha = Math.round(mura.geometry.area(circle) / 100) / 100;
  await mura.ui.notify(t('done', { ha }));
  return { ok: true, lat: p.lat, lon: p.lon, ha };
});
