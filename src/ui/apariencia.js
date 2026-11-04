// Apariencia de la interfaz (Ajustes › Pantalla y ventanas): tema, transparencia,
// desenfoque, tamaño, plegado de ventanas sin uso, barra fija y altitud.
// Lo guarda cada usuario en su navegador.

const CLAVE = 'spa.apariencia';
export const APARIENCIA_FABRICA = Object.freeze({
  tema: 'auto', transparencia: 60, desenfoque: 6, escala: 95, reposo: 8, apartar: true, barraFija: false, altitud: true,
});
const VERSION = 3; // v0.9.4: valores de fábrica de Balú (65 % · 10 px · 95 %)

/**
 * @param {{ fondoOscuro: () => boolean, alCambiar?: () => void }} o
 */
export function iniciarApariencia({ fondoOscuro, alCambiar = () => {} }) {
  const $ = (id) => document.getElementById(id);
  let ap = { ...APARIENCIA_FABRICA };
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    if (!(g.version >= VERSION)) { delete g.transparencia; delete g.desenfoque; delete g.escala; }
    Object.assign(ap, g, { version: VERSION });
  } catch { /* sin almacenamiento */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(ap)); } catch { /* nada */ } };

  function aplicar() {
    const raiz = document.documentElement.style;
    raiz.setProperty('--vidrio-op', String(Math.max(0.3, 1 - ap.transparencia / 100)));
    raiz.setProperty('--desenfoque', `${ap.desenfoque}px`);
    raiz.setProperty('--escala-ui', String(ap.escala / 100));
    const oscuro = ap.tema === 'oscuro' || (ap.tema === 'auto' && fondoOscuro());
    document.body.classList.toggle('tema-oscuro', oscuro);
    document.body.classList.toggle('barra-fija', Boolean(ap.barraFija));
    document.body.classList.toggle('sin-altitud', !ap.altitud);
    pintarControles();
    alCambiar();
  }
  function pintarControles() {
    for (const g of document.querySelectorAll('[data-ap]')) g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(ap[g.dataset.ap]))));
    for (const [id, k, suf] of [['ap-transparencia', 'transparencia', ' %'], ['ap-desenfoque', 'desenfoque', ' px'], ['ap-escala', 'escala', ' %']]) {
      if ($(id)) { $(id).value = ap[k]; $(`${id}-v`).textContent = `${ap[k]}${suf}`; }
    }
    if ($('ap-apartar')) $('ap-apartar').checked = Boolean(ap.apartar);
    if ($('ap-barra')) $('ap-barra').checked = Boolean(ap.barraFija);
    if ($('ap-altitud')) $('ap-altitud').checked = Boolean(ap.altitud);
  }
  const poner = (k, v) => { ap[k] = v; guardar(); aplicar(); };
  for (const g of document.querySelectorAll('[data-ap]')) {
    g.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-v]'); if (!b) return; const k = g.dataset.ap; poner(k, k === 'reposo' ? Number(b.dataset.v) : b.dataset.v); });
  }
  for (const [id, k] of [['ap-transparencia', 'transparencia'], ['ap-desenfoque', 'desenfoque'], ['ap-escala', 'escala']]) {
    $(id)?.addEventListener('input', (ev) => poner(k, Number(ev.target.value)));
  }
  $('ap-apartar')?.addEventListener('change', (ev) => poner('apartar', ev.target.checked));
  $('ap-barra')?.addEventListener('change', (ev) => poner('barraFija', ev.target.checked));
  $('ap-altitud')?.addEventListener('change', (ev) => poner('altitud', ev.target.checked));
  $('ap-defecto')?.addEventListener('click', () => { ap = { ...APARIENCIA_FABRICA }; guardar(); aplicar(); });

  aplicar();
  return {
    get valores() { return ap; },
    /** Al cambiar el fondo (el tema automático depende de él). */
    refrescar: aplicar,
  };
}
