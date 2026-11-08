// Vista del documento de la OPORD, como en la Mesa de Documentación de S1:
// las hojas A4 tal y como saldrán, que se van rellenando mientras se escribe.
//
// Sale de los mismos bloques que el PDF y el Word (exportar.js → bloques),
// así que lo que se ve es lo que se exporta. Se reparte en páginas midiendo
// cada trozo (las tablas largas siguen en la hoja siguiente con su cabecera y
// un título nunca se queda solo al pie). Lo que cambia brilla un momento y el
// apartado que se está escribiendo se resalta y se trae a la vista.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// A4 a 96 ppp: 794 × 1123 px. Márgenes como el PDF (2,5 cm arriba, 2,2 abajo, 2 y 1,8 a los lados).
const HOJA = { ancho: 794, alto: 1123, arr: 96, aba: 84, izq: 76, der: 68 };
const CM = 37.8;

/** HTML de un bloque (sin repartir en páginas). */
function htmlBloque(b) {
  const nodo = b.nodo ? ` data-nodo="${b.nodo}"` : '';
  const sang = (n) => (n ?? 0) * CM;
  switch (b.t) {
    case 'cabecera':
      return `<div class="vo-cab"><div>${b.izq.map(([t, neg]) => `<div class="${neg ? 'vo-neg vo-grande' : ''}">${esc(t)}</div>`).join('')}</div><div class="vo-der">${b.der.map(([t, neg]) => `<div class="${neg ? 'vo-neg' : ''}">${esc(t)}</div>`).join('')}</div></div>`;
    case 'titulo': {
      const col = b.rotulo ? (b.nivel === 0 ? CM * 1.2 : CM) : 0;
      return `<div class="vo-tit vo-n${Math.min(b.nivel, 2)}"${nodo} style="padding-left:${sang(b.nivel) + col}px;--col:${col}px">${b.rotulo ? `<span class="vo-rot">${esc(b.rotulo)}</span>` : ''}${esc(b.nivel === 0 ? b.texto.toUpperCase() : b.texto)}</div>`;
    }
    case 'parrafo': {
      const x = sang(b.nivel) + (b.nivel === 0 ? CM * 1.2 : CM);
      return `<div class="vo-par${b.estilo === 'intro' ? ' vo-intro' : ''}"${nodo} style="margin-left:${x}px">${b.lineas.map((l) => (l.startsWith('• ') ? `<div class="vo-bala">${esc(l.slice(2))}</div>` : `<div>${esc(l)}</div>`)).join('')}</div>`;
    }
    case 'arbol': {
      const x = sang(b.nivel) + CM;
      return `<div class="vo-arbol"${nodo} style="margin-left:${x}px">${b.lineas.map((l) => `<div style="padding-left:${l.nivel * 16}px" class="${l.nivel ? '' : 'vo-neg'}">${l.nivel ? '<span class="vo-rama"></span>' : ''}${esc(l.texto)}</div>`).join('')}</div>`;
    }
    case 'tabla': {
      const x = Math.min(b.nivel ?? 0, 2) * CM + CM;
      const filas = b.filas.length ? b.filas : Array.from({ length: b.vacia ?? 1 }, () => b.cols.map(() => ''));
      return `<table class="vo-tabla"${nodo} style="margin-left:${x}px;width:calc(100% - ${x}px)">${b.sinCabecera ? '' : `<thead><tr>${b.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`}<tbody>${filas.map((f, k) => `<tr class="${b.totales && k === filas.length - 1 ? 'vo-tot' : ''}">${b.cols.map((_, j) => `<td class="${(b.primeraNegrita || b.sinCabecera) && j === 0 ? 'vo-neg' : ''}">${esc(f[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    case 'enlace': {
      const x = (b.sangria ? sang(b.nivel) + CM : 0) + (b.nivel ? CM : CM * 1.2);
      return `<div class="vo-enl"${nodo} style="margin-left:${x}px">${esc(b.texto)}</div>`;
    }
    case 'firma':
      return `<div class="vo-firma"${nodo}>${(b.lineas.length ? b.lineas : [b.defecto]).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
    default: return '';
  }
}

/**
 * Crea la vista dentro de `cont` (el panel con barra de desplazamiento).
 * @returns {{ pintar(bloques:object[], o:{titulo:string, pagina:string, de:string}):number, activar(id:string|null):void, zoom(d:number|'ajustar'):void }}
 */
export function crearVista(cont, { alPinchar = () => {} } = {}) {
  const escala = document.createElement('div'); escala.className = 'vo-escala';
  cont.append(escala);
  const medida = document.createElement('div'); medida.className = 'vo vo-medida';
  document.body.append(medida);
  let zoomUsuario = 'ajustar';
  let previo = null; // texto de cada apartado en la pintada anterior (para que brille lo que cambia)
  let activo = null;

  function ajustar() {
    const z = zoomUsuario === 'ajustar' ? Math.min(1.1, Math.max(0.3, (cont.clientWidth - 28) / HOJA.ancho)) : zoomUsuario;
    escala.style.setProperty('--z', z);
    return z;
  }
  new ResizeObserver(() => ajustar()).observe(cont);

  function nuevaHoja() {
    const h = document.createElement('section'); h.className = 'vo-hoja';
    h.innerHTML = '<div class="vo-cla vo-cla-arr"></div><div class="vo-sub"></div><div class="vo-cont"></div><div class="vo-pie"><span class="vo-cla vo-cla-aba"></span><span class="vo-num"></span></div>';
    return h;
  }

  function pintar(bloques, { titulo = '', pagina = 'Página', de = 'de' } = {}) {
    const clasif = bloques.find((b) => b.t === 'clasificacion')?.texto ?? '';
    // 1) Cada bloque en el medidor, a tamaño real
    medida.innerHTML = '';
    const hojaM = nuevaHoja(); medida.append(hojaM);
    const contM = hojaM.querySelector('.vo-cont');
    const max = HOJA.alto - HOJA.arr - HOJA.aba - 4;
    const piezas = bloques.filter((b) => b.t !== 'clasificacion' && b.t !== 'clasificacionFin').map((b) => ({ b, html: htmlBloque(b) })).filter((p) => p.html);
    // Todo seguido, como saldría en una hoja infinita: así cuentan los márgenes que se solapan
    contM.innerHTML = piezas.map((p) => p.html).join('');
    const els = [...contM.children];
    const hojas = [[]];
    let inicio = 0; // dónde empieza (en la hoja infinita) la página actual
    const abrirHoja = (desde) => { hojas.push([]); inicio = desde; };
    els.forEach((el, k) => {
      const b = piezas[k].b;
      const arriba = el.offsetTop, abajo = arriba + el.offsetHeight;
      const pag = hojas.at(-1);
      if (abajo - inicio <= max || !pag.length) {
        if (b.t === 'tabla' && abajo - inicio > max) { partirTabla(el, arriba); return; }
        pag.push({ html: el.outerHTML, arriba, titulo: b.t === 'titulo' }); return;
      }
      // No cabe. Si es una tabla grande, se parte por filas; si no, va a la hoja siguiente
      if (b.t === 'tabla' && el.offsetHeight > 140 && max - (arriba - inicio) > 80) { partirTabla(el, arriba); return; }
      const sueltos = [];
      // Un título no se queda solo al pie: se va con el texto o la tabla que le sigue (como mucho tres)
      while (b.t !== 'titulo' && sueltos.length < 3 && pag.length > 1 && pag.at(-1).titulo) sueltos.unshift(pag.pop());
      abrirHoja(sueltos.length ? sueltos[0].arriba : arriba);
      hojas.at(-1).push(...sueltos);
      if (b.t === 'tabla' && abajo - inicio > max) { partirTabla(el, arriba); return; }
      hojas.at(-1).push({ html: el.outerHTML, arriba, titulo: b.t === 'titulo' });
    });
    // Tabla que no cabe: se parte por filas y sigue en la hoja siguiente con su cabecera repetida
    function partirTabla(tabla, arriba) {
      const cab = tabla.tHead?.outerHTML ?? '';
      const hCab = tabla.tHead?.offsetHeight ?? 0;
      const abre = tabla.outerHTML.slice(0, tabla.outerHTML.indexOf('>') + 1);
      let grupo = [];
      for (const f of tabla.tBodies[0].rows) {
        const fa = arriba + f.offsetTop, fb = fa + f.offsetHeight;
        if (fb - inicio > max && (grupo.length || hojas.at(-1).length)) {
          if (grupo.length) hojas.at(-1).push({ html: `${abre}${cab}<tbody>${grupo.join('')}</tbody></table>`, arriba });
          abrirHoja(fa - hCab - 6); grupo = [];
        }
        grupo.push(f.outerHTML);
      }
      if (grupo.length) hojas.at(-1).push({ html: `${abre}${cab}<tbody>${grupo.join('')}</tbody></table>`, arriba });
    }
    // 2) Las hojas de verdad
    const scroll = cont.scrollTop;
    escala.innerHTML = '';
    hojas.forEach((lista, i) => {
      const h = nuevaHoja();
      h.querySelector('.vo-cont').innerHTML = lista.map((x) => x.html).join('');
      h.querySelector('.vo-cla-arr').textContent = clasif;
      h.querySelector('.vo-cla-aba').textContent = clasif;
      h.querySelector('.vo-sub').textContent = i ? titulo : '';
      h.querySelector('.vo-num').textContent = `${pagina} ${i + 1} ${de} ${hojas.length}`;
      escala.append(h);
    });
    medida.innerHTML = '';
    ajustar();
    cont.scrollTop = scroll;
    // 3) Brillo en lo que ha cambiado desde la última vez
    const ahora = new Map();
    for (const el of escala.querySelectorAll('[data-nodo]')) ahora.set(el.dataset.nodo, (ahora.get(el.dataset.nodo) ?? '') + el.textContent);
    if (previo) for (const el of escala.querySelectorAll('[data-nodo]')) if (previo.get(el.dataset.nodo) !== ahora.get(el.dataset.nodo)) el.classList.add('vo-nuevo');
    previo = ahora;
    if (activo) marcar(activo, false);
    return hojas.length;
  }

  function marcar(id, traer) {
    escala.querySelectorAll('.vo-activo').forEach((x) => x.classList.remove('vo-activo'));
    if (!id) return;
    const els = escala.querySelectorAll(`[data-nodo="${id}"]`);
    els.forEach((x) => x.classList.add('vo-activo'));
    if (traer && els[0]) {
      const r = els[0].getBoundingClientRect(), c = cont.getBoundingClientRect();
      if (r.top < c.top + 20 || r.bottom > c.bottom - 20) cont.scrollTo({ top: cont.scrollTop + r.top - c.top - c.height * 0.3, behavior: 'smooth' });
    }
  }

  // Pinchar en la hoja lleva al apartado en el formulario
  escala.addEventListener('click', (e) => { const el = e.target.closest('[data-nodo]'); if (el) alPinchar(el.dataset.nodo); });

  return {
    pintar,
    /** Resalta (y trae a la vista) el apartado que se está escribiendo. */
    activar(id) { if (id === activo) return; activo = id; marcar(id, true); },
    zoom(d) {
      if (d === 'ajustar') zoomUsuario = 'ajustar';
      else { const z = zoomUsuario === 'ajustar' ? ajustar() : zoomUsuario; zoomUsuario = Math.min(2, Math.max(0.3, +(z + d).toFixed(2))); }
      const z = ajustar();
      return zoomUsuario === 'ajustar' ? 'Ajustar' : `${Math.round(z * 100)} %`;
    },
  };
}
