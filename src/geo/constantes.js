// Constantes del elipsoide y de la proyección UTM.
//
// Todo el motor trabaja sobre WGS84. En España, ETRS89 (sistema oficial,
// RD 1071/2007) y WGS84 coinciden a efectos prácticos (diferencia
// centimétrica), así que los datos del IGN en ETRS89 se usan directamente.
// ED50 (mapas antiguos) es OTRO datum y se convierte aparte (ver ed50.js,
// pendiente de la rejilla oficial del IGN).

export const WGS84 = Object.freeze({
  nombre: 'WGS84',
  a: 6378137,                 // semieje mayor (m)
  f: 1 / 298.257223563,       // aplanamiento
});

// GRS80 (elipsoide de ETRS89). Se deja por si hace falta comparar.
export const GRS80 = Object.freeze({
  nombre: 'GRS80',
  a: 6378137,
  f: 1 / 298.257222101,
});

export const UTM = Object.freeze({
  k0: 0.9996,                 // factor de escala en el meridiano central
  falsoEste: 500000,          // m
  falsoNorteSur: 10000000,    // m, solo hemisferio sur
  latMin: -80,                // por debajo: UPS (no se usa en España)
  latMax: 84,
});

// Milésima OTAN: 6400 por vuelta completa.
export const MILESIMAS_VUELTA = 6400;
