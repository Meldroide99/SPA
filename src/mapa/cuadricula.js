// Cuadrícula MGRS / UTM dibujada con el motor geodésico.
//
// Las líneas de cuadrícula son líneas de Este o Norte UTM constantes. Se
// calculan punto a punto con utmAGeo (exacto) y se dibujan como polilíneas,
// así que caen exactamente donde dicen las coordenadas, en cualquier zoom.
// Cerca del borde de huso, cada huso dibuja su propia cuadrícula y se marca
// el límite.

import { geoAUtm, utmAGeo, meridianoCentral, zonaUTM, utmAMgrs, bandaLatitud } from '../geo/index.js';

/** Separación de líneas según el zoom (metros). */
export function pasoCuadricula(zoom) {
  if (zoom < 7) return 0;
  if (zoom < 10) return 100000;
  if (zoom < 12) return 10000;
  if (zoom < 16) return 1000;
  return 100;
}

const ESTILO = {
  100000: { color: '#0C2E4B', weight: 1.6, opacity: 0.85 },
  10000: { color: '#0C2E4B', weight: 1.1, opacity: 0.7 },
  1000: { color: '#0C2E4B', weight: 0.9, opacity: 0.55 },
  100: { color: '#0C2E4B', weight: 0.6, opacity: 0.45 },
};

/**
 * Calcula las polilíneas de la cuadrícula para una vista.
 * @param {{sur,norte,oeste,este}} vista grados
 * @param {number} paso metros
 * @returns {{lineas:Array, etiquetas:Array, husos:Array}}
 */
export function calcularCuadricula(vista, paso) {
  const lineas = [], etiquetas = [], husos = [];
  if (!paso) return { lineas, etiquetas, husos };
  const sur = Math.max(vista.sur, -80), norte = Math.min(vista.norte, 84);
  if (sur >= norte) return { lineas, etiquetas, husos };

  const zIni = zonaUTM((sur + norte) / 2, Math.max(vista.oeste, -180));
  const zFin = zonaUTM((sur + norte) / 2, Math.min(vista.este, 179.999999));
  for (let zona = zIni; zona <= zFin; zona++) {
    const cm = meridianoCentral(zona);
    const lonO = Math.max(vista.oeste, cm - 3), lonE = Math.min(vista.este, cm + 3);
    if (lonO >= lonE) continue;
    if (zIni !== zFin) {
      if (lonO === cm - 3) husos.push(cm - 3);
    }

    // Extensión de la vista en coordenadas UTM de este huso (muestreando el borde)
    let eMin = Infinity, eMax = -Infinity, nMin = Infinity, nMax = -Infinity;
    const hem = (sur + norte) / 2 < 0 ? 'S' : 'N';
    for (let i = 0; i <= 8; i++) {
      for (const [la, lo] of [[sur + (norte - sur) * i / 8, lonO], [sur + (norte - sur) * i / 8, lonE],
        [sur, lonO + (lonE - lonO) * i / 8], [norte, lonO + (lonE - lonO) * i / 8]]) {
        const u = geoAUtm(la, lo, { zona });
        let n = u.norte;
        if (u.hemisferio !== hem) n += hem === 'N' ? -10000000 : 10000000;
        eMin = Math.min(eMin, u.este); eMax = Math.max(eMax, u.este);
        nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
      }
    }
    const dentro = (p) => p.lon >= cm - 3 - 1e-9 && p.lon <= cm + 3 + 1e-9;
    const muestras = 24;

    // Líneas de Este constante
    for (let e = Math.ceil(eMin / paso) * paso; e <= eMax; e += paso) {
      const tramo = [];
      for (let i = 0; i <= muestras; i++) {
        const n = nMin + (nMax - nMin) * i / muestras;
        const g = utmAGeo(zona, hem, e, n);
        if (dentro(g)) tramo.push([g.lat, g.lon]);
      }
      if (tramo.length > 1) {
        lineas.push({ puntos: tramo, paso: e % (paso * 10) === 0 ? paso * 10 : paso, eje: 'E', valor: e });
        etiquetas.push({ eje: 'E', valor: e, zona, punto: tramo[0], paso });
      }
    }
    // Líneas de Norte constante
    for (let n = Math.ceil(nMin / paso) * paso; n <= nMax; n += paso) {
      const tramo = [];
      for (let i = 0; i <= muestras; i++) {
        const e = eMin + (eMax - eMin) * i / muestras;
        const g = utmAGeo(zona, hem, e, n);
        if (dentro(g)) tramo.push([g.lat, g.lon]);
      }
      if (tramo.length > 1) {
        lineas.push({ puntos: tramo, paso: n % (paso * 10) === 0 ? paso * 10 : paso, eje: 'N', valor: n });
        etiquetas.push({ eje: 'N', valor: n, zona, punto: tramo[0], paso });
      }
    }

    // Nombres de los cuadrados de 100 km visibles (centro de cada cuadrado)
    if (paso >= 1000) {
      for (let e = Math.floor(eMin / 1e5) * 1e5; e < eMax; e += 1e5) {
        for (let n = Math.floor(nMin / 1e5) * 1e5; n < nMax; n += 1e5) {
          const g = utmAGeo(zona, hem, e + 5e4, n + 5e4);
          if (!dentro(g) || e < 1e5 || e >= 9e5) continue;
          try {
            const nombre = utmAMgrs(zona, bandaLatitud(g.lat), e + 5e4, n + 5e4, 0, { separado: true });
            etiquetas.push({ eje: 'cuadrado', texto: nombre, punto: [g.lat, g.lon] });
          } catch { /* fuera de ámbito */ }
        }
      }
    }
  }
  return { lineas, etiquetas, husos };
}

/** Texto de la etiqueta de una línea: las cifras MGRS de ese nivel. */
export function textoEtiqueta(valor, paso) {
  const dentro100 = ((valor % 100000) + 100000) % 100000;
  if (paso >= 100000) return '';
  if (paso === 10000) return String(dentro100 / 10000);
  if (paso === 1000) return String(dentro100 / 1000).padStart(2, '0');
  return String(dentro100 / 100).padStart(3, '0');
}

/**
 * Capa Leaflet de cuadrícula que se recalcula al mover el mapa.
 * Las etiquetas de línea se colocan pegadas a los bordes izquierdo e inferior
 * de la pantalla, como en el margen de una carta.
 */
export function capaCuadricula(L, mapa, opc = {}) {
  const intensidad = opc.intensidad ?? (() => 1);   // 0–1: multiplica la opacidad de las líneas
  const obstaculos = opc.obstaculos ?? (() => []);  // rectángulos {x0,y0,x1,y1} que las etiquetas no deben tapar
  const claro = opc.claro ?? (() => false);          // true sobre imagen (híbrido): líneas y rótulos en blanco
  const grupo = L.layerGroup();
  const panel = 'cuadricula';
  if (!mapa.getPane(panel)) {
    const p = mapa.createPane(panel); p.style.zIndex = 450; p.style.pointerEvents = 'none';
  }

  function redibujar() {
    grupo.clearLayers();
    if (!mapa.hasLayer(grupo)) return;
    const blanco = claro();
    mapa.getPane(panel).classList.toggle('cuad-claro', blanco);
    const b = mapa.getBounds().pad(0.05);
    const paso = pasoCuadricula(mapa.getZoom());
    const { lineas, etiquetas, husos } = calcularCuadricula(
      { sur: b.getSouth(), norte: b.getNorth(), oeste: b.getWest(), este: b.getEast() }, paso);
    for (const l of lineas) {
      const est = ESTILO[Math.min(l.paso, 100000)] ?? ESTILO[paso];
      L.polyline(l.puntos, { ...est, ...(blanco ? { color: '#FFFFFF', opacity: Math.min(1, est.opacity * 1.2) * intensidad() } : { opacity: est.opacity * intensidad() }), pane: panel, interactive: false, smoothFactor: 0 }).addTo(grupo);
    }
    for (const lon of husos) {
      L.polyline([[b.getSouth(), lon], [b.getNorth(), lon]], { color: '#A3362B', weight: 2, dashArray: '8 6', pane: panel, interactive: false }).addTo(grupo);
    }
    // Etiquetas en los márgenes de la pantalla
    const tam = mapa.getSize();
    const rects = obstaculos();
    const tapa = (p, ax, ay) => rects.some((r) => p.x + ax > r.x0 && p.x - ax < r.x1 && p.y + ay > r.y0 && p.y - ay < r.y1);
    for (const et of etiquetas) {
      if (et.eje === 'cuadrado') {
        L.marker(et.punto, { pane: panel, interactive: false, icon: L.divIcon({ className: 'etq-ancla', html: `<span class="cuad-100k">${et.texto}</span>`, iconSize: null }) }).addTo(grupo);
        continue;
      }
      const texto = textoEtiqueta(et.valor, et.paso);
      if (!texto) continue;
      // Punto de la línea en el borde: se busca la intersección con el borde
      // inferior (líneas E) o izquierdo (líneas N) en píxeles de pantalla.
      const linea = lineas.find((l) => l.eje === et.eje && l.valor === et.valor);
      const px = linea.puntos.map((p) => mapa.latLngToContainerPoint(p));
      let pos = null;
      for (let i = 1; i < px.length && !pos; i++) {
        const a = px[i - 1], c = px[i];
        if (et.eje === 'E') {
          const y = tam.y - 14;
          if ((a.y - y) * (c.y - y) <= 0 && a.y !== c.y) { const t = (y - a.y) / (c.y - a.y); pos = L.point(a.x + t * (c.x - a.x), y); }
        } else {
          const x = 14;
          if ((a.x - x) * (c.x - x) <= 0 && a.x !== c.x) { const t = (x - a.x) / (c.x - a.x); pos = L.point(x, a.y + t * (c.y - a.y)); }
        }
      }
      if (!pos) continue;
      // No tapar los controles ni los paneles abiertos
      if (pos.x < 4 || pos.x > tam.x - 4 || pos.y < 4 || pos.y > tam.y - 4) continue;
      if (tapa(pos, 18, 9)) continue;
      L.marker(mapa.containerPointToLatLng(pos), {
        pane: panel, interactive: false,
        icon: L.divIcon({ className: 'etq-ancla', html: `<span class="etq-cuad etq-${et.eje}">${texto}</span>`, iconSize: null }),
      }).addTo(grupo);
    }
  }
  mapa.on('moveend zoomend resize', redibujar);
  grupo.on('add', () => setTimeout(redibujar, 0));
  grupo.redibujar = redibujar;
  return grupo;
}
