/* Página de carga de autorizaciones. Cada HTML define window.PAGINA = { perfil, titulo, sub, campos, resumen }
 * y este script arma el formulario, la lista y habla con /api/autorizaciones. */
(function () {
  const P = window.PAGINA
  const $ = (s, el = document) => el.querySelector(s)
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
  const fecha = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '')
  const PLANTA = { ricardone: 'Ricardone', san_lorenzo: 'San Lorenzo', ambas: 'Ambas plantas' }
  const store = { get: (k) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} } }

  let lista = []
  let productos = []
  let buscaProducto = ''
  let filtro = 'vigentes'
  let editando = null
  const valores = {}

  document.title = P.titulo
  document.body.innerHTML = `
    <header>
      <div><h1>${esc(P.titulo)}</h1><div class="sub">${esc(P.sub)}</div></div>
      <div class="user">Carga: <input id="usuario" placeholder="Tu nombre" autocomplete="name"></div>
    </header>
    <main>
      <section class="card"><h2 id="ftitle">Nueva autorización</h2><form id="form" autocomplete="off"></form></section>
      <section class="card">
        <div class="toolbar">
          <input id="buscar" placeholder="Buscar patente, nombre, empresa…">
          <div class="seg" id="filtro">
            <button type="button" data-v="vigentes" class="on">Hoy</button>
            <button type="button" data-v="proximas">Próximas</button>
            <button type="button" data-v="todas">Todas</button>
          </div>
          <span class="count" id="count"></span>
        </div>
        <div class="rows" id="rows"></div>
      </section>
    </main>`

  const user = $('#usuario')
  user.value = store.get('autorizaciones.usuario') ?? ''
  user.addEventListener('change', () => store.set('autorizaciones.usuario', user.value.trim()))

  const visible = (c) => !c.si || c.si(valores)

  /** Mismos formatos que el server (autorizaciones.mjs): argentinas, o cualquiera alfanumérica si es de otro país. */
  const PATENTE_AR = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/
  const patenteOk = (v) => !v || (valores.extranjera ? /^[A-Z0-9]{4,10}$/ : PATENTE_AR).test(v)
  const ERROR_PATENTE = 'Formato no válido. Se acepta AB123CD, ABC123, 123ABC o A123BCD. Si es de otro país, marcá la casilla.'

  function defaults() {
    for (const c of P.campos) valores[c.k] = c.def ?? (c.tipo === 'fecha' ? hoy() : c.opciones ? c.opciones[0][0] : '')
    valores.codProducto = ''
    buscaProducto = ''
  }

  /** Productos del catálogo que corresponden a lo que viene a hacer (despachar o descargar). */
  const productosDelTipo = (c) => productos.filter((p) => !c.segun || p[c.segun[valores.tipo]])

  const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  /** «AGUA POTABLE» → «Agua potable». */
  const bonito = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '')

  /**
   * Producto: un buscador que despliega la lista (solo lo que corresponde a despachar o descargar).
   * Elegido, queda como una ficha con «Cambiar». Si no está, la última opción es «Otro: lo que escribiste».
   */
  function inputProducto(c) {
    if (valores.codProducto) {
      const p = productos.find((x) => x.cod === valores.codProducto)
      return `<div class="elegido"><div><b>${esc(p ? bonito(p.nombre) : valores[c.k])}</b><span>${p ? esc(p.grupo) : 'Otro producto'}</span></div>
        <button type="button" class="btn small" id="cambiarprod">Cambiar</button></div>`
    }
    return `<div class="combo"><input class="buscaprod" id="f_${c.k}" placeholder="Escribí para buscar (ej. glicerina, aceite, metanol)" value="${esc(buscaProducto)}" autocomplete="off">
      <div class="drop" hidden></div></div>`
  }

  /** Arma el desplegable del buscador de producto según lo escrito. */
  function armarCombo(c) {
    const input = $('#form .buscaprod')
    if (!input) return
    const drop = input.nextElementSibling
    let activo = 0
    let opciones = []
    const elegir = (o) => {
      if (o.cod === 'otros' && !o.texto) { input.focus(); input.placeholder = 'Escribí qué producto es'; return }
      valores.codProducto = o.cod
      valores[c.k] = o.cod === 'otros' ? o.texto : o.nombre
      buscaProducto = ''
      renderForm()
    }
    const pintar = () => {
      const q = sinTildes(input.value.trim())
      const palabras = q.split(/\s+/).filter(Boolean)
      const lista = productosDelTipo(c).filter((p) => palabras.every((w) => sinTildes(`${p.nombre} ${p.grupo}`).includes(w)))
      opciones = [...lista, { cod: 'otros', texto: input.value.trim() }]
      activo = Math.min(activo, opciones.length - 1)
      let grupo = null
      drop.innerHTML = opciones.map((o, i) => {
        let h = ''
        if (o.cod !== 'otros' && o.grupo !== grupo) { grupo = o.grupo; h = `<div class="dg">${esc(grupo)}</div>` }
        const txt = o.cod === 'otros' ? (o.texto ? `Otro producto: <b>«${esc(o.texto)}»</b>` : 'Otro producto (escribilo arriba)') : esc(bonito(o.nombre))
        return `${h}<div class="do ${i === activo ? 'act' : ''} ${o.cod === 'otros' ? 'otro' : ''}" data-i="${i}">${txt}</div>`
      }).join('')
      drop.hidden = false
      drop.querySelector('.act')?.scrollIntoView({ block: 'nearest' })
    }
    input.addEventListener('focus', pintar)
    input.addEventListener('input', () => { buscaProducto = input.value; activo = 0; pintar() })
    input.addEventListener('blur', () => setTimeout(() => { drop.hidden = true }, 150))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length
        pintar()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (opciones[activo]) elegir(opciones[activo])
      } else if (e.key === 'Escape') drop.hidden = true
    })
    drop.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.do')
      if (!el) return
      e.preventDefault()
      elegir(opciones[Number(el.dataset.i)])
    })
  }

  function renderForm() {
    const form = $('#form')
    form.innerHTML = P.campos.filter(visible).map((c) => {
      const lab = `<label for="f_${c.k}">${esc(c.label)}${c.req ? ' <span class="req">*</span>' : ''}</label>`
      const v = esc(valores[c.k] ?? '')
      let input
      if (c.tipo === 'check') return `<div class="f"><label class="check"><input type="checkbox" data-k="${c.k}" ${valores[c.k] ? 'checked' : ''}> ${esc(c.label)}</label></div>`
      if (c.tipo === 'producto') input = inputProducto(c)
      else if (c.tipo === 'seg') input = `<div class="seg" data-k="${c.k}">${c.opciones.map(([val, txt]) => `<button type="button" data-v="${val}" class="${valores[c.k] === val ? 'on' : ''}">${esc(txt)}</button>`).join('')}</div>`
      else if (c.opciones) input = `<select id="f_${c.k}" data-k="${c.k}">${c.opciones.map(([val, txt]) => `<option value="${val}" ${valores[c.k] === val ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select>`
      else if (c.tipo === 'texto_largo') input = `<textarea id="f_${c.k}" data-k="${c.k}" placeholder="${esc(c.ph ?? '')}">${v}</textarea>`
      else input = `<input id="f_${c.k}" data-k="${c.k}" value="${v}" placeholder="${esc(c.ph ?? '')}" type="${c.tipo === 'fecha' ? 'date' : c.tipo === 'hora' ? 'time' : 'text'}" class="${c.tipo === 'patente' ? 'plate' : ''}" ${c.tipo === 'patente' ? 'maxlength="10" inputmode="text"' : ''}>`
      const hint = c.tipo === 'patente' ? `<div class="hint" id="hint_${c.k}"></div>` : ''
      return `<div class="f ${c.medio ? 'half' : ''}">${lab}${input}${hint}</div>`
    }).join('') + `
      <div class="msg" id="msg"></div>
      <div class="actions">
        <button class="btn primary" type="submit" id="guardar">${editando ? 'Guardar cambios' : 'Autorizar'}</button>
        ${editando ? '<button class="btn" type="button" id="cancelar">Cancelar</button>' : ''}
      </div>`
    $('#ftitle').textContent = editando ? `Editando ${editando.patente}` : 'Nueva autorización'
    form.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      valores[b.parentElement.dataset.k] = b.dataset.v
      // Cambió despachar/descargar: si el producto elegido no corresponde, se vuelve a elegir.
      const cp = P.campos.find((c) => c.tipo === 'producto')
      if (cp && valores.codProducto && valores.codProducto !== 'otros' && !productosDelTipo(cp).some((p) => p.cod === valores.codProducto)) {
        valores.codProducto = ''
        valores[cp.k] = ''
      }
      renderForm()
    }))
    const cp = P.campos.find((c) => c.tipo === 'producto')
    if (cp) {
      armarCombo(cp)
      $('#cambiarprod')?.addEventListener('click', () => {
        buscaProducto = valores.codProducto === 'otros' ? valores[cp.k] : ''
        valores.codProducto = ''
        valores[cp.k] = ''
        renderForm()
        $('#form .buscaprod')?.focus()
      })
    }
    form.querySelectorAll('[data-k]:is(input, select, textarea)').forEach((el) => {
      if (el.type === 'checkbox') {
        el.addEventListener('change', () => {
          valores[el.dataset.k] = el.checked
          for (const c of P.campos) if (c.tipo === 'patente' && valores[c.k]) consultar(c.k)
        })
        return
      }
      el.addEventListener('input', () => {
        if (el.classList.contains('plate')) {
          const limpio = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
          if (limpio !== el.value) el.value = limpio
          if (patenteOk(limpio)) el.classList.remove('bad')
        }
        valores[el.dataset.k] = el.value
      })
      if (el.classList.contains('plate')) el.addEventListener('blur', () => consultar(el.dataset.k))
    })
    $('#cancelar')?.addEventListener('click', () => { editando = null; defaults(); renderForm() })
    for (const c of P.campos) if (c.tipo === 'patente' && valores[c.k] && visible(c)) consultar(c.k)
  }

  const consultas = {}
  async function consultar(k) {
    const pat = String(valores[k] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const hint = $('#hint_' + k)
    if (!hint) return
    const input = $('#f_' + k)
    consultas[k] = (consultas[k] ?? 0) + 1
    if (!pat) { hint.textContent = ''; input?.classList.remove('bad'); return }
    if (!patenteOk(pat)) {
      hint.textContent = ERROR_PATENTE
      hint.className = 'hint err'
      input?.classList.add('bad')
      return
    }
    input?.classList.remove('bad')
    hint.textContent = ''
    hint.className = 'hint'
    // Si la respuesta llega tarde y mientras tanto cambió la patente o la casilla, se descarta.
    const turno = (consultas[k] = (consultas[k] ?? 0) + 1)
    try {
      const r = await fetch('/api/autorizaciones/consulta?patente=' + pat).then((x) => x.json())
      if (consultas[k] !== turno) return
      const partes = []
      let warn = false
      const v = r.vigente?.autorizacion
      if (v && (!editando || v.id !== editando.id)) { partes.push(`Ya autorizada hasta el ${fecha(v.hasta)} (${v.perfil.replace('_', ' ')}, ${v.tipo})`); warn = true }
      const h = r.historico
      if (h) partes.push(`Vino ${h.movements} ${h.movements === 1 ? 'vez' : 'veces'} por balanza${h.category ? ' (' + h.category.replace(/_/g, ' ') + ')' : ''}, última ${fecha(h.lastSeen)}`)
      const previas = r.autorizaciones.filter((a) => !v || a.id !== v.id).length
      if (previas) partes.push(`${previas} autorización${previas > 1 ? 'es' : ''} anterior${previas > 1 ? 'es' : ''}`)
      hint.textContent = partes.length ? partes.join(' · ') : 'Patente nueva: no está en la balanza ni en autorizaciones.'
      hint.className = 'hint' + (warn ? ' warn' : '')
    } catch { if (consultas[k] === turno) hint.textContent = '' }
  }

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const msg = $('#msg')
    const falta = P.campos.filter((c) => visible(c) && c.req && (!String(valores[c.k] ?? '').trim() || (c.tipo === 'producto' && !valores.codProducto)))
    if (falta.length) { msg.className = 'msg err'; msg.textContent = 'Falta: ' + falta.map((c) => c.label).join(', '); return }
    const malas = P.campos.filter((c) => c.tipo === 'patente' && !patenteOk(valores[c.k]))
    if (malas.length) { malas.forEach((c) => consultar(c.k)); msg.className = 'msg err'; msg.textContent = `${malas.map((c) => c.label).join(' y ')}: ${ERROR_PATENTE}`; return }
    if (!user.value.trim()) { msg.className = 'msg err'; msg.textContent = 'Poné tu nombre arriba a la derecha.'; user.focus(); return }
    const body = { perfil: P.perfil }
    for (const c of P.campos) body[c.k] = visible(c) ? valores[c.k] : null
    if (P.campos.some((c) => c.tipo === 'producto')) body.codProducto = valores.codProducto
    $('#guardar').disabled = true
    const res = await fetch(editando ? '/api/autorizaciones/' + editando.id : '/api/autorizaciones', {
      method: editando ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json', 'x-usuario': user.value.trim() }, body: JSON.stringify(body),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) { $('#guardar').disabled = false; msg.className = 'msg err'; msg.textContent = out.error ?? 'No se pudo guardar'; return }
    const fueEdicion = !!editando
    editando = null
    const keep = Object.fromEntries((P.mantener ?? []).map((k) => [k, valores[k]]))
    defaults()
    Object.assign(valores, keep)
    renderForm()
    $('#msg').className = 'msg ok'
    $('#msg').textContent = `${out.patente} ${fueEdicion ? 'actualizada' : 'autorizada'} (${fecha(out.desde)}${out.hasta !== out.desde ? ' al ' + fecha(out.hasta) : ''}).`
    await cargar()
    $('#form input.plate')?.focus()
  })

  $('#filtro').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    filtro = b.dataset.v
    $('#filtro').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
    renderLista()
  })
  $('#buscar').addEventListener('input', renderLista)

  function estado(a) {
    const d = hoy()
    if (a.estado === 'anulada') return ['Anulada', 'bad']
    if (a.hasta < d) return ['Vencida', 'gray']
    if (a.desde > d) return ['Desde ' + fecha(a.desde), 'warn']
    return ['Vigente', '']
  }

  function renderLista() {
    const d = hoy()
    const q = $('#buscar').value.trim().toUpperCase()
    const rows = lista
      .filter((a) => filtro === 'todas' || (a.estado === 'activa' && (filtro === 'vigentes' ? a.desde <= d && d <= a.hasta : a.desde > d)))
      .filter((a) => !q || JSON.stringify(a).toUpperCase().includes(q))
      .sort((a, b) => (b.creadoAt ?? '').localeCompare(a.creadoAt ?? ''))
    $('#count').textContent = `${rows.length} ${rows.length === 1 ? 'vehículo' : 'vehículos'}`
    $('#rows').innerHTML = rows.length ? rows.map((a) => {
      const [txt, cls] = estado(a)
      const activa = a.estado === 'activa' && a.hasta >= d
      const r = P.resumen(a)
      return `<div class="row ${activa ? '' : 'off'}">
        <div class="pl">${esc(a.patente)}${a.acoplado ? `<small>${esc(a.acoplado)}</small>` : ''}</div>
        <div class="info">
          <div class="t">${esc(r.titulo || '—')}</div>
          <div class="d"><span class="chip ${cls}">${txt}</span>${r.chips.map((c) => `<span class="chip gray">${esc(c)}</span>`).join('')}
            ${esc(PLANTA[a.planta] ?? a.planta)} · ${fecha(a.desde)}${a.hasta !== a.desde ? '–' + fecha(a.hasta) : ''}${a.hdesde ? ' · ' + esc(a.hdesde) + (a.hhasta ? '–' + esc(a.hhasta) : '') : ''}
            ${r.extra ? ' · ' + esc(r.extra) : ''} · cargó ${esc(a.creadoPor ?? '?')}</div>
        </div>
        <div class="acts">${activa ? `<button class="btn small" data-ed="${a.id}">Editar</button><button class="btn small danger" data-an="${a.id}">Anular</button>` : ''}</div>
      </div>`
    }).join('') : `<div class="empty">${filtro === 'vigentes' ? 'No hay vehículos autorizados para hoy.' : 'Nada para mostrar.'}</div>`
  }

  $('#rows').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-ed]')?.dataset.ed
    const an = e.target.closest('[data-an]')?.dataset.an
    if (ed) {
      editando = lista.find((a) => a.id === ed)
      for (const c of P.campos) valores[c.k] = editando[c.k] ?? ''
      valores.codProducto = editando.codProducto ?? ''
      renderForm()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    if (an) {
      const a = lista.find((x) => x.id === an)
      if (!user.value.trim()) { alert('Poné tu nombre arriba a la derecha.'); return }
      const motivo = prompt(`¿Anular la autorización de ${a.patente}? Motivo (opcional):`)
      if (motivo === null) return
      await fetch(`/api/autorizaciones/${an}/anular`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-usuario': user.value.trim() }, body: JSON.stringify({ motivo }) })
      await cargar()
    }
  })

  async function cargar() {
    const r = await fetch('/api/autorizaciones?perfil=' + P.perfil).then((x) => x.json())
    lista = r.autorizaciones
    renderLista()
  }

  async function iniciar() {
    if (P.campos.some((c) => c.tipo === 'producto')) productos = (await fetch('/autorizaciones/comun/productos.json').then((x) => x.json())).productos
    defaults()
    renderForm()
    cargar()
    setInterval(cargar, 60_000)
  }
  iniciar()
})()
