// Almacén en el navegador (IndexedDB) para lo importado: datos (GPX, KML,
// paquetes ATAK ya leídos), mapas (el archivo o, en Chrome/Edge, un acceso
// directo a él sin copiarlo) y el catálogo de la carpeta de mapas.
// Si el navegador no deja guardar, todo sigue funcionando en la sesión.

const NOMBRE = 'spa', VERSION = 2;
const ALMACENES = ['datos', 'mapas', 'catalogo', 'piramides']; // piramides: vistas reducidas de GeoTIFF grandes
let bd = null;

function abrir() {
  if (bd) return bd;
  bd = new Promise((ok, mal) => {
    if (typeof indexedDB === 'undefined') { mal(new Error('Sin IndexedDB')); return; }
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => { for (const a of ALMACENES) if (!r.result.objectStoreNames.contains(a)) r.result.createObjectStore(a, { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  bd.catch(() => { bd = null; });
  return bd;
}

const tx = async (almacen, modo, fn) => {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(almacen, modo);
    const r = fn(t.objectStore(almacen));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => mal(t.error);
    t.onabort = () => mal(t.error);
  });
};

export const guardar = (almacen, obj) => tx(almacen, 'readwrite', (s) => s.put(obj)).catch(() => null);
export const borrar = (almacen, id) => tx(almacen, 'readwrite', (s) => s.delete(id)).catch(() => null);
export const leer = (almacen, id) => tx(almacen, 'readonly', (s) => s.get(id)).catch(() => null);
export const todos = (almacen) => tx(almacen, 'readonly', (s) => s.getAll()).catch(() => []);
