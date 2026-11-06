const nz = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const WD = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 7 }
const NOISE = /CREF|Toni Bledow/i

export async function readDoc(doc) {
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    pages.push(tc.items.filter(x => x.str.trim()).map(x => ({ s: x.str.trim(), x: x.transform[4], y: x.transform[5], w: x.width })))
  }
  return pages
}

export function parseReps(raw) {
  const r = raw.replace(/\s+/g, ' ').trim()
  if (/^\d+(\s*\/\s*\d+)+$/.test(r)) return { type: 'pyramid', perSet: r.split('/').map(n => +n) }
  const m = r.match(/^(\d+)\s*a\s*(\d+)$/i); if (m) return { type: 'range', min: +m[1], max: +m[2] }
  if (/^\d+$/.test(r)) return { type: 'fixed', n: +r }
  if (/^falha$/i.test(r)) return { type: 'failure' }
  return { type: 'text' }
}
export function parseRest(raw) {
  const n = (raw || '').match(/\d+/g); if (!n) return { min: null, max: null }
  return { min: +n[0], max: +(n[1] ?? n[0]) }
}

function toRows(items) {
  const rows = []
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const r = rows.find(r => Math.abs(r.y - it.y) < 3)
    r ? r.items.push(it) : rows.push({ y: it.y, items: [it] })
  }
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x))
  return rows.sort((a, b) => b.y - a.y)
}

function headerCols(row) {
  const cols = []
  for (const it of row.items) {
    const k = nz(it.s), c = it.x + it.w / 2
    const key = k.startsWith('exercicio') ? 'name' : k.startsWith('serie') ? 'sets' : k === 'reps' ? 'reps'
      : k === 'desc' ? 'rest' : k.startsWith('tecnica') ? (k.endsWith('2') ? 't2' : 't1') : null
    if (key) cols.push({ key, c, x: it.x })
  }
  return cols.some(c => c.key === 'name') && cols.some(c => c.key === 'reps') ? cols : null
}

export function parsePages(pages) {
  let week = null, cols = null, day = null, last = null, lastY = 0, group = 0, pend = 0
  const days = []
  for (const items of pages) {
    for (const row of toRows(items)) {
      const text = row.items.map(i => i.s).join(' ')
      const wk = text.match(/semana\s*(\d+)/i); if (wk && week == null) week = +wk[1]
      const wd = row.items.length <= 2 && WD[nz(text).replace(/-?feira.*/, '')]
      if (wd) { day = { weekday: wd, label: text, isRest: false, items: [] }; days.push(day); last = null; continue }
      const h = headerCols(row); if (h) { cols = h; continue }
      if (!cols || !day) continue
      if (/off\s*-?\s*descanso/i.test(text)) { day.isRest = true; continue }
      const cells = {}; let bi = false
      for (const it of row.items) {
        if (NOISE.test(it.s)) continue
        if (/^bi-?set$/i.test(it.s)) { bi = true; continue }
        const c = it.x + it.w / 2
        const idx = it.x < (cols[0].c + (cols[1]?.c ?? 0)) / 2 ? 0
          : cols.reduce((b, k, i) => Math.abs(k.c - c) < Math.abs(cols[b].c - c) ? i : b, 0)
        const k = cols[idx].key; cells[k] = cells[k] ? cells[k] + ' ' + it.s : it.s
      }
      if (bi && !Object.keys(cells).length && last) { last.group = last.group || ++group; pend = last.group; continue }
      if (cells.name && /^bi-?set\s+/i.test(cells.name)) { bi = true; cells.name = cells.name.replace(/^bi-?set\s+/i, '') }
      if (/^\d+$/.test(cells.sets || '') && cells.name) {
        const it = { name: cells.name, sets: +cells.sets, reps: cells.reps || '', rest: cells.rest || '', t1: cells.t1 || '', t2: cells.t2 || '', group: 0 }
        if (bi) { group = ++group; pend = group; it.group = group } else if (pend) { it.group = pend; pend = 0 }
        day.items.push(it); last = it; lastY = row.y
      } else if (last && lastY - row.y < 26 && !cells.sets) {
        for (const k of ['name', 't1', 't2', 'reps', 'rest']) if (cells[k]) last[k === 'name' ? 'name' : k] += ' ' + cells[k]
        lastY = row.y
      }
    }
  }
  const fix = s => s.replace(/ù/g, 'ú').replace(/Descrescente/g, 'Decrescente').replace(/\s+/g, ' ').trim()
  days.forEach(d => d.items.forEach(i => { i.t1 = fix(i.t1); i.t2 = fix(i.t2); i.name = fix(i.name); i.reps = i.reps.replace(/\s+/g, ' ').trim() }))
  return { week, days }
}
