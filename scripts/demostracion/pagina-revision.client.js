(function () {
  var DATA = __DATA__
  var KEY = 'revision-corregidos-0710'
  var votes = {}
  try { votes = JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { votes = {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(votes)) } catch (e) {} }
  function row(label, list) {
    var si = list.filter(function (d) { return votes[d.id] === 'si' }).length
    var no = list.filter(function (d) { return votes[d.id] === 'no' }).length
    var ns = list.filter(function (d) { return votes[d.id] === 'nose' }).length
    var pct = si + no ? Math.round((si / (si + no)) * 100) + ' %' : '—'
    return '<tr><td>' + label + '</td><td>' + list.length + '</td><td>' + si + '</td><td>' + no + '</td><td>' + ns + '</td><td>' + pct + '</td></tr>'
  }
  function paint() {
    var si = 0, no = 0, ns = 0
    DATA.forEach(function (d) {
      var el = document.getElementById(d.id), v = votes[d.id]
      el.classList.remove('si', 'no', 'nose')
      if (v) el.classList.add(v)
      el.querySelectorAll('.vote button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === v)) })
      if (v === 'si') si++
      else if (v === 'no') no++
      else if (v === 'nose') ns++
    })
    document.getElementById('nRev').textContent = si + no + ns
    document.getElementById('nSi').textContent = si
    document.getElementById('nNo').textContent = no
    document.getElementById('nNs').textContent = ns
    var f = function (k, v) { return DATA.filter(function (d) { return d[k] === v }) }
    document.getElementById('tbl').innerHTML = '<tr><th>Grupo</th><th>Casos</th><th>Sí es</th><th>No es</th><th>No se ve</th><th>Acierto</th></tr>' +
      row('Todos', DATA) + row('Patente parecida', f('tipo', 'parecida')) + row('Fragmento (la patente no ayuda)', f('tipo', 'fragmento')) +
      row('Corregido al pasar', f('metodo', 'al pasar')) + row('Buscado antes de deducir', f('metodo', 'buscado antes de deducir'))
    var done = si + no + ns
    document.getElementById('concl').textContent = done < DATA.length
      ? 'Faltan ' + (DATA.length - done) + ' casos por revisar.'
      : 'Acierto sobre los que se ven: ' + (si + no ? Math.round((si / (si + no)) * 100) : 0) + ' % (' + si + ' de ' + (si + no) + '). La tabla muestra si falla más en los fragmentos o en los buscados antes de deducir.'
    document.getElementById('out').value = 'Revisión 07/10: ' + DATA.map(function (d) { return d.id + ' ' + d.camion + ' ' + d.punto + ' leyó ' + d.leyo + ' → ' + (votes[d.id] || 'sin marcar') }).join(' | ')
  }
  document.querySelectorAll('.case').forEach(function (el) {
    el.querySelectorAll('.vote button').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = el.dataset.id
        if (votes[id] === b.dataset.v) delete votes[id]
        else votes[id] = b.dataset.v
        save()
        paint()
      })
    })
    el.querySelectorAll('figure > img:first-child').forEach(function (im) { im.addEventListener('click', function () { im.parentElement.classList.toggle('zoom') }) })
  })
  document.getElementById('copy').addEventListener('click', function () {
    var t = document.getElementById('out')
    var btn = document.getElementById('copy')
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(function () { btn.textContent = 'Copiado' }, function () { t.select() })
    else t.select()
  })
  paint()
})()
