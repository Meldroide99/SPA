// Dibujo de formas sobre el mapa (lo dibujado y lo importado comparten
// aspecto). Las líneas siguen la geodésica entre vértices y el círculo es un
// polígono cuyos vértices están exactamente a la distancia del radio.

import { puntosGeodesica, medir } from '../geo/index.js';
import { puntosCirculo, TRAZOS } from '../plan/plan.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Coordenadas Leaflet siguiendo la geodésica (tramos largos con puntos intermedios). */
export function trazo(puntos, cerrar = false) {
  const pts = cerrar ? [...puntos, puntos[0]] : puntos;
  const out = [];
  if (pts.length === 1) return [[pts[0].lat, pts[0].lon]];
  for (let i = 1; i < pts.length; i++) {
    const L = medir(pts[i - 1], pts[i]).distancia;
    const n = Math.min(32, Math.max(1, Math.ceil(L / 500)));
    const seg = n === 1 ? [pts[i - 1], pts[i]] : puntosGeodesica(pts[i - 1], pts[i], n);
    (i === 1 ? seg : seg.slice(1)).forEach((q) => out.push([q.lat, q.lon]));
  }
  return out;
}

/** Mitad del tramo más largo: ahí va el nombre de una línea. */
export function centroTramoLargo(puntos) {
  let mejor = 1, max = -1;
  for (let i = 1; i < puntos.length; i++) {
    const d = medir(puntos[i - 1], puntos[i]).distancia;
    if (d > max) { max = d; mejor = i; }
  }
  const m = puntosGeodesica(puntos[mejor - 1], puntos[mejor], 2)[1];
  return [m.lat, m.lon];
}

const patron = (trazoId, grosor) => TRAZOS[trazoId]?.patron?.(grosor) ?? null;

/**
 * Capa de una forma.
 * @param {object} f {tipo, puntos, radio, color, trazo, grosor, nombre, previsto, seleccionado, pane, arrastrable}
 * @returns {{grupo, principal}} `principal` es la capa a la que engancharle el clic
 */
export function capaForma(L, f) {
  const g = L.layerGroup();
  const pane = f.pane ?? 'elementos';
  const sel = Boolean(f.seleccionado);
  const grosor = f.grosor ?? 3;
  let principal;
  if (f.tipo === 'punto') {
    principal = L.marker([f.puntos[0].lat, f.puntos[0].lon], {
      pane, bubblingMouseEvents: true, draggable: Boolean(f.arrastrable), keyboard: false,
      icon: L.divIcon({
        className: 'etq-ancla',
        html: `<span class="pto-elem${sel ? ' sel' : ''}${f.previsto ? ' previsto' : ''}${f.importado ? ' importado' : ''}" style="--c:${f.color}"><i></i>${f.nombre ? `<b>${esc(f.nombre)}</b>` : ''}</span>`,
        iconSize: null,
      }),
    });
    g.addLayer(principal);
    return { grupo: g, principal };
  }
  const relleno = f.tipo !== 'linea';
  const coords = f.tipo === 'circulo' ? puntosCirculo(f.puntos[0], f.radio, 180).map((q) => [q.lat, q.lon]) : trazo(f.puntos, f.tipo === 'area');
  const halo = { pane, color: sel ? '#E0B252' : '#ffffff', weight: grosor + (sel ? 6 : 4), opacity: sel ? 0.95 : 0.65, interactive: false, lineJoin: 'round', lineCap: 'round' };
  g.addLayer(L.polyline(relleno ? [...coords, coords[0]] : coords, halo));
  const base = { pane, color: f.color, weight: grosor + (sel ? 1 : 0), opacity: 1, dashArray: patron(f.trazo, grosor), lineJoin: 'round', lineCap: 'round', bubblingMouseEvents: true };
  principal = relleno ? L.polygon(coords, { ...base, fillColor: f.color, fillOpacity: sel ? 0.18 : 0.1 }) : L.polyline(coords, base);
  g.addLayer(principal);
  if (f.tipo === 'circulo') g.addLayer(L.circleMarker([f.puntos[0].lat, f.puntos[0].lon], { pane, radius: 2.5, color: f.color, fillColor: f.color, fillOpacity: 1, weight: 1, interactive: false }));
  if (f.nombre) {
    const pos = f.tipo === 'circulo' ? [f.puntos[0].lat, f.puntos[0].lon] : relleno ? L.latLngBounds(coords).getCenter() : centroTramoLargo(f.puntos);
    g.addLayer(L.marker(pos, {
      pane, interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'etq-ancla', html: `<span class="etq-elem" style="--c:${f.color}">${esc(f.nombre)}</span>`, iconSize: null }),
    }));
  }
  return { grupo: g, principal };
}

/** Icono SVG pequeño para listas. */
export const ICONOS = {
  punto: '<circle cx="12" cy="12" r="4"/>',
  linea: '<path d="M3 18 9 9l6 5 6-9"/>',
  area: '<path d="M4 7 12 3l8 6-3 11H7z"/>',
  circulo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>',
};
