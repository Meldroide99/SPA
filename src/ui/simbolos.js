// Símbolos en el mapa: paleta (unidades, material, instalaciones, medidas de
// coordinación y cometidos), constructor guiado, recientes, arrastrar y soltar,
// colocar con un clic y fichas de edición.
//
// Los elementos del plan llevan `simbolo`:
//   unidad   {clase:'unidad', conjunto, identidad, icono, mod1, mod2, escalon, movilidad, cg, ft, finta, refuerzo, T, M, H, zoom}
//   medida   {clase:'medida', id, ancho?, escalon?, izq?, der?, giro?, tam?, zoom}
// `zoom` es el zoom al colocarlo: el símbolo crece al acercar solo hasta un
// tope y encoge al alejar (tamaño en Ajustes › Símbolos).
// El estado (presente/previsto) y el nombre siguen en `propiedades`.

import { svgUnidad, IDENTIDADES, ESCALONES, ENTIDADES, CONJUNTOS, MOVILIDAD, modificadoresDe } from '../simbolos/app6.js';
import { ARMAS, ORDEN_ESCALONES, nombreEscalon, nombreUnidad, especialidadDe, candidatosUnidad, arbol, escalonesDe } from '../simbolos/catalogo.js';
import { MEDIDAS, GRUPOS, medida, geometria, glifoPunto, glifoZona, puntosNecesarios, tipoElemento, plano } from '../simbolos/medidas.js';
import { buscar as buscarDifuso } from './difuso.js';
import { esc } from './formas.js';

const CLAVE = 'spa.simbolos';
const BANDO_DE = { amigo: 'propio', supuesto: 'propio', hostil: 'enemigo', sospechoso: 'enemigo', neutral: 'neutral', desconocido: 'desconocido', pendiente: 'desconocido' };
const IDENTIDAD_DE = { propio: 'amigo', enemigo: 'hostil', neutral: 'neutral', desconocido: 'desconocido' };
export const identidadDeBando = (b) => IDENTIDAD_DE[b] ?? 'amigo';
const AZUL = '#1F5FA8';

// Tamaño con el zoom: tope al acercar y mínimo al alejar (respecto al zoom al colocarlo)
export const TOPE_CRECER = 1.35;
export const MINIMO = 0.28;
/** Zoom al que todos los símbolos tienen el tamaño elegido en Ajustes. */
export const ZOOM_REFERENCIA = 14;
export const factorZoom = (zActual, z0) => Math.min(TOPE_CRECER, Math.max(MINIMO, 2 ** (zActual - (z0 ?? zActual))));

/** Miniatura de una unidad para listas y botones. */
export const miniUnidad = (s, tam = 26) => svgUnidad({ escalon: '', ...s }, { tam, sinTextos: true }).svg;

// ---------------------------------------------------------------- plantillas (miniaturas y arrastrar y soltar)
// Coordenadas de ejemplo (x 0–100 este, y 0–60 norte) de los puntos de anclaje.
const EJ = {
  bloquear: [[75, 52], [75, 8], [10, 30]], penetrar: [[75, 52], [75, 8], [10, 30]], 'efecto-bloqueo': [[75, 52], [75, 8], [10, 30]],
  brecha: [[80, 52], [80, 8], [20, 30]], desbordar: [[80, 52], [80, 8], [20, 30]], canalizar: [[80, 52], [80, 8], [20, 30]], limpiar: [[80, 52], [80, 8], [15, 30]],
  'rodeo-facil': [[80, 52], [80, 8], [20, 30]], 'rodeo-dificil': [[80, 52], [80, 8], [20, 30]], 'rodeo-imposible': [[80, 52], [80, 8], [20, 30]],
  contener: [[60, 54], [60, 6]], tomar: [[20, 30], [30, 30], [58, 52], [92, 30]], capturar: [[20, 30], [30, 30], [58, 52], [92, 30]], evacuar: [[20, 30], [30, 30], [58, 52], [92, 30]], recuperar: [[20, 30], [30, 30], [58, 52], [92, 30]],
  fijar: [[92, 30], [8, 30]], 'efecto-fijar': [[92, 30], [8, 30]], 'seguir-asumir': [[92, 30], [8, 30]], 'seguir-apoyar': [[92, 30], [8, 30]], explotar: [[92, 30], [8, 30], [20, 30]],
  retardar: [[10, 30], [70, 30], [70, 55]], retirada: [[10, 30], [70, 30], [70, 55]], replegarse: [[10, 30], [70, 30], [70, 55]], 'replegarse-presion': [[10, 30], [70, 30], [70, 55]],
  ruptura: [[10, 30], [70, 30], [70, 55]], 'paso-adelante': [[10, 30], [70, 30], [70, 55]], 'paso-atras': [[10, 30], [70, 30], [70, 55]], 'defensa-movil': [[10, 45], [70, 45], [70, 15]], perseguir: [[10, 30], [70, 30], [70, 55]],
  desorganizar: [[20, 55], [20, 5], [90, 30]], 'efecto-desorganizar': [[20, 55], [20, 5], [90, 30]], envolver: [[8, 25], [55, 25], [85, 25], [70, 50]], emboscada: [[90, 30], [20, 55], [20, 5]],
  cubrir: [[8, 30], [42, 30], [58, 30], [92, 30]], vigilar: [[8, 30], [42, 30], [58, 30], [92, 30]], observar: [[8, 30], [42, 30], [58, 30], [92, 30]],
  relevo: [[10, 15], [60, 15], [60, 45], [10, 45]], demostracion: [[10, 15], [60, 15], [60, 45], [10, 45]], escoltar: [[50, 22], [15, 22], [85, 22]],
  exfiltrar: [[8, 20], [50, 32], [92, 20]], infiltrar: [[8, 20], [50, 32], [92, 20]], desviar: [[85, 10], [10, 50], [70, 52]], 'efecto-desviar': [[85, 10], [10, 50], [70, 52]],
  sbf: [[30, 18], [70, 18], [25, 50], [75, 50]], abf: [[50, 52], [30, 18], [70, 18]], 'campo-tiro': [[50, 8], [15, 55], [85, 55]], 'zona-busqueda': [[10, 30], [90, 55], [90, 5]],
  'abanico-sector': [[50, 5], [15, 55], [85, 55]], 'racimo-minas': [[20, 18], [80, 18]], 'cable-trampa': [[20, 30], [80, 30]], 'posicion-fortificada': [[20, 15], [80, 15]],
  puente: [[20, 15], [80, 15], [50, 45]], 'cruce-asalto': [[20, 15], [80, 15], [50, 45]], 'vado-facil': [[20, 15], [80, 15], [50, 45]], 'vado-dificil': [[20, 15], [80, 15], [50, 45]],
  'corte-previsto': [[20, 15], [80, 15], [50, 40]], 'corte-sr1': [[20, 15], [80, 15], [50, 40]], 'corte-sr2': [[20, 15], [80, 15], [50, 40]], 'corte-ejecutado': [[20, 15], [80, 15], [50, 40]],
  convoy: [[90, 30], [10, 30]], 'convoy-detenido': [[90, 30], [10, 30]], senuelo: [[50, 52], [15, 10], [85, 10]], finta: [[50, 52], [15, 10], [85, 10]],
  'defensa-zona': [[50, 30], [72, 30]], retener: [[50, 30], [72, 30]],
};
function ejemplo(m) {
  if (EJ[m.id]) return EJ[m.id];
  const n = puntosNecesarios(m);
  if (m.forma === 'area') return [[10, 10], [90, 8], [92, 52], [8, 50]];
  if (m.forma === 'rect') return [[15, 30], [85, 30]];
  if (m.forma === 'circulo') return [[50, 30], [76, 30]];
  if (m.forma === 'eje') return [[8, 20], [45, 30], [92, 30]];
  if (n === 1) return [[50, 30]];
  if (n === 2 && m.forma === 'especial' && !['transbordador', 'balsas', 'paso-seguro'].includes(m.id)) return [[50, 30], [74, 30]];
  return [[5, 30], [95, 30]];
}

/** Miniatura de una medida o cometido. */
export function miniMedida(m, color = AZUL, ancho = 64, alto = 38) {
  if (!m) return '';
  if (m.forma === 'punto') {
    const r = glifoPunto(m.glifo, color, Math.min(alto * 0.62, 26));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${r.svg.replace('<svg ', `<svg x="${((ancho - r.ancho) / 2).toFixed(1)}" y="${((alto - r.alto) / 2).toFixed(1)}" `)}</svg>`;
  }
  const K = 1 / 111320;
  const anclas = ejemplo(m).map(([x, y]) => ({ lat: y * 10 * K, lon: x * 10 * K }));
  const mpp = 1000 / ancho;
  const g = geometria(m, anclas, { nombre: '', escalonMarca: 'II', mpp, tam: 520 });
  const pt = ([la, lo]) => [(lo / K / 10) * (ancho / 100), alto - (la / K / 10) * (alto / 60)];
  const ruta = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${pt(p).map((v) => v.toFixed(1)).join(',')}`).join(' ');
  const rell = g.rellenos.map((r) => `<path d="${ruta(r.pts)}Z" fill="${r.color ?? m.color ?? color}" fill-opacity="${r.opacidad ?? 0.3}" stroke="none"/>`).join('');
  const lineas = g.lineas.map((l) => `<path d="${ruta(l.pts)}" fill="none" stroke="${l.color ?? m.color ?? color}" stroke-width="${(1.5 * (l.grosor ?? 1)).toFixed(2)}"${l.discontinua ? ' stroke-dasharray="4 3"' : ''}/>`).join('');
  const glifos = g.glifos.map((q) => {
    const r = q.zona ? glifoZona(q.zona, color, 16) : glifoPunto(q.g, color, 16 * (q.escala ?? 1));
    if (!r) return '';
    const [x, y] = pt(q.pos);
    return r.svg.replace('<svg ', `<svg x="${(x - r.ancla.x).toFixed(1)}" y="${(y - r.ancla.y).toFixed(1)}" `);
  }).join('');
  const etq = (t, x, y) => `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="8.5" font-weight="bold" font-family="Arial" text-anchor="middle" fill="${m.color ?? color}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(t)}</text>`;
  const textos = g.textos.filter((t) => t.texto && t.texto.length <= 6).map((t) => { const [x, y] = pt(t.pos); return etq(t.texto, x, y); }).join('');
  const rot = g.rotulos.filter((r) => r.texto).slice(0, 1).map((r) => { const a = pt(r.pts[0]), b = pt(r.pts.at(-1)); return etq(r.texto, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1); }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="-4 -4 ${ancho + 8} ${alto + 8}">${rell}${lineas}${glifos}${textos}${rot}</svg>`;
}

/**
 * @param {object} o
 * @param {*} o.L @param {*} o.mapa
 * @param {(h:string)=>void} o.elegirHerramienta
 * @param {()=>string} o.herramienta
 * @param {()=>{px:number}} o.tamano
 */
export function iniciarSimbolos({ L, mapa, elegirHerramienta, herramienta = () => 'consultar', tamano }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-simbolos');
  let dibujo = null;
  const est = {
    pestaña: 'unidades', busqueda: '', conjunto: '10',
    unidad: { conjunto: '10', identidad: 'amigo', icono: '121100', mod1: '', mod2: 'c100', escalon: 'seccion', movilidad: '', T: '', M: '', H: '', cg: false, ft: false, finta: false, refuerzo: '' },
    arma: 'infanteria', masOpciones: false, todo: false, abiertos: {},
    recientes: [],
  };
  try { const g = JSON.parse(localStorage.getItem(CLAVE) || '{}'); Object.assign(est, g, { unidad: { ...est.unidad, ...g.unidad }, abiertos: g.abiertos ?? {} }); } catch { /* nada */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify({ pestaña: est.pestaña, unidad: est.unidad, arma: est.arma, recientes: est.recientes, recientesAbiertos: est.recientesAbiertos, conjunto: est.conjunto, abiertos: est.abiertos, todo: est.todo })); } catch { /* nada */ } };

  // ---------------------------------------------------------- tamaño
  const metrosPx = () => (156543.03392804097 * Math.cos((mapa.getCenter().lat * Math.PI) / 180)) / 2 ** mapa.getZoom();
  const base = () => tamano?.()?.px ?? 34;
  // Todos iguales: el mismo tamaño para todos los símbolos, los pusieras al zoom que fuera
  const ladoDe = () => base() * factorZoom(mapa.getZoom(), ZOOM_REFERENCIA);
  mapa.on('zoomend', () => dibujo?.repintar());

  // ---------------------------------------------------------- pintar en el mapa
  const normalRot = (r) => { let x = ((r % 360) + 540) % 360 - 180; let girado = false; if (x > 90) { x -= 180; girado = true; } if (x < -90) { x += 180; girado = true; } return { r: x, girado }; };
  // Rótulos en su propia capa, por encima de todas las líneas (que no queden tachados)
  if (!mapa.getPane('rotulos')) { const p = mapa.createPane('rotulos'); p.style.zIndex = 466; p.style.pointerEvents = 'none'; }
  const marcadorTexto = (pos, html) => L.marker(pos, { pane: 'rotulos', interactive: false, keyboard: false, icon: L.divIcon({ className: 'etq-ancla', html, iconSize: null }) });

  /** Rótulos flotantes sobre la línea: en cada tramo al acercar, menos al alejar. */
  function colocarRotulos(g, rotulos, color) {
    for (const r of rotulos) {
      const pts = r.pts.map((p) => mapa.latLngToLayerPoint(p));
      const tramos = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], l = a.distanceTo(b);
        if (l < 1) continue;
        // tramos muy largos: varios rótulos (uno cada ~520 px)
        const k = Math.max(1, Math.floor(l / 520));
        for (let j = 0; j < k; j++) tramos.push({ i, l: l / k, t: (j + 0.5) / k, a, b });
      }
      if (!tramos.length) continue;
      const anchoTxt = Math.max(String(r.texto || '').length * 7.2, r.lados ? Math.max(String(r.lados.izq || '').length, String(r.lados.der || '').length) * 6.5 : 0) + 24;
      const elegidos = [];
      const ordenados = tramos.slice().sort((x, y) => y.l - x.l);
      const sep = Math.max(120, anchoTxt + 60);
      for (const t of ordenados) {
        if (t.l < anchoTxt + 40 && elegidos.length) continue;
        const p = L.point(t.a.x + (t.b.x - t.a.x) * t.t, t.a.y + (t.b.y - t.a.y) * t.t);
        if (elegidos.some((e) => e.p.distanceTo(p) < sep)) continue;
        elegidos.push({ ...t, p });
      }
      for (const e of elegidos) {
        const ang = (Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x) * 180) / Math.PI;
        const { r: rr, girado } = normalRot(ang);
        const pos = mapa.layerPointToLatLng(e.p);
        let html;
        if (r.lados) {
          const [arriba, abajo] = girado ? [r.lados.der, r.lados.izq] : [r.lados.izq, r.lados.der];
          html = `<div class="etq-limite" style="color:${color};transform:translate(-50%,-50%) rotate(${rr.toFixed(1)}deg)"><span class="lado">${esc(arriba || '')}</span><b class="etq-linea">${esc(r.texto || '')}</b><span class="lado">${esc(abajo || '')}</span></div>`;
        } else {
          html = `<span class="etq-linea${r.arriba ? ' arriba' : ''}" style="color:${color};transform:translate(-50%,${r.arriba ? '-120%' : '-50%'}) rotate(${rr.toFixed(1)}deg)">${esc(r.texto)}</span>`;
        }
        g.addLayer(marcadorTexto(pos, html));
      }
    }
  }

  function capaGlifo(pos, r, opc = {}) {
    return L.marker(pos, { pane: 'elementos', interactive: Boolean(opc.interactivo), draggable: Boolean(opc.arrastrable), keyboard: false, bubblingMouseEvents: true, icon: L.divIcon({ className: `simbolo-punto${opc.sel ? ' sel' : ''}`, html: r.svg + (opc.extra ?? ''), iconSize: [r.ancho, r.alto], iconAnchor: [r.ancla.x, r.ancla.y] }) });
  }

  /** Capa de un elemento con símbolo (o null si no tiene). */
  function pintar(el, puntos, { seleccionado, color, previsto, arrastrable }) {
    const s = el.simbolo; if (!s) return null;
    const g = L.layerGroup();
    if (s.clase === 'unidad') {
      const r = svgUnidad({ ...s, estado: previsto ? 'previsto' : 'presente' }, { tam: ladoDe(s) });
      const principal = L.marker([puntos[0].lat, puntos[0].lon], {
        pane: 'elementos', draggable: Boolean(arrastrable), keyboard: false, bubblingMouseEvents: true,
        icon: L.divIcon({ className: `simbolo-unidad${seleccionado ? ' sel' : ''}`, html: r.svg, iconSize: [r.ancho, r.alto], iconAnchor: [r.ancla.x, r.ancla.y] }),
      });
      g.addLayer(principal);
      if (el.propiedades.nombre && !s.T && !s.M) g.addLayer(marcadorTexto([puntos[0].lat, puntos[0].lon], `<span class="etq-simbolo" style="--dy:${(r.alto - r.ancla.y + 4).toFixed(0)}px">${esc(el.propiedades.nombre)}</span>`));
      return { grupo: g, principal };
    }
    const m = medida(s.id); if (!m) return null;
    const colorM = m.color ?? color;
    if (m.forma === 'punto') {
      const r = glifoPunto(m.glifo, colorM, ladoDe(s));
      const principal = capaGlifo([puntos[0].lat, puntos[0].lon], r, { interactivo: true, arrastrable, sel: seleccionado, extra: el.propiedades.nombre ? `<span class="etq-pto-cm" style="color:${colorM}">${esc(el.propiedades.nombre)}</span>` : '' });
      g.addLayer(principal);
      return { grupo: g, principal };
    }
    const geo = geometria(m, puntos, { nombre: el.propiedades.nombre, ancho: s.ancho, izq: s.izq, der: s.der, escalonMarca: ESCALONES[s.escalon]?.marca, mpp: metrosPx(), tam: s.tam, giro: s.giro });
    const discont = previsto;
    for (const r of geo.rellenos) g.addLayer(L.polygon(r.pts, { pane: 'elementos', stroke: false, fillColor: r.color ?? colorM, fillOpacity: r.opacidad ?? 0.3, interactive: false }));
    for (const l of geo.lineas) {
      g.addLayer(L.polyline(l.pts, { pane: 'elementos', color: seleccionado ? '#E0B252' : '#fff', weight: (seleccionado ? 8 : 6) * Math.min(1, l.grosor ?? 1), opacity: seleccionado ? 0.9 : 0.7, interactive: false, lineJoin: 'round', lineCap: 'round' }));
    }
    for (const l of geo.lineas) {
      g.addLayer(L.polyline(l.pts, { pane: 'elementos', color: l.color ?? colorM, weight: 2.6 * (l.grosor ?? 1), dashArray: discont || l.discontinua ? '10 7' : null, interactive: false, lineJoin: 'round' }));
    }
    for (const q of geo.glifos) {
      const r = q.zona ? glifoZona(q.zona, colorM, ladoDe(s)) : glifoPunto(q.g, colorM, ladoDe(s) * (q.escala ?? 1));
      if (r) g.addLayer(capaGlifo(q.pos, r));
    }
    for (const t of geo.textos) {
      const { r: rot } = normalRot(t.rumbo ?? 90);
      const cls = `etq-cm${t.fondo ? ' fondo' : ''}${t.negrita ? ' negrita' : ''}`;
      g.addLayer(marcadorTexto(t.pos, `<span class="${cls}" style="color:${t.color ?? colorM};transform:translate(-50%,-50%) rotate(${(t.rumbo === undefined ? 0 : rot).toFixed(1)}deg);${t.tam ? `font-size:${t.tam}px` : ''}">${esc(t.texto)}</span>`));
    }
    colocarRotulos(g, geo.rotulos, colorM);
    // Zona de clic
    const pts = puntos.map((p) => [p.lat, p.lon]);
    let principal;
    if (puntos.length === 1) {
      principal = L.marker(pts[0], { pane: 'elementos', draggable: Boolean(arrastrable), keyboard: false, bubblingMouseEvents: true, icon: L.divIcon({ className: `asa-simbolo${seleccionado ? ' sel' : ''}`, iconSize: [26, 26] }) });
      for (const l of geo.lineas) g.addLayer(L.polyline(l.pts, { pane: 'elementos', color: colorM, weight: 14, opacity: 0, bubblingMouseEvents: true }).on('click', (e) => principal.fire('click', e)));
    } else if (tipoElemento(m) === 'area') {
      principal = L.polygon(pts, { pane: 'elementos', color: colorM, weight: 14, opacity: 0, fillColor: colorM, fillOpacity: seleccionado ? 0.12 : 0.04, bubblingMouseEvents: true });
    } else {
      principal = L.polyline(geo.lineas.length ? geo.lineas.map((l) => l.pts) : pts, { pane: 'elementos', color: colorM, weight: 16, opacity: 0, bubblingMouseEvents: true });
    }
    g.addLayer(principal);
    return { grupo: g, principal };
  }

  /** Vista previa mientras se dibuja (puntos puestos + cursor). */
  function previsualizar(capa, simbolo, puntos, color) {
    const m = simbolo?.clase === 'medida' ? medida(simbolo.id) : null;
    if (!m || m.forma === 'punto' || puntos.length < 2) return false;
    const geo = geometria(m, puntos, { nombre: '', ancho: simbolo.ancho, escalonMarca: '', mpp: metrosPx() });
    for (const l of geo.lineas) L.polyline(l.pts, { pane: 'borrador', color: m.color ?? color, weight: 2.4, opacity: 0.85, dashArray: '6 5', interactive: false }).addTo(capa);
    return true;
  }

  // ---------------------------------------------------------- recientes
  function recordar(simbolo) {
    const { zoom, ...sinZoom } = simbolo;
    const clave = JSON.stringify(sinZoom);
    est.recientes = [sinZoom, ...est.recientes.filter((r) => JSON.stringify(r) !== clave)].slice(0, 12);
    guardar(); if (!panel.hidden) pintarPanel();
  }

  // ---------------------------------------------------------- colocar / dibujar
  const titulo = (m) => m?.nombre ?? '';
  function ayudaDe(m) {
    if (m.ayuda) return m.ayuda;
    if (m.forma === 'punto') return 'Toca el mapa donde va.';
    if (m.forma === 'area') return 'Toca los vértices de la zona; toca el primero o doble clic para cerrar.';
    if (m.forma === 'rect') return 'Toca los dos extremos del eje del rectángulo (la anchura se ajusta en la ficha).';
    if (m.forma === 'circulo') return 'Punto 1: el centro; 2: el borde.';
    return 'Toca los puntos de la línea; doble clic o Intro para terminar.';
  }
  function colocar(simbolo) {
    if (simbolo.clase === 'unidad') { armar(simbolo); return; }
    const m = medida(simbolo.id); if (!m) return;
    desarmar();
    elegirHerramienta(tipoElemento(m) === 'area' ? 'area' : tipoElemento(m) === 'punto' ? 'punto' : 'linea');
    dibujo.ponerSimboloBorrador({ ...simbolo }, m.n ?? 0, ayudaDe(m), m.nombre);
  }

  // Modo «armado»: con una unidad elegida, cada clic en el mapa la pone
  let armada = null, pausado = false;
  function armar(simbolo) { armada = { ...simbolo }; pausado = false; if (herramienta() !== 'consultar') elegirHerramienta('consultar'); pintarAviso(); }
  function desarmar() { armada = null; pausado = true; pintarAviso(); }
  const armadoAhora = () => !panel.hidden && !pausado && est.pestaña === 'unidades' && !est.busqueda.trim() && herramienta() === 'consultar' && !dibujo?.dibujando;
  function colocarEn(latlng) {
    if (!armadoAhora()) return false;
    const s = armada ?? { clase: 'unidad', ...est.unidad };
    crearEn(s, [{ lat: latlng.lat, lon: latlng.lng }]);
    return true;
  }
  function crearEn(simbolo, puntos) {
    const s = { ...simbolo, zoom: mapa.getZoom() };
    const m = s.clase === 'medida' ? medida(s.id) : null;
    const tipo = s.clase === 'unidad' ? 'punto' : tipoElemento(m);
    return dibujo.crearConSimbolo(s, puntos, tipo, s.clase === 'unidad' ? nombreUnidad(s) : m.nombre);
  }
  function pintarAviso() {
    const si = armadoAhora();
    const a = panel.querySelector('.sim-armado');
    if (a) a.hidden = !si;
    document.body.classList.toggle('sim-armado', si);
  }

  /** Puntos de una medida colocada con arrastrar y soltar (tamaño ≈ 170 px en pantalla). */
  function puntosPlantilla(m, latlng) {
    const { gp } = plano({ lat: latlng.lat, lon: latlng.lng });
    const k = (170 / 100) * metrosPx();
    return ejemplo(m).map(([x, y]) => gp([(x - 50) * k, (y - 30) * k]));
  }

  // ---------------------------------------------------------- arrastrar y soltar desde la paleta
  let arrastre = null;
  panel.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const b = ev.target.closest('[data-arrastrar]'); if (!b) return;
    arrastre = { x: ev.clientX, y: ev.clientY, b, simbolo: simboloDeBoton(b), activo: false, fantasma: null };
  });
  document.addEventListener('pointermove', (ev) => {
    if (!arrastre) return;
    if (!arrastre.activo) {
      if (Math.hypot(ev.clientX - arrastre.x, ev.clientY - arrastre.y) < 6) return;
      if (!arrastre.simbolo) { arrastre = null; return; }
      arrastre.activo = true;
      const f = document.createElement('div');
      f.className = 'sim-fantasma';
      f.innerHTML = arrastre.simbolo.clase === 'unidad' ? svgUnidad(arrastre.simbolo, { tam: base() }).svg : miniMedida(medida(arrastre.simbolo.id), AZUL, 80, 48);
      document.body.append(f);
      arrastre.fantasma = f;
      document.body.classList.add('arrastrando');
    }
    arrastre.fantasma.style.left = `${ev.clientX}px`; arrastre.fantasma.style.top = `${ev.clientY}px`;
  });
  document.addEventListener('pointerup', (ev) => {
    const a = arrastre; arrastre = null;
    if (!a?.activo) return;
    a.fantasma?.remove(); document.body.classList.remove('arrastrando');
    a.b.dataset.recienArrastrado = '1'; setTimeout(() => { delete a.b.dataset.recienArrastrado; }, 0);
    const cont = mapa.getContainer(), rc = cont.getBoundingClientRect();
    if (ev.clientX < rc.left || ev.clientX > rc.right || ev.clientY < rc.top || ev.clientY > rc.bottom) return;
    const ll = mapa.containerPointToLatLng([ev.clientX - rc.left, ev.clientY - rc.top]);
    if (a.simbolo.clase === 'unidad') { crearEn(a.simbolo, [{ lat: ll.lat, lon: ll.lng }]); return; }
    const m = medida(a.simbolo.id);
    crearEn(a.simbolo, puntosPlantilla(m, ll));
  });
  function simboloDeBoton(b) {
    if (b.dataset.medida) return { clase: 'medida', id: b.dataset.medida };
    if (b.dataset.reciente !== undefined) return { ...est.recientes[Number(b.dataset.reciente)] };
    if (b.dataset.vista !== undefined) return { clase: 'unidad', ...est.unidad };
    if (b.dataset.icono) return { clase: 'unidad', ...est.unidad, conjunto: b.dataset.conj ?? est.unidad.conjunto, icono: b.dataset.icono, ...(b.dataset.conj && b.dataset.conj !== est.unidad.conjunto ? { mod1: '', mod2: '' } : {}) };
    if (b.dataset.tipo) { const t = ARMAS.find((x) => x.id === est.arma)?.tipos.find((x) => x.id === b.dataset.tipo); return t ? { clase: 'unidad', ...est.unidad, conjunto: '10', icono: t.icono, mod1: t.mod1 ?? '', mod2: t.mod2 ?? '' } : null; }
    if (b.dataset.resultado !== undefined) { const r = est[`_res${b.dataset.resultado}`]; return r ? { clase: 'unidad', ...r.s } : null; }
    return null;
  }

  // ---------------------------------------------------------- paleta
  function abrir(pestaña, si = true) {
    if (pestaña) est.pestaña = pestaña;
    panel.hidden = !si;
    document.querySelectorAll('[data-simbolos]').forEach((b) => b.setAttribute('aria-pressed', String(si && b.dataset.simbolos === est.pestaña)));
    document.getElementById('btn-app6')?.setAttribute('aria-pressed', String(si));
    if (!si) { armada = null; document.body.classList.remove('sim-armado'); }
    if (si) { pausado = false; pintarPanel(); }
    guardar();
  }

  const u = () => est.unidad;
  function pintarPanel() {
    if (panel.hidden) return;
    const scroll = panel.querySelector('.sim-cuerpo')?.scrollTop ?? 0;
    const cab = `<div class="pm-cab v-cab"><strong>Símbolos APP-6</strong><span class="v-sub"></span><button type="button" class="pm-x" data-s="cerrar" aria-label="Cerrar">×</button></div>
      <input class="sim-buscar" id="sim-buscar" placeholder="Buscar" value="${esc(est.busqueda)}" autocomplete="off">
      <div class="seg sim-pestanas">${[['unidades', 'Unidades'], ['medidas', 'Líneas de coordinación'], ['cometidos', 'Cometidos']].map(([k, n]) => `<button type="button" data-pestana="${k}" aria-pressed="${est.pestaña === k}">${n}</button>`).join('')}</div>
      ${est.recientes.length ? `<details class="sim-recientes"${est.recientesAbiertos ? ' open' : ''}><summary class="el-et">Recientes <small>${est.recientes.length}</small></summary><div>${est.recientes.map((r, i) => `<button type="button" class="sim-chip" data-reciente="${i}" data-arrastrar title="${esc(tituloSimbolo(r))}">${r.clase === 'unidad' ? miniUnidad(r, 18) : miniMedida(medida(r.id), AZUL, 34, 20)}</button>`).join('')}</div></details>` : ''}`;
    let cuerpo;
    if (est.busqueda.trim()) cuerpo = htmlBusqueda(est.busqueda.trim());
    else if (est.pestaña === 'unidades') cuerpo = htmlConstructor();
    else cuerpo = htmlMedidas(est.pestaña === 'cometidos' ? ['cometidos'] : Object.keys(GRUPOS).filter((k) => k !== 'cometidos'));
    panel.innerHTML = `${cab}<div class="sim-cuerpo">${cuerpo}</div>`;
    const c = panel.querySelector('.sim-cuerpo'); if (c) c.scrollTop = scroll;
    const b = $('sim-buscar');
    if (b && est._enfocar) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); est._enfocar = false; }
    pintarAviso();
  }
  const tituloSimbolo = (s) => (s.clase === 'unidad' ? `${nombreUnidad(s)}${s.T ? ` ${s.T}` : ''}${s.M ? ` / ${s.M}` : ''}` : medida(s.id)?.nombre ?? '');

  function htmlConstructor() {
    const s = u();
    const conj = String(s.conjunto ?? '10');
    const grande = svgUnidad(s, { tam: 26 });
    const ids = ['amigo', 'hostil', 'neutral', 'desconocido'];
    const masIds = ['supuesto', 'sospechoso', 'pendiente'];
    const vista = `<button type="button" class="sim-vista" data-vista data-arrastrar>${grande.svg}<div><b>${esc(nombreUnidad(s))}</b></div></button>`;
    const CORTO = [['10', 'Unidades'], ['15', 'Material'], ['20', 'Instalaciones'], ['27', 'A pie'], ['40', 'Actividades'], ['11', 'Civiles']];
    const conjuntos = `<div class="sim-conjuntos">${CORTO.map(([k, n]) => `<button type="button" data-conjunto="${k}" aria-pressed="${conj === k}" title="${esc(CONJUNTOS[k].nombre)}">${n}</button>`).join('')}</div>`;
    const bandos = `<div class="sim-paso"><span class="el-et">1 · Bando</span><div class="sim-rejilla sim-bandos">${[...ids, ...(est.masOpciones ? masIds : [])].map((id) => `<button type="button" class="sim-tile" data-identidad="${id}" aria-pressed="${s.identidad === id}">${miniUnidad({ ...s, identidad: id, escalon: '' }, 20)}<span>${IDENTIDADES[id].nombre}</span></button>`).join('')}</div></div>`;
    let tipo;
    if (conj === '10' && !est.todo) {
      const arma = ARMAS.find((a) => a.id === est.arma) ?? ARMAS[0];
      tipo = `<div class="sim-paso"><span class="el-et">2 · Arma</span><div class="sim-rejilla">${ARMAS.map((a) => `<button type="button" class="sim-tile" data-arma="${a.id}" aria-pressed="${a.id === arma.id}">${miniUnidad({ identidad: s.identidad, icono: a.icono }, 18)}<span>${esc(a.nombre)}</span></button>`).join('')}<button type="button" class="sim-tile sim-todo" data-s="todo">…<span>Todas las de la APP-6</span></button></div></div>
        <div class="sim-paso"><span class="el-et">3 · Tipo</span><div class="sim-rejilla">${arma.tipos.map((t) => `<button type="button" class="sim-tile" data-tipo="${t.id}" data-arrastrar aria-pressed="${conj === '10' && t.icono === s.icono && (t.mod1 ?? '') === (s.mod1 ?? '') && (t.mod2 ?? '') === (s.mod2 ?? '')}">${miniUnidad({ identidad: s.identidad, icono: t.icono, mod1: t.mod1, mod2: t.mod2 }, 18)}<span>${esc(t.nombre)}</span></button>`).join('')}</div></div>`;
    } else {
      tipo = `<div class="sim-paso"><span class="el-et">2 · Tipo${conj === '10' ? ' <button type="button" class="sim-volver" data-s="guiado">◂ Volver a las armas del ET</button>' : ''}</span>${htmlArbol(conj, s)}</div>`;
    }
    const escalones = escalonesDe(conj);
    const pasoEsc = escalones.length > 1 ? `<div class="sim-paso"><span class="el-et">${conj === '10' ? (est.todo ? '3' : '4') : '3'} · Escalón</span><div class="sim-escalones">${escalones.slice(0, 9).map((k) => `<button type="button" data-escalon="${k}" aria-pressed="${s.escalon === k}" title="${esc(ESCALONES[k].nombre)}"><b>${ESCALONES[k].marca ?? '—'}</b><span>${esc(nombreEscalon(k, est.todo ? '' : est.arma))}</span></button>`).join('')}</div></div>` : '';
    const movil = conj === '15' ? `<div class="sim-paso"><span class="el-et">3 · Movilidad</span>${selectorVisual('movilidad', '', Object.entries(MOVILIDAD).map(([k, v]) => ({ v: k, nombre: v.nombre, ico: miniUnidad({ ...s, movilidad: k }, 16) })), s.movilidad ?? '', 'u')}</div>` : '';
    return `${vista}${conjuntos}${bandos}${tipo}${pasoEsc}${movil}
      <div class="sim-paso sim-campos"><label>Designación <input data-campo-u="T" value="${esc(s.T)}" placeholder="1" maxlength="21"></label><label>Unidad superior <input data-campo-u="M" value="${esc(s.M)}" placeholder="II/RI4" maxlength="21"></label></div>
      <button type="button" class="sim-mas" data-s="mas">${est.masOpciones ? 'Menos opciones ▲' : 'Más opciones (modificadores, CG, agrupación, refuerzo…) ▼'}</button>
      ${est.masOpciones ? htmlExtras(s, 'u') : ''}`;
  }
  /** Lista completa de iconos APP-6 de un conjunto, agrupada por entidad. */
  function htmlArbol(conj, s) {
    let grupoAnt = null, html = '';
    for (const n of arbol(conj)) {
      if (n.grupo !== grupoAnt) {
        if (grupoAnt !== null) html += '</div></details>';
        const abierto = est.abiertos[`${conj}/${n.grupo}`] ?? false;
        html += `<details class="sim-grupo-det" data-grupo="${esc(`${conj}/${n.grupo}`)}"${abierto ? ' open' : ''}><summary>${esc(n.grupo)}</summary><div class="sim-rejilla sim-rejilla-1">`;
        grupoAnt = n.grupo;
      }
      if (!est.abiertos[`${conj}/${n.grupo}`]) continue; // perezoso: solo se pintan los grupos abiertos
      html += `<button type="button" class="sim-tile niv${n.nivel}" data-icono="${n.codigo}" data-conj="${conj}" data-arrastrar aria-pressed="${s.icono === n.codigo && String(s.conjunto ?? '10') === conj}" title="${esc(n.otan)}">${miniUnidad({ ...s, conjunto: conj, icono: n.codigo, mod1: '', mod2: '', escalon: '', movilidad: '' }, 18)}<span>${esc(n.nombre)}</span></button>`;
    }
    return `<div class="sim-arbol">${html}</div></details></div>`;
  }
  function htmlExtras(s, pref) {
    const conj = String(s.conjunto ?? '10');
    const chk = (k, n) => `<label class="sim-chk"><input type="checkbox" data-bool-${pref}="${k}" ${s[k] ? 'checked' : ''}>${n}</label>`;
    const mods = (sector) => [{ v: '', nombre: 'Ninguno', ico: miniUnidad({ ...s, [`mod${sector}`]: '' }, 16) }, ...Object.entries(modificadoresDe(conj, sector)).map(([k, v]) => ({ v: k, nombre: v.nombre, grupo: v.comun ? 'Comunes' : 'Propios', ico: () => miniUnidad({ ...s, [`mod${sector}`]: k }, 16) }))];
    return `<div class="sim-paso sim-extras">
      ${selectorVisual('mod1', 'Modificador arriba (sector 1)', mods(1), s.mod1 ?? '', pref)}
      ${selectorVisual('mod2', 'Modificador abajo (sector 2)', mods(2), s.mod2 ?? '', pref)}
      ${conj !== '15' ? `${chk('cg', 'Cuartel general')}${chk('ft', 'Agrupación táctica')}` : ''}${chk('finta', 'Finta / simulada')}
      <div class="seg" data-refuerzo-${pref}>${[['', 'Normal'], ['+', 'Reforzada (+)'], ['-', 'Disminuida (−)'], ['±', '±']].map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${(s.refuerzo ?? '') === v}">${n}</button>`).join('')}</div>
      <label>Información adicional (H) <input data-campo-${pref}="H" value="${esc(s.H ?? '')}" placeholder="RECO, NASAMS…" maxlength="20"></label>
    </div>`;
  }
  function htmlMedidas(grupos) {
    return grupos.map((gk) => {
      const lista = MEDIDAS.filter((m) => m.grupo === gk && !m.oculto);
      if (!lista.length) return '';
      const abierto = est.abiertos[`m/${gk}`] ?? (gk === 'lineas' || gk === 'zonas' || gk === 'cometidos');
      return `<details class="sim-grupo-det" data-grupo="m/${gk}"${abierto ? ' open' : ''}><summary>${GRUPOS[gk]} <small>${lista.length}</small></summary>${abierto ? `<div class="sim-lista-cm">${lista.map((m) => `<button type="button" class="sim-cm" data-medida="${m.id}" data-arrastrar title="${esc(m.nombre)}"><span class="sim-cm-ico">${miniMedida(m)}</span><span>${esc(m.nombre)}${m.sigla && gk !== 'cometidos' ? ` <small>${esc(m.sigla)}</small>` : ''}</span></button>`).join('')}</div>` : ''}</details>`;
    }).join('');
  }
  function htmlBusqueda(q) {
    const cands = [
      ...candidatosUnidad().map((c) => ({ ...c, grupo: c.tipo.conjunto === '15' ? 'Material' : c.tipo.conjunto === '20' ? 'Instalación' : c.tipo.conjunto === '11' ? 'Civil' : 'Unidad' })),
      ...MEDIDAS.filter((m) => !m.oculto).map((m) => ({ grupo: m.grupo === 'cometidos' ? 'Cometido' : 'Línea de coordinación', texto: m.nombre, extra: `${m.sigla ?? ''} ${m.claves ?? ''} ${GRUPOS[m.grupo]}`, medida: m })),
    ];
    const qn = q.toLowerCase();
    const escalon = ORDEN_ESCALONES.find((k) => k && qn.includes(nombreEscalon(k, 'infanteria').toLowerCase().split(' ')[0]))
      ?? (/\b(bia|bía|batería)\b/.test(qn) ? 'compania' : /\b(escuadrón|esc)\b/.test(qn) ? 'compania' : /\bgrupo\b/.test(qn) ? 'batallon' : null);
    const limpio = escalon ? qn.replace(nombreEscalon(escalon, 'infanteria').toLowerCase(), '').replace(/\b(de|del)\b/g, ' ').trim() || qn : qn;
    const r = buscarDifuso(limpio, cands, 45).slice(0, 24);
    if (!r.length) return '<p class="cat-vacio">Nada encontrado.</p>';
    return `<div class="sim-lista-cm">${r.map((c, i) => {
      if (c.medida) return `<button type="button" class="sim-cm" data-medida="${c.medida.id}" data-arrastrar><span class="sim-cm-ico">${miniMedida(c.medida)}</span><span>${esc(c.texto)} <small>${esc(c.grupo)}</small></span></button>`;
      const conj = c.tipo.conjunto ?? '10';
      const s = { ...u(), conjunto: conj, icono: c.tipo.icono, mod1: c.tipo.mod1 ?? '', mod2: c.tipo.mod2 ?? '', ...(escalon && conj === '10' ? { escalon } : {}), ...(conj !== '10' ? { escalon: '' } : {}) };
      est[`_res${i}`] = { s, arma: c.arma };
      return `<button type="button" class="sim-cm" data-resultado="${i}" data-arrastrar><span class="sim-cm-ico">${miniUnidad(s, 20)}</span><span>${esc(nombreUnidad(s))} <small>${esc(c.grupo)}</small></span></button>`;
    }).join('')}</div>`;
  }

  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.recienArrastrado) return;
    pausado = false;
    const s = u();
    if (b.closest('.sel-vis')) { if (manejarSelector(ev, (campo, v) => { s[campo] = v; guardar(); pintarPanel(); })) return; }
    if (b.dataset.s === 'cerrar') { abrir(null, false); return; }
    if (b.dataset.pestana) { est.pestaña = b.dataset.pestana; est.busqueda = ''; abrir(est.pestaña); return; }
    if (b.dataset.conjunto) {
      const c = b.dataset.conjunto; est.conjunto = c;
      const primero = c === '10' ? ARMAS[0].tipos[0].icono : arbol(c).find((n) => n.nivel > 0)?.codigo;
      Object.assign(s, { conjunto: c, icono: c === '10' ? (s.conjunto === '10' ? s.icono : primero) : primero, mod1: '', mod2: '', escalon: c === '10' ? s.escalon || 'seccion' : '', movilidad: '' });
      if (c !== '10') { const g = arbol(c).find((n) => n.codigo === s.icono)?.grupo; if (g) est.abiertos[`${c}/${g}`] = true; }
    }
    if (b.dataset.identidad) s.identidad = b.dataset.identidad;
    if (b.dataset.arma) {
      est.arma = b.dataset.arma;
      const t = ARMAS.find((a) => a.id === est.arma).tipos[0];
      Object.assign(s, { conjunto: '10', icono: t.icono, mod1: t.mod1 ?? '', mod2: t.mod2 ?? '' });
    }
    if (b.dataset.tipo) { const t = ARMAS.find((a) => a.id === est.arma).tipos.find((x) => x.id === b.dataset.tipo); Object.assign(s, { conjunto: '10', icono: t.icono, mod1: t.mod1 ?? '', mod2: t.mod2 ?? '' }); }
    if (b.dataset.icono) { if ((b.dataset.conj ?? '10') !== String(s.conjunto)) Object.assign(s, { mod1: '', mod2: '' }); Object.assign(s, { conjunto: b.dataset.conj ?? '10', icono: b.dataset.icono }); }
    if (b.dataset.escalon !== undefined) s.escalon = b.dataset.escalon;
    if (b.closest('[data-refuerzo-u]')) s.refuerzo = b.dataset.v;
    if (b.dataset.s === 'mas') est.masOpciones = !est.masOpciones;
    if (b.dataset.s === 'todo') { est.todo = true; const g = arbol('10').find((n) => n.codigo === s.icono)?.grupo; if (g) est.abiertos[`10/${g}`] = true; }
    if (b.dataset.s === 'guiado') est.todo = false;
    if (b.dataset.vista !== undefined) { armar({ clase: 'unidad', ...s }); return; }
    if (b.dataset.medida) { colocar({ clase: 'medida', id: b.dataset.medida }); return; }
    if (b.dataset.reciente !== undefined) {
      const r = { ...est.recientes[Number(b.dataset.reciente)] };
      if (r.clase === 'unidad') { const { clase, ...resto } = r; Object.assign(est.unidad, resto); est.conjunto = String(resto.conjunto ?? '10'); est.busqueda = ''; est.pestaña = 'unidades'; guardar(); pintarPanel(); armar(r); return; }
      colocar(r); return;
    }
    if (b.dataset.resultado !== undefined) {
      const r = est[`_res${b.dataset.resultado}`];
      Object.assign(s, r.s); est.conjunto = String(r.s.conjunto ?? '10');
      if (r.arma && ARMAS.some((a) => a.id === r.arma)) { est.arma = r.arma; est.todo = false; } else if (est.conjunto === '10') { est.todo = true; }
      const g = arbol(est.conjunto).find((n) => n.codigo === s.icono)?.grupo; if (g) est.abiertos[`${est.conjunto}/${g}`] = true;
      est.busqueda = ''; est.pestaña = 'unidades';
    }
    guardar(); pintarPanel();
    if (est.pestaña === 'unidades') armar({ clase: 'unidad', ...est.unidad });
  });
  panel.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (d.matches?.('.sim-recientes')) { est.recientesAbiertos = d.open; guardar(); return; }
    if (!d.matches?.('.sim-grupo-det')) return;
    const k = d.dataset.grupo; const antes = est.abiertos[k];
    est.abiertos[k] = d.open; guardar();
    if (d.open && !antes) pintarPanel();
  }, true);
  panel.addEventListener('input', (ev) => {
    if (ev.target.id === 'sim-buscar') { est.busqueda = ev.target.value; est._enfocar = true; pintarPanel(); return; }
    const k = ev.target.dataset.campoU;
    if (k) { u()[k] = ev.target.value; guardar(); const v = panel.querySelector('.sim-vista'); if (v) { const r = svgUnidad(u(), { tam: 26 }); v.innerHTML = `${r.svg}<div><b>${esc(nombreUnidad(u()))}</b></div>`; } if (armada) armada = { clase: 'unidad', ...u() }; }
  });
  panel.addEventListener('change', (ev) => { const k = ev.target.dataset.boolU; if (k) { u()[k] = ev.target.checked; guardar(); pintarPanel(); if (armada) armada = { clase: 'unidad', ...u() }; } });
  panel.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'sim-buscar' && ev.key === 'Enter') { panel.querySelector('.sim-lista-cm button')?.click(); }
    if (ev.key === 'Escape') { if (est.busqueda) { est.busqueda = ''; pintarPanel(); } else abrir(null, false); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && armada && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) desarmar(); });
  // Con una unidad elegida, la paleta se vuelve translúcida al salir al mapa
  mapa.getContainer().addEventListener('pointerenter', () => document.body.classList.add('sobre-mapa'));
  mapa.getContainer().addEventListener('pointerleave', () => document.body.classList.remove('sobre-mapa'));

  // ---------------------------------------------------------- selector visual (desplegable con miniaturas, perezoso)
  const opcionesSel = new Map();
  function selectorVisual(campo, etiqueta, opciones, valor, pref = 'f') {
    const act = opciones.find((o) => o.v === valor) ?? opciones[0];
    const id = `${pref}-${campo}`;
    opcionesSel.set(id, { opciones, valor });
    const ico = (o) => (typeof o.ico === 'function' ? o.ico() : o.ico ?? '');
    return `<div class="el-fila sel-vis" data-sel="${campo}" data-sel-id="${id}">${etiqueta ? `<span class="el-et">${etiqueta}</span>` : ''}
      <button type="button" class="sel-vis-btn" data-abrir-sel="${campo}">${act ? ico(act) : ''}<span>${esc(act?.nombre ?? '')}</span><i>▾</i></button>
      <div class="sel-vis-lista" hidden></div></div>`;
  }
  function htmlLista(id) {
    const { opciones, valor } = opcionesSel.get(id) ?? { opciones: [] };
    let grupoAnt = null;
    return opciones.map((o) => { const cab = o.grupo && o.grupo !== grupoAnt ? `<div class="sel-vis-grupo">${esc(o.grupo)}</div>` : ''; grupoAnt = o.grupo; return `${cab}<button type="button" data-elegir="${esc(o.v)}" aria-pressed="${o.v === valor}">${typeof o.ico === 'function' ? o.ico() : o.ico ?? ''}<span>${esc(o.nombre)}</span></button>`; }).join('');
  }
  /** Abre/cierra/elige en un selector visual. `elegir(campo, valor)` aplica la elección. */
  function manejarSelector(ev, elegir) {
    const t = ev.target;
    const abrirSel = t.closest('[data-abrir-sel]');
    if (abrirSel) {
      const caja = abrirSel.closest('.sel-vis'), lista = caja.querySelector('.sel-vis-lista'), ab = lista.hidden;
      document.querySelectorAll('.sel-vis-lista').forEach((x) => { x.hidden = true; });
      if (ab) { lista.innerHTML = htmlLista(caja.dataset.selId); lista.hidden = false; lista.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }); }
      return true;
    }
    const el = t.closest('[data-elegir]');
    if (el) { elegir(el.closest('[data-sel]').dataset.sel, el.dataset.elegir); return true; }
    return false;
  }

  // ---------------------------------------------------------- ficha (panel del elemento)
  /** Partes de la ficha de un elemento con símbolo. */
  function ficha(el) {
    const s = el.simbolo; if (!s) return null;
    if (s.clase === 'unidad') {
      const conj = String(s.conjunto ?? '10');
      const e = especialidadDe(s);
      const armaId = e?.arma.id ?? 'generica';
      const tiposET = conj === '10' ? ARMAS.flatMap((a) => a.tipos.map((t) => ({ v: `${a.id}/${t.id}`, grupo: a.nombre, nombre: t.nombre, ico: () => miniUnidad({ identidad: s.identidad, icono: t.icono, mod1: t.mod1, mod2: t.mod2 }, 18) }))) : [];
      const todos = arbol(conj).map((n) => ({ v: `${conj}:${n.codigo}`, grupo: n.grupo, nombre: n.nombre, ico: () => miniUnidad({ identidad: s.identidad, conjunto: conj, icono: n.codigo }, 18) }));
      return {
        titulo: nombreUnidad(s), tipo: CONJUNTOS[conj]?.nombre ?? 'Unidad',
        html: `<div class="sim-vista sim-vista-ficha">${svgUnidad({ ...s, estado: el.propiedades.estado }, { tam: 26 }).svg}<div><b>${esc(nombreUnidad(s))}</b></div></div>
          <div class="el-fila"><span class="el-et">Bando</span><div class="seg sim-seg" data-f="identidad">${['amigo', 'hostil', 'neutral', 'desconocido', 'supuesto', 'sospechoso', 'pendiente'].map((id) => `<button type="button" data-v="${id}" aria-pressed="${s.identidad === id}" title="${IDENTIDADES[id].nombre}">${miniUnidad({ ...s, identidad: id }, 16)}</button>`).join('')}</div></div>
          ${conj === '10' ? selectorVisual('tipo', 'Tipo (ET)', tiposET, e ? `${e.arma.id}/${e.tipo.id}` : '') : ''}
          ${selectorVisual('icono', conj === '10' ? 'Icono APP-6 (todos)' : 'Tipo', todos, `${conj}:${s.icono}`)}
          ${escalonesDe(conj).length > 1 ? selectorVisual('escalon', 'Escalón', escalonesDe(conj).map((k) => ({ v: k, nombre: nombreEscalon(k, armaId), ico: `<b class="marca-esc">${ESCALONES[k].marca ?? '—'}</b>` })), s.escalon ?? '') : ''}
          ${conj === '15' ? selectorVisual('movilidad', 'Movilidad', Object.entries(MOVILIDAD).map(([k, v]) => ({ v: k, nombre: v.nombre, ico: () => miniUnidad({ ...s, movilidad: k }, 16) })), s.movilidad ?? '') : ''}
          <div class="sim-campos"><label>Designación <input data-campo-f="T" value="${esc(s.T ?? '')}" maxlength="21" placeholder="1"></label><label>Superior <input data-campo-f="M" value="${esc(s.M ?? '')}" maxlength="21" placeholder="II/RI4"></label></div>
          <details class="sim-det"${s.mod1 || s.mod2 || s.cg || s.ft || s.finta || s.refuerzo || s.H ? ' open' : ''}><summary>Más opciones</summary>${htmlExtras(s, 'f')}</details>`,
      };
    }
    const m = medida(s.id); if (!m) return null;
    const mismos = MEDIDAS.filter((x) => !x.oculto && (x.id === m.id || (x.forma === m.forma && puntosNecesarios(x) === puntosNecesarios(m) && (x.grupo === m.grupo || m.forma !== 'especial'))));
    const n = puntosNecesarios(m);
    return {
      titulo: el.propiedades.nombre || m.nombre, tipo: GRUPOS[m.grupo],
      html: `${selectorVisual('medida', 'Tipo', mismos.map((x) => ({ v: x.id, grupo: GRUPOS[x.grupo], nombre: x.nombre, ico: () => miniMedida(x, AZUL, 40, 24) })), m.id)}
        ${m.campos?.includes('ancho') || m.forma === 'rect' || m.forma === 'corredor' ? `<form class="el-radio" id="sim-ancho"><label>Anchura <input type="number" min="1" step="any" id="sim-ancho-m" value="${s.ancho ? Math.round(s.ancho) : ''}" placeholder="auto"></label><span>m</span><button type="submit">Aplicar</button></form>` : ''}
        ${m.estatico ? `<form class="el-radio" id="sim-tam"><label>Tamaño <input type="number" min="1" step="any" id="sim-tam-m" value="${s.tam ? Math.round(s.tam) : ''}" placeholder="auto"></label><span>m</span><button type="submit">Aplicar</button></form>` : ''}
        ${m.campos?.includes('escalon') ? selectorVisual('escalon', 'Escalón', ORDEN_ESCALONES.map((k) => ({ v: k, nombre: nombreEscalon(k, 'infanteria'), ico: `<b class="marca-esc">${ESCALONES[k].marca ?? '—'}</b>` })), s.escalon ?? '') : ''}
        ${m.id === 'limite' ? `<div class="sim-campos"><label>Unidad a la izquierda <input data-campo-f="izq" value="${esc(s.izq ?? '')}" maxlength="20" placeholder="1/II/4"></label><label>A la derecha <input data-campo-f="der" value="${esc(s.der ?? '')}" maxlength="20" placeholder="2/II/4"></label></div>` : ''}
`,
    };
  }

  /** Sigla de base de una línea de coordinación (PL, LD…): el nombre si el usuario no pone otro. */
  const siglaDe = (el) => (el.simbolo?.clase === 'medida' ? medida(el.simbolo.id)?.sigla ?? '' : '');

  /** Clics y cambios en la ficha. Devuelve true si los ha atendido. */
  function manejarFicha(ev, el, cambio) {
    const s = el.simbolo; if (!s) return false;
    const t = ev.target;
    const recordarTras = () => recordar(copiaSimbolo(el));
    if (ev.type === 'click') {
      if (manejarSelector(ev, (campo, v) => {
        if (campo === 'tipo') { const [a, tp] = v.split('/'); const tt = ARMAS.find((x) => x.id === a).tipos.find((x) => x.id === tp); cambio('Cambiar tipo', () => { Object.assign(s, { conjunto: '10', icono: tt.icono, mod1: tt.mod1 ?? '', mod2: tt.mod2 ?? '' }); }); }
        if (campo === 'icono') { const [cj, cod] = v.split(':'); cambio('Cambiar tipo', () => { if (String(s.conjunto ?? '10') !== cj) Object.assign(s, { mod1: '', mod2: '' }); Object.assign(s, { conjunto: cj, icono: cod }); }); }
        if (campo === 'escalon') cambio('Cambiar escalón', () => { s.escalon = v; });
        if (campo === 'movilidad') cambio('Cambiar movilidad', () => { s.movilidad = v; });
        if (campo === 'mod1' || campo === 'mod2') cambio('Cambiar modificador', () => { s[campo] = v; });
        if (campo === 'medida') cambio('Cambiar tipo', () => { s.id = v; });
        recordarTras();
      })) return true;
      const seg = t.closest('.sim-seg[data-f] button');
      if (seg) { const v = seg.dataset.v; cambio('Cambiar bando', () => { s.identidad = v; el.propiedades.bando = BANDO_DE[v] ?? 'propio'; el.propiedades.color = null; }); recordarTras(); return true; }
      const ref = t.closest('[data-refuerzo-f] button');
      if (ref) { cambio('Cambiar refuerzo', () => { s.refuerzo = ref.dataset.v; }); recordarTras(); return true; }
      const gb = t.closest('[data-girar]');
      if (gb) { girar(el, Number(gb.dataset.girar), cambio); return true; }
      return false;
    }
    if (ev.type === 'change') {
      const k = t.dataset.campoF;
      if (k) { cambio('Cambiar texto', () => { s[k] = t.value.trim(); }); recordarTras(); return true; }
      const b = t.dataset.boolF;
      if (b) { cambio('Cambiar símbolo', () => { s[b] = t.checked; }); recordarTras(); return true; }
    }
    if (ev.type === 'submit' && t.id === 'sim-ancho') {
      ev.preventDefault();
      const v = Number(String($('sim-ancho-m').value).replace(',', '.'));
      cambio('Cambiar anchura', () => { s.ancho = v > 0 ? v : null; });
      return true;
    }
    if (ev.type === 'submit' && t.id === 'sim-tam') {
      ev.preventDefault();
      const v = Number(String($('sim-tam-m').value).replace(',', '.'));
      cambio('Cambiar tamaño', () => { s.tam = v > 0 ? v : null; });
      return true;
    }
    return false;
  }
  const copiaSimbolo = (el) => { const { zoom, ...c } = el.simbolo; if (c.clase === 'unidad') return c; return { clase: 'medida', id: c.id }; };
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.sel-vis')) document.querySelectorAll('.sel-vis-lista').forEach((x) => { x.hidden = true; }); });

  /** Gira un símbolo de medida: los de un punto con `giro`; el resto, sus puntos alrededor del centro. */
  function girar(el, grados, cambio) {
    const m = medida(el.simbolo?.id); if (!m) return;
    const pts = dibujo.puntosDe(el);
    if (pts.length === 1) { cambio('Girar', () => { el.simbolo.giro = (((el.simbolo.giro ?? 0) + grados) % 360 + 360) % 360; }); return; }
    const nuevos = girarPuntos(pts, grados);
    dibujo.moverTodo(el, nuevos, 'Girar');
  }
  /** Gira puntos alrededor de su centro (en metros, sin deformar). Grados en sentido horario. */
  function girarPuntos(pts, grados, centro = null) {
    const c = centro ?? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
    const { a, gp } = plano(c);
    const ang = (-grados * Math.PI) / 180, co = Math.cos(ang), si = Math.sin(ang);
    return pts.map((p) => { const [x, y] = a(p); return gp([x * co - y * si, x * si + y * co]); });
  }

  /** Al crear un elemento con símbolo: color de bando, zoom de referencia y recientes. */
  function alCrear(el) {
    if (el.simbolo?.clase === 'unidad') el.propiedades.bando = BANDO_DE[el.simbolo.identidad] ?? 'propio';
    el.simbolo.zoom ??= mapa.getZoom();
    recordar(copiaSimbolo(el));
  }
  /** Miniatura para la lista del plan. */
  function icono(el) {
    const s = el.simbolo; if (!s) return null;
    if (s.clase === 'unidad') return miniUnidad(s, 16);
    const m = medida(s.id); return m ? miniMedida(m, AZUL, 30, 18) : null;
  }
  /** Número fijo de puntos (cometidos) o 0 si es libre. */
  const puntosFijos = (el) => (el.simbolo?.clase === 'medida' ? medida(el.simbolo.id)?.n ?? 0 : 0);
  /** ¿Se puede girar y mover entero? (medidas y cometidos) */
  const girable = (el) => el.simbolo?.clase === 'medida' && medida(el.simbolo.id)?.forma !== 'punto';
  /** Candidatos del buscador universal. */
  function candidatosBusqueda() {
    return [
      ...candidatosUnidad().map((c) => ({ grupo: 'Símbolos', texto: c.texto, extra: `unidad símbolo ${c.extra}`, detalle: `${CONJUNTOS[c.tipo.conjunto ?? '10'].nombre} · colocar`, accion: () => { Object.assign(est.unidad, { conjunto: c.tipo.conjunto ?? '10', icono: c.tipo.icono, mod1: c.tipo.mod1 ?? '', mod2: c.tipo.mod2 ?? '' }); est.conjunto = c.tipo.conjunto ?? '10'; if (ARMAS.some((a) => a.id === c.arma)) { est.arma = c.arma; est.todo = false; } else est.todo = true; abrir('unidades'); armar({ clase: 'unidad', ...est.unidad }); } })),
      ...MEDIDAS.filter((m) => !m.oculto).map((m) => ({ grupo: 'Símbolos', texto: m.nombre, extra: `${m.sigla ?? ''} ${m.claves ?? ''} ${m.grupo === 'cometidos' ? 'cometido verbo' : 'línea de coordinación medida'}`, detalle: m.grupo === 'cometidos' ? 'Cometido · dibujar' : 'Línea de coordinación · dibujar', accion: () => colocar({ clase: 'medida', id: m.id }) })),
    ];
  }

  return {
    conectar(d) { dibujo = d; },
    abrir, pintar, previsualizar, ficha, manejarFicha, alCrear, icono, puntosFijos, girable, girarPuntos, candidatosBusqueda, colocarEn, siglaDe,
    /** Medida del catálogo (para clasificar los objetos). */
    medidaDe: (id) => medida(id),
    /** Código SIDC de una unidad (para exportar). */
    sidcDe: (el) => (el.simbolo?.clase === 'unidad' ? svgUnidad(el.simbolo).sidc : ''),
    get abierto() { return !panel.hidden; },
    get armado() { return armadoAhora(); },
    actualizarAviso: () => pintarAviso(),
    get entidades() { return ENTIDADES; },
  };
}
