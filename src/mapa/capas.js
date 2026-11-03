// Catálogo de capas cartográficas.
//
// Fondos (se elige uno): Topográfico (IGN), Híbrido (imagen + rótulos),
// Mapa base (IGN) y Relieve (sombreado propio con el MDT05 del IGN, ver
// relieve.js). Encima: sombreado, curvas de nivel, cuadrícula MGRS.
//
// La imagen del Híbrido se elige: Google, IGN PNOA, Esri o Bing. Solo el IGN
// y Esri publican la fecha de su imagen (se consulta para el centro del mapa).
// Google y Bing: acceso no oficial a sus teselas (sus condiciones no lo
// permiten y pueden cortarlo); decisión de Balú por calidad de imagen.
//
// IMPORTANTE (precisión): el mapa se PINTA en la proyección web (EPSG:3857),
// pero TODAS las coordenadas, la cuadrícula MGRS, distancias y rumbos se
// calculan con el motor geodésico sobre el elipsoide WGS84.

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
    id: 'mtn', nombre: 'Topográfico', detalle: 'Mapa Topográfico Nacional del IGN (MTN25 en zoom alto)',
    // PNG: más nítido que JPEG (texto y líneas finas sin artefactos)
    url: wmts('https://www.ign.es/wmts/mapa-raster', 'MTN', 'image/png'),
    atribucion: ATRIB_IGN, maxNativo: 17, max: 21,
    // El IGN cambia de mapa según el zoom: MTN25 en 15–16, más generalizado
    // en 14 y 13. «Mantener detalle» pinta en 13–14 las teselas de zoom 15.
    zoomDetalle: 15, zoomDetalleMin: 13,
  },
  { id: 'hibrido', nombre: 'Híbrido', detalle: 'Imagen aérea o de satélite con nombres y carreteras', tipo: 'hibrido' },
  {
    id: 'base', nombre: 'Mapa base', detalle: 'IGN Base: callejero y topografía vectorial',
    url: wmts('https://www.ign.es/wmts/ign-base', 'IGNBaseTodo', 'image/png'),
    atribucion: ATRIB_IGN, maxNativo: 17, max: 21,
  },
  { id: 'relieve', nombre: 'Relieve', detalle: 'Sombreado calculado con el MDT del IGN (5 m al acercarse)', tipo: 'relieve' },
  // De la carpeta de mapas de ATAK de Balú (noviembre 2026)
  {
    id: 'esri-topo', nombre: 'Esri Topo', detalle: 'Esri World Topo Map: topográfico mundial con relieve',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Mapa: Esri, HERE, Garmin, USGS, IGN y colaboradores', maxNativo: 19, max: 21,
  },
  {
    id: 'google-relieve', nombre: 'Google Relieve', detalle: 'Google Terrain: relieve sombreado con carreteras y nombres',
    url: 'https://mt{s}.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}', subdominios: '0123',
    atribucion: 'Mapa © Google', maxNativo: 20, max: 21,
  },
  {
    id: 'opentopo', nombre: 'OpenTopoMap', detalle: 'OpenTopoMap: curvas de nivel y sendas (OpenStreetMap)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', subdominios: 'abc',
    atribucion: '© OpenStreetMap · SRTM · estilo © OpenTopoMap (CC-BY-SA)', maxNativo: 17, max: 21,
  },
  {
    id: 'mtbmap', nombre: 'MTBMap', detalle: 'MTBMap Europa: sendas, pistas y relieve (OpenStreetMap)',
    url: 'https://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png',
    atribucion: '© OpenStreetMap · © MTBMap.cz', maxNativo: 18, max: 21,
  },
];

/** Imágenes para el Híbrido. */
export const IMAGENES = {
  google: {
    nombre: 'Google', detalle: 'Google satélite (fecha no publicada)',
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', subdominios: '0123',
    atribucion: 'Imágenes © Google', maxNativo: 20, max: 21,
  },
  pnoa: {
    nombre: 'IGN PNOA', detalle: 'Ortofoto PNOA de máxima actualidad del IGN (25 cm o mejor; fecha conocida)',
    url: wmts('https://www.ign.es/wmts/pnoa-ma', 'OI.OrthoimageCoverage', 'image/jpeg'),
    atribucion: ATRIB_IGN, maxNativo: 19, max: 21, fecha: 'pnoa',
  },
  esri: {
    nombre: 'Esri', detalle: 'Esri World Imagery (fecha conocida)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imágenes: Esri, Maxar, Earthstar Geographics y colaboradores', maxNativo: 19, max: 21, fecha: 'esri',
  },
  clarity: {
    nombre: 'Esri Clarity', detalle: 'Esri Clarity: imagen más nítida en muchas zonas (a veces más antigua; fecha no publicada)',
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imágenes: Esri, Maxar, Earthstar Geographics y colaboradores', maxNativo: 19, max: 21,
  },
  bing: {
    nombre: 'Bing', detalle: 'Bing aéreo (fecha no publicada)',
    quadkey: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=14000', subdominios: '0123',
    atribucion: 'Imágenes © Microsoft', maxNativo: 19, max: 21,
  },
  'bing-rotulos': {
    nombre: 'Bing + rótulos', detalle: 'Bing híbrido: imagen con sus propios nombres y carreteras',
    quadkey: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/h{q}.jpeg?g=14000&mkt=es-es', subdominios: '0123',
    atribucion: 'Imágenes y rótulos © Microsoft', maxNativo: 19, max: 21, conRotulos: true,
  },
};

/** Rótulos (nombres, carreteras) transparentes para poner sobre la imagen. */
export const ROTULOS = {
  url: 'https://mt{s}.google.com/vt/lyrs=h&hl=es&x={x}&y={y}&z={z}', subdominios: '0123',
  atribucion: 'Rótulos © Google', maxNativo: 20, max: 21,
};

/** Capas superpuestas del IGN (se pueden activar varias). */
export const SUPERPUESTAS = [
  {
    id: 'curvas', nombre: 'Curvas de nivel', detalle: 'MDT del IGN (visibles desde zoom 12)',
    tipo: 'wms', url: 'https://servicios.idee.es/wms-inspire/mdt', capas: 'EL.ContourLine',
    atribucion: ATRIB_IDEE, opacidad: 0.9, zoomMin: 12, zIndex: 4,
  },
];
export const ATRIBUCION_MDT = ATRIB_IDEE;

/** Zona piloto A — Sierra de Guadarrama (Cercedilla–Navacerrada). */
export const ZONA_PILOTO = {
  nombre: 'Zona piloto A · Guadarrama',
  sur: 40.70, norte: 40.88, oeste: -4.15, este: -3.91,
};

/** Crea una capa de teselas (o WMS) a partir de su definición. */
export function crearCapa(L, def) {
  if (def.tipo === 'wms') {
    return L.tileLayer.wms(def.url, {
      layers: def.capas, format: def.formato ?? 'image/png', transparent: def.transparente ?? true, version: '1.3.0',
      opacity: def.opacidad ?? 1, minZoom: def.zoomMin ?? 0, maxZoom: 21, zIndex: def.zIndex ?? 1,
      attribution: def.atribucion,
    });
  }
  const opciones = {
    maxNativeZoom: def.maxNativo ?? 18, maxZoom: def.max ?? 21, minZoom: 5,
    opacity: def.opacidad ?? 1, attribution: def.atribucion, zIndex: def.zIndex ?? 1,
    className: def.mezcla ? `mezcla-${def.mezcla}` : '',
    subdomains: def.subdominios ?? 'abc',
  };
  if (def.quadkey) return new (capaQuadkey(L))(def.quadkey, opciones);
  if (def.zoomDetalle) return new (capaConDetalle(L))(def.url, { ...opciones, zoomDetalle: def.zoomDetalle, zoomDetalleMin: def.zoomDetalleMin });
  return L.tileLayer(def.url, opciones);
}

/** URL de la tesela z/x/y de una capa (para descargarla fuera de Leaflet: creador de mapas). */
export function urlTesela(def, z, x, y) {
  const sub = def.subdominios ?? 'abc';
  const s = sub[Math.abs(x + y) % sub.length];
  return (def.quadkey ?? def.url).replaceAll('{s}', s).replaceAll('{q}', quadkey(x, y, z))
    .replaceAll('{z}', z).replaceAll('{x}', x).replaceAll('{y}', y);
}

/** Clave de tesela de Bing (quadkey). */
export function quadkey(x, y, z) {
  let q = '';
  for (let i = z; i > 0; i--) {
    let d = 0; const m = 1 << (i - 1);
    if (x & m) d++;
    if (y & m) d += 2;
    q += d;
  }
  return q;
}
function capaQuadkey(L) {
  return L.TileLayer.extend({
    getTileUrl(c) {
      return L.Util.template(this._url, { s: this._getSubdomain(c), q: quadkey(c.x, c.y, this._getZoomForUrl()) });
    },
  });
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

/**
 * Fecha de la imagen en un punto (solo IGN PNOA y Esri la publican).
 * @returns {Promise<string|null>} p. ej. "julio 2024 · 25 cm"
 */
export async function fechaImagen(fuente, lat, lon, pedir = fetch) {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  if (fuente === 'pnoa') {
    const d = 0.0005;
    const u = `https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=OI.MosaicElement&QUERY_LAYERS=OI.MosaicElement&CRS=EPSG:4258&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/html&STYLES=`;
    const t = (await (await pedir(u)).text()).replace(/<[^>]+>/g, ' ');
    const f = /(\d{4})-(\d{2})/.exec(t), r = /Resoluci\S*\s*\(metros\)\s*([\d.]+)/i.exec(t);
    if (!f) return null;
    return `${MESES[Number(f[2]) - 1]} ${f[1]}${r ? ` · ${Math.round(Number(r[1]) * 100)} cm` : ''}`;
  }
  if (fuente === 'esri') {
    const u = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=1&mapExtent=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&imageDisplay=400,400,96&returnGeometry=false&f=json`;
    const j = await (await pedir(u)).json();
    const r = (j.results || []).find((x) => /\d/.test(x.attributes?.SRC_DATE2 ?? x.attributes?.SRC_DATE ?? ''));
    const s = r && String(r.attributes.SRC_DATE2 ?? r.attributes.SRC_DATE);
    const m = s && /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    return m ? `${MESES[Number(m[1]) - 1]} ${m[3]}` : (s || null);
  }
  return null;
}
