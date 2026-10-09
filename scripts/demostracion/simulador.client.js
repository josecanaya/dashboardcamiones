(function () {
  var DATA = __DATA__
  var KEY = 'simulador-candidatos-0710-' + (document.title || '')
  var picks = {}
  var notes = {}
  try { notes = JSON.parse(localStorage.getItem(KEY + '-notas') || '{}') } catch (e) { notes = {} }
  try { picks = JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { picks = {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(picks)); localStorage.setItem(KEY + '-notas', JSON.stringify(notes)) } catch (e) {} }
  var pct = function (x) { return Math.round(x * 100) + ' %' }
  function reveal(d, el) {
    var r = el.querySelector('.reveal'), mine = picks[d.id]
    if (!mine) { r.hidden = true; el.querySelectorAll('.cand').forEach(function (b) { b.classList.remove('algo') }); return }
    var algo = d.elegido || '__ninguno__'
    el.querySelectorAll('.cand').forEach(function (b) { b.classList.toggle('algo', b.dataset.plate === algo) })
    var bars = d.candidatos.map(function (k) {
      return '<div class="bar"><span class="plate">' + k.plate + '</span><span class="tr"><i style="width:' + Math.max(1, k.p * 100) + '%"></i></span><span>' + pct(k.p) + '</span></div>'
    }).join('') + '<div class="bar otro"><span>Otro vehículo</span><span class="tr"><i style="width:' + Math.max(1, d.otro * 100) + '%"></i></span><span>' + pct(d.otro) + '</span></div>'
    var same = mine === algo || (mine === '__nocamion__' && algo === '__ninguno__')
    r.innerHTML = '<p class="verdict">' + (d.elegido ? 'El algoritmo eligió ' + d.elegido : 'El algoritmo no asignó: ningún candidato llegó al 60 %') + ' · ' + (same ? 'coincidís' : 'no coincidís') + '</p>' + bars +
      '<p class="small" style="margin:0;color:var(--muted);font-size:12px">Recuadro verde: lo que eligió el algoritmo. Violeta: tu elección.</p>'
    r.hidden = false
  }
  function paint() {
    var n = 0, si = 0, no = 0
    DATA.forEach(function (d) {
      var el = document.getElementById(d.id), mine = picks[d.id]
      el.querySelectorAll('.cand').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.plate === mine)) })
      reveal(d, el)
      if (mine) { n++; var a = d.elegido || '__ninguno__'; if (mine === a || (mine === '__nocamion__' && a === '__ninguno__')) si++; else no++ }
    })
    document.getElementById('nRev').textContent = n
    document.getElementById('nSi').textContent = si
    document.getElementById('nNo').textContent = no
    var grupo = function (label, list) {
      var dec = list.filter(function (d) { return picks[d.id] }), ok = dec.filter(function (d) { return picks[d.id] === (d.elegido || '__ninguno__') }).length
      var otro = dec.filter(function (d) { return !d.elegido && picks[d.id] !== '__ninguno__' }).length
      return '<tr><td>' + label + '</td><td>' + list.length + '</td><td>' + dec.length + '</td><td>' + ok + '</td><td>' + (dec.length - ok) + '</td><td>' + otro + '</td></tr>'
    }
    document.getElementById('tbl').innerHTML = '<tr><th>Grupo</th><th>Casos</th><th>Decididos</th><th>Coincidís</th><th>No coincidís</th><th>Vos elegiste uno y el algoritmo no</th></tr>' +
      grupo('El algoritmo asignó', DATA.filter(function (d) { return d.elegido })) + grupo('El algoritmo no asignó', DATA.filter(function (d) { return !d.elegido }))
    document.getElementById('concl').textContent = n < DATA.length ? 'Faltan ' + (DATA.length - n) + ' casos.' : 'Coincidís con el algoritmo en ' + si + ' de ' + n + ' casos.'
    var nom = function (v) { return v === '__ninguno__' ? 'ninguno' : v === '__nocamion__' ? 'no es camión' : v || 'sin decidir' }
    document.getElementById('out').value = 'Simulador 07/10: ' + DATA.map(function (d) { return d.id + ' ' + d.punto + ' ' + d.hora + ' leyó ' + d.leyo + ' → yo: ' + nom(picks[d.id]) + ' / algoritmo: ' + (d.elegido || 'ninguno') + (notes[d.id] ? ' [' + notes[d.id].replace(/s+/g, ' ').trim() + ']' : '') }).join(' | ')
  }
  document.querySelectorAll('.case').forEach(function (el) {
    el.querySelectorAll('.cand').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = el.dataset.id
        if (picks[id] === b.dataset.plate) delete picks[id]
        else picks[id] = b.dataset.plate
        save()
        paint()
      })
    })
    var ta = el.querySelector('.note')
    if (ta) { ta.value = notes[el.dataset.id] || ''; ta.addEventListener('input', function () { notes[el.dataset.id] = ta.value; save(); paint() }) }
    var im = el.querySelector('.capture > img')
    if (im) im.addEventListener('click', function () { im.parentElement.classList.toggle('zoom') })
  })
  document.getElementById('copy').addEventListener('click', function () {
    var t = document.getElementById('out'), btn = document.getElementById('copy')
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(function () { btn.textContent = 'Copiado' }, function () { t.select() })
    else t.select()
  })
  paint()
})()
