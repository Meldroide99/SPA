// Lugares (ciudades, pueblos, parajes, calles…) para el buscador.
// El mapa híbrido es una imagen: sus nombres son píxeles y no se pueden leer.
// Por eso se pregunta al nomenclátor oficial del IGN (CartoCiudad), y si no
// responde, a OpenStreetMap (Nominatim). Hace falta conexión.
//   CartoCiudad: https://www.cartociudad.es/geocoder/api/geocoder/  (JSONP)
//   Nominatim:   https://nominatim.openstreetmap.org/search          (JSON)

const CARTOCIUDAD = 'https://www.cartociudad.es/geocoder/api/geocoder';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Tipos de CartoCiudad → nombre y tamaño aproximado (m) para el zoom. */
const TIPOS = {
  provincia: ['Provincia', 100000], 'comunidad autonoma': ['Comunidad autónoma', 300000],
  municipio: ['Municipio', 10000], poblacion: ['Población', 3000], toponimo: ['Paraje', 1000],
  ngbe: ['Paraje', 1000], expendeduria: ['Lugar', 300], punto_recarga_electrica: ['Lugar', 300],
  callejero: ['Calle', 600], carretera: ['Carretera', 3000], portal: ['Dirección', 150],
  codpost: ['Código postal', 3000], refcatastral: ['Parcela', 200],
};
const tipoDe = (t) => TIPOS[String(t || '').toLowerCase()] ?? ['Lugar', 1000];
const capital = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

let n = 0;
/** JSONP: mete un <script> y espera a que llame a la función. */
export function pedirJsonp(url, { espera = 6000 } = {}) {
  return new Promise((resolver, rechazar) => {
    const fn = `__spaLugares${Date.now().toString(36)}${n++}`;
    const s = document.createElement('script');
    const fin = () => { clearTimeout(t); delete window[fn]; s.remove(); };
    const t = setTimeout(() => { fin(); rechazar(new Error('Sin respuesta')); }, espera);
    window[fn] = (datos) => { fin(); resolver(datos); };
    s.onerror = () => { fin(); rechazar(new Error('Sin conexión')); };
    s.src = `${url}${url.includes('?') ? '&' : '?'}callback=${fn}`;
    document.head.append(s);
  });
}

/** Un resultado de CartoCiudad → lugar del buscador. */
export function lugarCartoCiudad(r) {
  const [tipo, lado] = tipoDe(r.type);
  const nombre = capital(r.address || r.muni || r.province || '');
  const donde = [r.muni && capital(r.muni) !== nombre ? capital(r.muni) : '', r.province && capital(r.province) !== nombre ? capital(r.province) : ''].filter(Boolean).join(', ');
  const lat = Number(r.lat), lon = Number(r.lng);
  return { nombre, detalle: donde ? `${tipo} · ${donde}` : tipo, lat: lat || null, lon: lon || null, lado, id: r.id, tipo: r.type, fuente: 'IGN' };
}

/** Un resultado de Nominatim → lugar del buscador. */
export function lugarNominatim(r) {
  const partes = String(r.display_name || '').split(',').map((x) => x.trim());
  const b = (r.boundingbox || []).map(Number);
  const lado = b.length === 4 ? Math.max(200, Math.min(300000, Math.max(b[1] - b[0], b[3] - b[2]) * 111000)) : 1000;
  const tipo = { city: 'Ciudad', town: 'Población', village: 'Pueblo', hamlet: 'Aldea', locality: 'Paraje', peak: 'Cumbre', administrative: 'Municipio' }[r.type] ?? 'Lugar';
  return { nombre: partes[0] || '', detalle: [tipo, partes.slice(1, 3).join(', ')].filter(Boolean).join(' · '), lat: Number(r.lat), lon: Number(r.lon), lado, fuente: 'OSM' };
}

/**
 * Buscador de lugares con memoria (no repite la misma consulta).
 * @param {{jsonp?:typeof pedirJsonp, pedir?:typeof fetch, limite?:number}} [o]
 */
export function crearBuscadorLugares({ jsonp = pedirJsonp, pedir = (...a) => globalThis.fetch(...a), limite = 6 } = {}) {
  const memoria = new Map();
  async function deCartoCiudad(q) {
    const datos = await jsonp(`${CARTOCIUDAD}/candidatesJsonp?q=${encodeURIComponent(q)}&limit=${limite + 4}`);
    return (Array.isArray(datos) ? datos : []).map(lugarCartoCiudad).filter((l) => l.nombre);
  }
  async function deNominatim(q) {
    const r = await pedir(`${NOMINATIM}?format=json&limit=${limite}&accept-language=es&q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()).map(lugarNominatim).filter((l) => l.nombre);
  }
  return {
    /** Lo que ya se sabe de esta consulta (o undefined si aún no se ha preguntado). */
    enMemoria: (q) => memoria.get(q.trim().toLowerCase()),
    /** @returns {Promise<Array<{nombre:string, detalle:string, lat:number|null, lon:number|null, lado:number}>>} */
    async buscar(q) {
      const k = q.trim().toLowerCase();
      if (memoria.has(k)) return memoria.get(k);
      let lista = [];
      try { lista = await deCartoCiudad(q.trim()); } catch { /* sigue con OSM */ }
      if (!lista.length) { try { lista = await deNominatim(q.trim()); } catch { lista = []; } }
      // Sin repetidos (mismo nombre y detalle)
      const vistos = new Set();
      lista = lista.filter((l) => { const c = `${l.nombre}|${l.detalle}`; if (vistos.has(c)) return false; vistos.add(c); return true; }).slice(0, limite);
      memoria.set(k, lista);
      return lista;
    },
    /** Coordenadas de un resultado de CartoCiudad que vino sin ellas. */
    async situar(l) {
      if (l.lat != null && l.lon != null) return l;
      const r = await jsonp(`${CARTOCIUDAD}/findJsonp?q=${encodeURIComponent(l.nombre)}&type=${encodeURIComponent(l.tipo || '')}&id=${encodeURIComponent(l.id || '')}`);
      return { ...l, lat: Number(r?.lat), lon: Number(r?.lng) };
    },
  };
}
