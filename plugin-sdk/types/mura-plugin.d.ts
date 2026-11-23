/**
 * Mura GIS Plugin API 1 — TypeScript типтері.
 * Плагин кодында жалғыз жаһандық нысан бар: `mura`. Node.js, файлдық жүйе, бағдарлама беті (DOM) қолжетімсіз;
 * `fetch` — тек плагиннің өз файлдарына (мыс. `fetch('config/schema.json')`) және `network.access` берілсе — HTTPS-ке.
 * Әр асинхронды әдіс рұқсат жоқ болса `code: 'permission'` қатесімен қабылданбайды.
 */
declare namespace MuraPlugin {
  type Lang = 'kk' | 'ru';
  type Text = string | { kk?: string; ru?: string; en?: string; [lang: string]: string | undefined };
  type Permission = 'geometry.read' | 'geometry.write' | 'attributes.read' | 'attributes.write' | 'map.layers' | 'files.export' | 'network.access' | 'project.metadata' | 'files.import';
  type ExtensionPoint = 'zone.export' | 'tools.menu' | 'mark.suggest' | 'zone.suggest';
  type Layer = 'marks' | 'zones' | 'routes' | 'places' | 'plan_objects';
  type Position = [number, number] | [number, number, number];
  type Geometry =
    | { type: 'Point'; coordinates: Position }
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'Polygon'; coordinates: Position[][] }
    | { type: 'MultiPoint'; coordinates: Position[] }
    | { type: 'MultiLineString'; coordinates: Position[][] }
    | { type: 'MultiPolygon'; coordinates: Position[][][] };
  interface Feature { type: 'Feature'; properties: Record<string, unknown> | null; geometry: Geometry | null; id?: string | number }
  interface FeatureCollection { type: 'FeatureCollection'; features: Feature[]; [k: string]: unknown }
  type GeoJSON = Geometry | Feature | FeatureCollection;
  /** EPSG:4326, EPSG:3857, EPSG:326NN / EPSG:327NN (WGS 84 / UTM). */
  type Crs = string;

  interface CommandContext {
    point: ExtensionPoint;
    lang: Lang;
    /** Құжат (экспорт) тілі — интерфейс тілінен тәуелсіз. */
    docLang: Lang;
    /** zone.export: ағымдағы аймақ (id — сақталмаса null). */
    zone?: { id: string | null; markId: string | null; saved: boolean };
    /** zone.export: қайдан шақырылды — 'current' (Нәтиже және экспорт) не 'all' («Қорғау аймақтары» тізімі). */
    scope?: 'current' | 'all';
    /** tools.menu: белсенді қызмет (marks | routes | zone | plan …). */
    service?: string;
  }
  /** zone.export / tools.menu: ағымдағы аймақ; mark.suggest: белгі терезесінде ашық тұрған белгі (сақталмаған болса id: null). */
  interface Selection<T> { layer: 'zones' | 'marks'; id: string | null; saved: boolean }
  /** mark.suggest командасының нәтижесі: бағдарлама ұсыныстарды белгі терезесінде көрсетеді, таңдалса өрістерді өзі толтырады. */
  interface MarkSuggestion {
    /** Тізімдегі жазу (≤ 200 таңба), мыс. «№216 Ақбұлақсай қорғаны». */
    title: string;
    /** Қосымша (≤ 300 таңба): аудан, мерзім, қашықтық, дереккөз. */
    detail?: string;
    /** Толтырылатын өрістер (бос емесі ғана): мәтін өрістері, type: archeo|arch|ensemble|sacred|art, category: ''|intl|rep|local, status: state|prelim|archreg|excluded. */
    fields: Partial<Record<'name' | 'name_ru' | 'period' | 'period_ru' | 'place' | 'place_ru' | 'district' | 'oblast' | 'note' | 'note_ru' | 'type' | 'category' | 'status', string>>;
  }
  /** mark.suggest / zone.suggest нәтижесі. hint (≤ 200 таңба, 2.4.4+) — ұсыныс жоқ кезде көрсетілетін кеңес. */
  interface MarkSuggestResult { items: MarkSuggestion[]; hint?: string }
  interface OpenedFile { name: string; size: number; data: Uint8Array }
  interface GeometrySelection extends Selection<Geometry> { geometry: Geometry | null }
  interface AttributesSelection extends Selection<unknown> { attributes: Record<string, unknown> & { mark_id: string | null } }

  interface SchemaField {
    name: string; type?: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime'; required?: boolean;
    maxLength?: number; min?: number; max?: number; enum?: unknown[]; pattern?: string;
    /** Дереккөз жолы: 'mark.name', ['mark.name', 'zone.name'] — бірінші бос еместігі. */
    source?: string | string[]; value?: unknown; default?: unknown;
    /** Mura GIS кодын сыртқы жүйе мәніне айналдыру: { local: 'Местного значения' }. */
    valueMap?: Record<string, unknown>;
  }
  interface Schema { fields: SchemaField[]; [k: string]: unknown }
  interface Style { color?: string; weight?: number; opacity?: number; fillColor?: string; fillOpacity?: number; dashArray?: string; radius?: number; label?: string; symbol?: string }
  type Block =
    | { type: 'heading' | 'code'; text: string }
    | { type: 'text'; text: string; tone?: 'info' | 'warn' | 'error' | 'muted' | 'ok' }
    | { type: 'list'; items: string[] }
    | { type: 'table'; columns?: string[]; rows: unknown[][] }
    | { type: 'field'; key: string; kind?: 'string' | 'text' | 'number' | 'boolean' | 'select'; label?: string; value?: unknown; required?: boolean;
        options?: Array<string | { value: string; title?: Text }>; description?: string; rows?: number };
  interface DialogSpec { title?: Text; width?: 'normal' | 'wide'; body?: Block[]; buttons?: Array<{ id: string; title: Text; primary?: boolean }> }
  interface Panel {
    readonly id: string;
    update(spec: DialogSpec): Promise<boolean>;
    close(): Promise<boolean>;
    onAction(fn: (e: { button: string; values: Record<string, unknown> }) => void): void;
    onClose(fn: () => void): void;
  }

  interface Api {
    readonly apiVersion: '1';
    readonly app: { version: string; platform: 'desktop' | 'tablet' | 'mobile' | 'web'; lang: Lang; docLang: Lang };
    readonly plugin: { id: string; version: string; permissions: Permission[] };
    hasPermission(p: Permission): boolean;
    commands: { register(name: string, fn: (ctx: CommandContext) => unknown | Promise<unknown>): void };
    settings: { get(): Promise<Record<string, string | number | boolean>> };
    /** Плагиннің жеке деректері (жобадан бөлек, шегі 5 МБ; рұқсат керек емес). */
    storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<true>; remove(key: string): Promise<true>; keys(): Promise<string[]> };
    /** project.metadata */
    project: { info(): Promise<{ open: boolean; name?: string; oblast?: string; district?: string; counts?: Record<string, number>; appVersion: string }> };
    geometry: {
      /** geometry.read — ағымдағы ескерткіш аумағының полигоны (қорғау аймақтарынсыз). */
      selection(): Promise<GeometrySelection | null>;
      list(layer: Layer, opts?: { bbox?: [number, number, number, number]; limit?: number; offset?: number }): Promise<Array<{ id: string; geometry: Geometry }>>;
      get(layer: Layer, id: string): Promise<{ id: string; geometry: Geometry | null } | null>;
      type(g: GeoJSON): string | null;
      bbox(g: GeoJSON): [number, number, number, number] | null;
      /** Геодезиялық аудан, м² (EPSG:4326). */
      area(g: GeoJSON): number;
      orient(ring: Position[], ccw: boolean): Position[];
      validate(g: GeoJSON, opts?: { crs?: Crs }): { ok: boolean; errors: string[] };
      transform<T extends GeoJSON>(g: T, from: Crs, to: Crs, opts?: { precision?: number }): T;
      supported(crs: Crs): boolean;
      utmFor(lon: number, lat: number): Crs;
    };
    attributes: {
      /** attributes.read */
      selection(): Promise<AttributesSelection | null>;
      list(layer: Layer, opts?: { limit?: number; offset?: number }): Promise<Array<{ id: string; attributes: Record<string, unknown> }>>;
      get(layer: Layer, id: string): Promise<{ id: string; attributes: Record<string, unknown> } | null>;
      map(sources: Record<string, unknown>, schema: Schema): Record<string, unknown>;
      validate(rec: Record<string, unknown>, schema: Schema, opts?: { strict?: boolean }): { ok: boolean; errors: Array<{ field: string; message: string }> };
      checkSchema(schema: unknown): { ok: boolean; errors: string[] };
    };
    /** map.layers */
    map: {
      addLayer(id: string, geojson: GeoJSON, style?: Style): Promise<true>;
      removeLayer(id: string): Promise<true>;
      clearLayers(): Promise<true>;
      showTemporary(geojson: GeoJSON, style?: Style, opts?: { fit?: boolean }): Promise<true>;
      clearTemporary(): Promise<true>;
      registerSymbol(name: string, spec: { shape?: 'circle' | 'square' | 'triangle' | 'diamond'; color?: string; fill?: string; size?: number }): Promise<true>;
      /** Пайдаланушы картадан нүкте таңдайды (Esc — null). markId — жақын тұрған ескерткіш белгісі. */
      pick(opts?: { message?: string }): Promise<{ lat: number; lon: number; markId: string | null } | null>;
    };
    /** files.export — орнын пайдаланушы «Сақтау» терезесінде таңдайды. */
    export: { saveFile(o: { suggestedName: string; data: string | ArrayBuffer | ArrayBufferView | object; filters?: Array<{ name: string; extensions: string[] }>; title?: string }): Promise<{ saved: boolean; name?: string; size?: number }> };
    /** files.import (Mura GIS 2.4.2+) — файлды пайдаланушы «Ашу» терезесінде таңдайды; плагин жолын білмейді. Бас тартса — []. ≤ 10 файл, әрқайсысы ≤ 100 МБ. */
    files: { open(o?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }>; title?: string }): Promise<OpenedFile[]> };
    ui: {
      notify(text: string, opts?: { type?: 'info' | 'error' }): Promise<true>;
      confirm(text: string, opts?: { title?: Text }): Promise<boolean>;
      dialog(spec: DialogSpec): Promise<{ button: string | null; values: Record<string, unknown> }>;
      panel: { open(spec: DialogSpec): Promise<Panel> };
    };
    i18n: { t(key: string, vars?: Record<string, unknown>, lang?: Lang): string; ready(): Promise<true>; load(lang: Lang): Promise<Record<string, string>> };
    log: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
  }
}
declare const mura: MuraPlugin.Api;
