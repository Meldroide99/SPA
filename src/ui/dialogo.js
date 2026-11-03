// Preguntas al usuario en el diálogo de la página (#dialogo), con botones.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Muestra una pregunta y devuelve el valor del botón pulsado (o null si se cierra).
 * @param {{titulo:string, texto?:string, html?:string, opciones:Array<{v:string, texto:string, detalle?:string, clase?:string}>, campo?:{valor?:string, ayuda?:string}}} p
 * Con `campo`, devuelve { v, texto } con lo escrito.
 */
export function preguntar({ titulo, texto = '', html = '', opciones, campo = null }) {
  const d = document.getElementById('dialogo');
  return new Promise((resolver) => {
    d.innerHTML = `<form method="dialog" class="dlg dlg-pregunta"><h3>${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}${html}
      ${campo ? `<input class="dlg-campo" id="dlg-campo" value="${esc(campo.valor ?? '')}" placeholder="${esc(campo.ayuda ?? '')}" maxlength="80" autocomplete="off">` : ''}
      <div class="dlg-opciones">${opciones.map((o) => `<button value="${esc(o.v)}" class="${o.clase ?? ''}"><b>${esc(o.texto)}</b>${o.detalle ? `<small>${esc(o.detalle)}</small>` : ''}</button>`).join('')}</div></form>`;
    d.onclose = () => {
      const v = d.returnValue && d.returnValue !== 'cancelar' ? d.returnValue : null;
      d.onclose = null;
      resolver(campo ? (v ? { v, texto: document.getElementById('dlg-campo')?.value.trim() ?? '' } : null) : v);
    };
    d.returnValue = '';
    d.showModal();
    if (campo) { const c = document.getElementById('dlg-campo'); c.focus(); c.select(); }
  });
}
