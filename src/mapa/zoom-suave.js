// Zoom con la rueda, fluido (como Google Maps o Mapas de Apple):
//   - cada golpe de rueda del ratón acerca o aleja un nivel, con una
//     animación suave centrada en el ratón (el punto bajo el ratón no se mueve)
//   - varios golpes seguidos se encadenan en un solo movimiento
//   - el panel táctil (deslizar con dos dedos o pellizcar) va sumando y salta
//     de nivel en nivel según el gesto; al soltar, si se movió algo, un nivel más
//   - siempre se termina en un zoom entero (los mapas del IGN se ven nítidos)
//
// La animación es la propia de Leaflet (transformación CSS que hace la tarjeta
// gráfica): el mapa, los símbolos y las líneas se escalan juntos sin
// recolocarse fotograma a fotograma, que era lo que daba tirones con muchos
// objetos y teselas cargando.

/**
 * @param {*} L
 * @param {*} mapa mapa de Leaflet (con scrollWheelZoom: false y zoomAnimation activa)
 * @param {{sensibilidad?:number}} [o]
 */
export function zoomSuave(L, mapa, { sensibilidad = 0.0032 } = {}) {
  const cont = mapa.getContainer();
  let objetivo = null, ancla = null, acumulado = 0, tQuieto = 0;
  const limitar = (z) => Math.max(mapa.getMinZoom(), Math.min(mapa.getMaxZoom(), z));

  /** Lleva el mapa hacia el objetivo (si ya hay una animación en marcha, sigue al acabar ella). */
  function ir() {
    if (objetivo === null || mapa._animatingZoom) return;
    if (objetivo === mapa.getZoom()) { objetivo = null; return; }
    mapa.setZoomAround(ancla ?? mapa.getSize().divideBy(2), objetivo, { animate: true });
  }
  mapa.on('zoomend', () => { if (objetivo !== null) requestAnimationFrame(ir); });

  function paso(sentido) {
    objetivo = limitar(Math.round(objetivo ?? mapa.getZoom()) + sentido);
    ir();
  }

  cont.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (!delta) return;
    ancla = mapa.mouseEventToContainerPoint(e);
    // Rueda de ratón (golpes de ~100): un nivel por golpe
    if (!e.ctrlKey && Math.abs(delta) >= 50) { acumulado = 0; paso(-Math.sign(delta)); return; }
    // Panel táctil: va sumando; cada «nivel» de gesto, un nivel de zoom
    acumulado += -delta * sensibilidad * (e.ctrlKey ? 3 : 1);
    while (Math.abs(acumulado) >= 0.6) { const s = Math.sign(acumulado); paso(s); acumulado -= s; }
    clearTimeout(tQuieto);
    tQuieto = setTimeout(() => { if (Math.abs(acumulado) >= 0.15) paso(Math.sign(acumulado)); acumulado = 0; }, 140);
  }, { passive: false });

  // Si otro movimiento empieza (arrastrar, botones, buscar), se olvida lo pendiente
  mapa.on('dragstart', () => { objetivo = null; acumulado = 0; });
}
