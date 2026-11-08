// Zoom con la rueda, fluido y con inercia (como Mapas de Apple):
//   - cada golpe de rueda del ratón acerca o aleja un nivel; en el panel
//     táctil, poco a poco: cuanto más fuerte, más
//   - el mapa se desliza hacia el zoom pedido y va frenando poco a poco
//   - el punto bajo el ratón se queda quieto
//   - al terminar se asienta en un zoom entero, siguiendo el sentido del gesto
//     (los mapas del IGN se ven nítidos en zooms enteros)
// Durante el movimiento se usa el movimiento interno de Leaflet (_move), que
// no dispara «zoomend» en cada fotograma: lo que es pesado (cuadrícula,
// símbolos) se recalcula una sola vez al final.

/**
 * @param {*} L
 * @param {*} mapa mapa de Leaflet (con scrollWheelZoom: false)
 * @param {{sensibilidad?:number, suavidad?:number}} [o]
 */
export function zoomSuave(L, mapa, { sensibilidad = 0.0032, suavidad = 0.2 } = {}) {
  const cont = mapa.getContainer();
  let objetivo = null, continuo = null, raf = 0, anclaPx = null, anclaLL = null, tQuieto = 0, moviendo = false, zInicio = 0, tPrev = 0;

  function asentar(z) {
    const d = z - zInicio;
    const r = Math.abs(d) < 0.04 ? Math.round(z) : d > 0 ? Math.ceil(z - 0.04) : Math.floor(z + 0.04);
    return Math.max(mapa.getMinZoom(), Math.min(mapa.getMaxZoom(), r));
  }
  function paso() {
    raf = 0;
    const z = mapa.getZoom();
    // Igual de suave aunque el ordenador vaya a menos fotogramas
    const ahora = performance.now(), dt = Math.min(100, ahora - (tPrev || ahora - 16.7)); tPrev = ahora;
    let nz = z + (objetivo - z) * (1 - (1 - suavidad) ** (dt / 16.7));
    const fin = Math.abs(objetivo - nz) < 0.003;
    if (fin) nz = objetivo;
    // Mantener quieto el punto bajo el ratón
    const tam = mapa.getSize();
    const desplaz = anclaPx.subtract(tam.divideBy(2));
    const centro = mapa.unproject(mapa.project(anclaLL, nz).subtract(desplaz), nz);
    if (!moviendo) { moviendo = true; mapa._moveStart(true, false); }
    // {pinch:true}: como el pellizco nativo de Leaflet, las capas de teselas no se vacían ni piden teselas a mitad
    // del gesto (solo escalan las que ya tienen); al terminar (_moveEnd) se cargan las del zoom final
    mapa._move(centro, nz, { pinch: true, round: false });
    if (fin && objetivo === Math.round(objetivo)) {
      // Último paso sin «pinch»: las capas tiran los niveles de teselas viejos (si no, se acumularían)
      mapa._move(centro, nz); moviendo = false; objetivo = null; continuo = null; tPrev = 0; mapa._moveEnd(true); return;
    }
    if (fin) return; // espera a que pare la rueda para asentarse en un zoom entero
    raf = requestAnimationFrame(paso);
  }

  cont.addEventListener('wheel', (e) => {
    if (e.ctrlKey && !e.deltaMode) { /* pellizco del panel táctil: también vale */ }
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (objetivo === null) { zInicio = mapa.getZoom(); continuo = null; }
    // Rueda de ratón (golpes de ~100): un nivel por golpe, deslizado. Panel táctil (poco a poco): continuo.
    const golpe = !e.ctrlKey && Math.abs(delta) >= 50;
    let nuevo;
    if (golpe) { continuo = null; nuevo = Math.round(objetivo ?? mapa.getZoom()) - Math.sign(delta); }
    else {
      // El panel táctil suma sobre su propia cuenta, sin redondear: si el mapa ya se estaba asentando
      // (ordenador lento) no se sube ni se baja un nivel de más
      continuo = (continuo ?? objetivo ?? mapa.getZoom()) - delta * sensibilidad * (e.ctrlKey ? 3 : 1);
      continuo = Math.max(mapa.getMinZoom(), Math.min(mapa.getMaxZoom(), continuo));
      nuevo = continuo;
    }
    objetivo = Math.max(mapa.getMinZoom(), Math.min(mapa.getMaxZoom(), nuevo));
    anclaPx = mapa.mouseEventToContainerPoint(e);
    anclaLL = mapa.containerPointToLatLng(anclaPx);
    clearTimeout(tQuieto);
    // Cuando la rueda para, se asienta en el entero siguiente en el sentido del gesto
    tQuieto = setTimeout(() => { if (objetivo !== null) { objetivo = asentar(objetivo); if (!raf) raf = requestAnimationFrame(paso); } }, 160);
    if (!raf) raf = requestAnimationFrame(paso);
  }, { passive: false });

  // Si otro movimiento (arrastrar, botones, buscar) empieza, se cancela el de la rueda
  mapa.on('movestart', () => { if (!moviendo && raf) { cancelAnimationFrame(raf); raf = 0; objetivo = null; continuo = null; } });
}
