// Catálogo de capas cartográficas (servicios públicos del IGN y la IDEE).
//
// Fuentes de los nombres de servicio y de capa:
//   - IGN, "API de Google Maps con servicios IDE" (ign.es/web/ign/portal/ide-api-google):
//     pnoa-ma → OI.OrthoimageCoverage; mapa-raster → MTN; TileMatrixSet
//     GoogleMapsCompatible; formato image/jpeg.
//   - Catálogo de proveedores del paquete mapSpain (rOpenSpain), que recoge
//     ign-base (IGNBaseTodo), servicios.idee.es/wmts/mdt (Relieve) y
//     wms-inspire/mdt (EL.ContourLine).
// Todos son servicios WMTS/WMS oficiales y gratuitos. El navegador del usuario
// los pide directamente al IGN; la aplicación no guarda ni copia teselas.
//
// IMPORTANTE (precisión): el mapa se PINTA en la proyección web (EPSG:3857),
// pero TODAS las coordenadas, la cuadrícula MGRS, distancias y rumbos se
// calculan con el motor geodésico sobre el elipsoide WGS84. La proyección de
// pantalla no afecta a ningún número que se muestre.

const ATRIB_IGN = '© <a href="https://www.ign.es" target="_blank" rel="noopener">Instituto Geográfico Nacional</a> · CC BY 4.0 scne.es';
const ATRIB_IDEE = '© <a href="https://www.idee.es" target="_blank" rel="noopener">IGN · IDEE</a> · CC BY 4.0 scne.es';

/** URL de tesela WMTS en modo KVP (formato de petición GetTile). */
function wmts(base, capa, formato) {
  return `${base}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${capa}&STYLE=default`
    + `&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${encodeURIComponent(formato)}`;
}

/** Mapas de fondo (se elige uno). */
export const FONDOS = [
  {
    id: 'mtn',
    nombre: 'Topográfico',
    detalle: 'Mapa Topográfico Nacional (MTN25 en zoom alto)',
    // PNG: más nítido que JPEG (texto y líneas finas sin artefactos)
    url: wmts('https://www.ign.es/wmts/mapa-raster', 'MTN', 'image/png'),
    atribucion: ATRIB_IGN, maxNativo: 17, max: 19,
    // El IGN cambia de mapa según el zoom: MTN25 en 15–16, más generalizado
    // en 14 y 13. «Mantener detalle» pinta en 13–14 las teselas de zoom 15.
    zoomDetalle: 15, zoomDetalleMin: 13,
  },
  {
    id: 'ortofoto',
    nombre: 'Ortofoto',
    detalle: 'PNOA máxima actualidad',
    url: wmts('https://www.ign.es/wmts/pnoa-ma', 'OI.OrthoimageCoverage', 'image/jpeg'),
    atribucion: ATRIB_IGN, maxNativo: 19, max: 20,
    // Si el WMTS no responde, se prueba la MISMA ortofoto por el servicio WMS
    // del IGN, y como último recurso la imagen de satélite de Esri.
    alternativas: ['ortofoto-wms', 'satelite-esri'],
  },
  {
    id: 'satelite',
    nombre: 'Satélite',
    detalle: 'Google satélite (acceso no oficial: Google puede cortarlo)',
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', subdominios: '0123',
    atribucion: 'Imágenes © Google', maxNativo: 20, max: 21,
  },
  {
    id: 'hibrido',
    nombre: 'Híbrido',
    detalle: 'Google satélite con nombres y carreteras (acceso no oficial)',
    url: 'https://mt{s}.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}', subdominios: '0123',
    atribucion: 'Imágenes y datos © Google', maxNativo: 20, max: 21,
  },
  {
    id: 'base',
    nombre: 'Mapa base',
    detalle: 'IGN Base: callejero y topografía vectorial',
    url: wmts('https://www.ign.es/wmts/ign-base', 'IGNBaseTodo', 'image/png'),
    atribucion: ATRIB_IGN, maxNativo: 17, max: 19,
  },
  {
    id: 'relieve',
    nombre: 'Relieve',
    detalle: 'Sombreado del Modelo Digital del Terreno',
    url: wmts('https://servicios.idee.es/wmts/mdt', 'Relieve', 'image/png'),
    atribucion: ATRIB_IDEE, maxNativo: 17, max: 19,
  },
];

/**
 * Rutas alternativas (no salen en el selector; se usan si la principal falla
 * o si el usuario las elige desde el aviso de diagnóstico).
 */
export const ALTERNATIVAS = [
  {
    id: 'ortofoto-wms',
    nombre: 'Ortofoto (IGN, vía WMS)',
    detalle: 'PNOA máxima actualidad por el servicio WMS del IGN',
    tipo: 'wms', url: 'https://www.ign.es/wms-inspire/pnoa-ma', capas: 'OI.OrthoimageCoverage',
    formato: 'image/jpeg', transparente: false, atribucion: ATRIB_IGN,
  },
  {
    id: 'satelite-esri',
    nombre: 'Satélite (Esri)',
    detalle: 'Esri World Imagery. Útil fuera de España o si el IGN no responde',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imágenes: Esri, Maxar, Earthstar Geographics y colaboradores · Powered by Esri',
    maxNativo: 19, max: 20,
  },
];

/** Capas superpuestas (se pueden activar varias). */
export const SUPERPUESTAS = [
  {
    id: 'sombreado',
    nombre: 'Sombreado',
    detalle: 'Relieve semitransparente sobre el fondo',
    tipo: 'wmts',
    url: wmts('https://servicios.idee.es/wmts/mdt', 'Relieve', 'image/png'),
    atribucion: ATRIB_IDEE, opacidad: 0.35, mezcla: 'multiply', maxNativo: 17,
  },
  {
    id: 'curvas',
    nombre: 'Curvas de nivel',
    detalle: 'MDT del IGN (visibles desde zoom 12)',
    tipo: 'wms',
    url: 'https://servicios.idee.es/wms-inspire/mdt',
    capas: 'EL.ContourLine',
    atribucion: ATRIB_IDEE, opacidad: 0.9, zoomMin: 12,
  },
  {
    id: 'vertices',
    nombre: 'Vértices geodésicos',
    detalle: 'Red REGENTE del IGN (en pruebas)',
    tipo: 'wms',
    url: 'https://www.ign.es/wms-inspire/redes-geodesicas',
    capas: 'RED_REGENTE',
    atribucion: ATRIB_IGN, opacidad: 1, zoomMin: 9,
  },
];

/** Zona piloto A — Sierra de Guadarrama (Cercedilla–Navacerrada). */
export const ZONA_PILOTO = {
  nombre: 'Zona piloto A · Guadarrama',
  sur: 40.70, norte: 40.88, oeste: -4.15, este: -3.91,
};

/** Crea la capa Leaflet de un fondo o de una superpuesta. */
export function crearCapa(L, def) {
  if (def.tipo === 'wms') {
    return L.tileLayer.wms(def.url, {
      layers: def.capas, format: def.formato ?? 'image/png', transparent: def.transparente ?? true, version: '1.3.0',
      opacity: def.opacidad ?? 1, minZoom: def.zoomMin ?? 0, maxZoom: 21,
      attribution: def.atribucion,
    });
  }
  const opciones = {
    maxNativeZoom: def.maxNativo ?? 18, maxZoom: def.max ?? 21, minZoom: 5,
    opacity: def.opacidad ?? 1, attribution: def.atribucion,
    className: def.mezcla ? `mezcla-${def.mezcla}` : '',
    subdomains: def.subdominios ?? 'abc',
  };
  if (def.zoomDetalle) return new (capaConDetalle(L))(def.url, { ...opciones, zoomDetalle: def.zoomDetalle, zoomDetalleMin: def.zoomDetalleMin });
  return L.tileLayer(def.url, opciones);
}

/**
 * Capa que, con `detalle` activado, pinta en los zooms [zoomDetalleMin,
 * zoomDetalle) las teselas de `zoomDetalle` reducidas (2× o 4× más teselas):
 * así se ve el MTN25 desde más arriba. Las teselas son las mismas del IGN.
 */
function capaConDetalle(L) {
  return L.TileLayer.extend({
    _factorDetalle() {
      const z = this._tileZoom ?? this._map?.getZoom();
      const o = this.options;
      if (!this.detalle || z === undefined || z < o.zoomDetalleMin || z >= o.zoomDetalle) return 0;
      return o.zoomDetalle - z;
    },
    getTileSize() {
      const k = this._factorDetalle();
      const t = L.TileLayer.prototype.getTileSize.call(this);
      return k ? t.divideBy(2 ** k) : t;
    },
    _getZoomForUrl() {
      return L.TileLayer.prototype._getZoomForUrl.call(this) + this._factorDetalle();
    },
    ponerDetalle(si) {
      if (this.detalle === si) return;
      this.detalle = si;
      if (this._map) { this._resetGrid(); this.redraw(); }
    },
  });
}
