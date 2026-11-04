import { useState, useEffect } from 'preact/hooks'
import { db, norm, exportAll, importAll } from './db'
import { t, getLang } from './i18n'
import { readDoc, parsePages, parseReps, parseRest } from './parser'

const TABS = ['today', 'plans', 'body', 'settings']
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const todayStr = () => new Date().toLocaleDateString('sv')
const Empty = ({ title, hint }) => <div class="empty"><h2>{title}</h2><p>{hint}</p></div>

async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
  const pages = await readDoc(await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise)
  if (pages.every(p => p.length < 5)) throw new Error('noText')
  const r = parsePages(pages)
  const m = file.name.match(/semana[\s_-]*(\d+)/i)
  return { file: file.name, week: r.week ?? (m ? +m[1] : 1), days: r.days }
}

async function deletePlan(id) {
  const days = await db.days.where('planId').equals(id).toArray()
  for (const d of days) await db.items.where('dayId').equals(d.id).delete()
  await db.days.where('planId').equals(id).delete(); await db.plans.delete(id)
}

async function savePlans(name, parsed) {
  const progs = await db.programs.toArray()
  const pid = progs.find(p => p.name === name)?.id ?? await db.programs.add({ name, createdAt: Date.now() })
  let first
  for (const p of parsed) {
    for (const old of await db.plans.where('programId').equals(pid).and(x => x.weekNumber === p.week).toArray()) await deletePlan(old.id)
    const planId = await db.plans.add({ programId: pid, weekNumber: p.week, label: `${name} - ${p.week}`, createdAt: Date.now() })
    first ??= planId
    for (const d of p.days) {
      const dayId = await db.days.add({ planId, weekday: d.weekday, label: d.label, isRest: d.isRest })
      let order = 0
      for (const it of d.items) {
        const n = norm(it.name)
        const ex = await db.exercises.where('nameNormalized').equals(n).first()
        const exerciseId = ex?.id ?? await db.exercises.add({ name: it.name, nameNormalized: n })
        const rest = parseRest(it.rest)
        await db.items.add({ dayId, order: order++, exerciseId, name: it.name, sets: +it.sets || 1, repsRaw: it.reps, repScheme: parseReps(it.reps),
          restRaw: it.rest, restMin: rest.min, restMax: rest.max, tech1: it.t1, tech2: it.t2, groupId: it.group || null })
      }
    }
  }
  if (!localStorage.activePlan) localStorage.activePlan = first
}

function Review({ parsed, setParsed, name, setName, onSave, onCancel }) {
  const upd = (pi, di, ii, k, v) => { const c = structuredClone(parsed); c[pi].days[di].items[ii][k] = v; setParsed(c) }
  const rm = (pi, di, ii) => { const c = structuredClone(parsed); c[pi].days[di].items.splice(ii, 1); setParsed(c) }
  return <div class="list">
    <label>{t('programName')}</label><input value={name} onInput={e => setName(e.target.value)} />
    {parsed.map((p, pi) => <details class="card"><summary>{t('week')} {p.week} · {p.days.reduce((a, d) => a + d.items.length, 0)} ex.</summary>
      {p.days.map((d, di) => <div><h3>{d.label}{d.isRest ? ' (OFF)' : ''}</h3>
        {d.items.map((it, ii) => <div class="row">
          <input class="w" value={it.name} onInput={e => upd(pi, di, ii, 'name', e.target.value)} />
          <input class="s" value={it.sets} onInput={e => upd(pi, di, ii, 'sets', e.target.value)} />
          <input class="m" value={it.reps} onInput={e => upd(pi, di, ii, 'reps', e.target.value)} />
          <input class="m" value={it.rest} onInput={e => upd(pi, di, ii, 'rest', e.target.value)} />
          <input class="w" value={it.t1} onInput={e => upd(pi, di, ii, 't1', e.target.value)} />
          <input class="w" value={it.t2} onInput={e => upd(pi, di, ii, 't2', e.target.value)} />
          <button class="x" onClick={() => rm(pi, di, ii)}>✕</button></div>)}</div>)}
    </details>)}
    <button class="btn pri" onClick={onSave}>{t('save')}</button>
    <button class="btn" onClick={onCancel}>{t('cancel')}</button>
  </div>
}

function Plans({ go }) {
  const [progs, setProgs] = useState([]), [parsed, setParsed] = useState(null), [name, setName] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [, bump] = useState(0)
  const load = async () => {
    const ps = await db.programs.toArray(), pl = await db.plans.toArray()
    setProgs(ps.map(p => ({ ...p, plans: pl.filter(x => x.programId === p.id).sort((a, b) => a.weekNumber - b.weekNumber) })))
  }
  useEffect(() => { load() }, [])
  const pick = async e => {
    setBusy(true); setErr('')
    try {
      const out = []
      for (const f of e.target.files) out.push(await readPdf(f))
      out.sort((a, b) => a.week - b.week)
      setName(e.target.files[0].name.replace(/\.pdf$/i, '').replace(/[\s_-]*semana[\s_-]*\d+/i, '').replace(/_/g, ' ').trim() || 'Programa')
      setParsed(out)
    } catch (x) { setErr(x.message === 'noText' ? t('noText') : String(x.message)) }
    setBusy(false); e.target.value = ''
  }
  if (parsed) return <Review {...{ parsed, setParsed, name, setName }} onCancel={() => setParsed(null)}
    onSave={async () => { await savePlans(name, parsed); setParsed(null); load() }} />
  const active = +localStorage.activePlan
  return <div class="list">
    <label class="btn pri file">{busy ? t('reading') : t('importPdf')}<input type="file" accept="application/pdf" multiple hidden onChange={pick} /></label>
    {err && <p class="msg">{err}</p>}
    {!progs.length && <Empty title={t('noPlans')} hint={t('noPlansHint')} />}
    {progs.map(p => <div class="card"><h3>{p.name}</h3>
      {p.plans.map(pl => <div class="wk"><span>{t('week')} {pl.weekNumber}</span>
        <button class={active === pl.id ? 'on' : ''} onClick={() => { localStorage.activePlan = pl.id; bump(x => x + 1); go('today') }}>{active === pl.id ? t('active') : t('use')}</button>
        <button onClick={async () => { if (confirm(t('del') + '?')) { await deletePlan(pl.id); load() } }}>✕</button></div>)}</div>)}
  </div>
}

function Today() {
  const [wd, setWd] = useState(((new Date().getDay() + 6) % 7) + 1)
  const [d, setD] = useState(null), [logs, setLogs] = useState({}), [prev, setPrev] = useState({}), [sess, setSess] = useState(null), [open, setOpen] = useState(null)
  useEffect(() => { (async () => {
    const plan = +localStorage.activePlan && await db.plans.get(+localStorage.activePlan)
    if (!plan) return setD({ none: true })
    const day = await db.days.where('planId').equals(plan.id).and(x => x.weekday === wd).first()
    const items = day && !day.isRest ? await db.items.where('dayId').equals(day.id).sortBy('order') : []
    const s = day && await db.sessions.where('dayId').equals(day.id).and(x => x.date === todayStr()).first()
    const lg = {}; if (s) (await db.setLogs.where('sessionId').equals(s.id).toArray()).forEach(l => lg[l.planItemId + '-' + l.setIndex] = l)
    const pv = {}
    for (const it of items) {
      const all = (await db.setLogs.where('exerciseId').equals(it.exerciseId).toArray()).filter(l => l.sessionId !== s?.id && l.weightKg != null).sort((a, b) => b.timestamp - a.timestamp)
      if (all[0]) { pv[it.id] = {}; all.filter(l => l.sessionId === all[0].sessionId).forEach(l => pv[it.id][l.setIndex] = l) }
    }
    setSess(s?.id || null); setLogs(lg); setPrev(pv); setD({ plan, day, items })
  })() }, [wd])
  const save = async (it, i, patch) => {
    let sid = sess
    if (!sid) { sid = await db.sessions.add({ dayId: d.day.id, date: todayStr(), startedAt: Date.now() }); setSess(sid) }
    const k = it.id + '-' + i
    const nl = { ...(logs[k] || { sessionId: sid, planItemId: it.id, exerciseId: it.exerciseId, setIndex: i }), ...patch, timestamp: Date.now() }
    nl.id = await db.setLogs.put(nl); setLogs({ ...logs, [k]: nl })
  }
  const tabs = <div class="chips">{DOW.map((n, i) => <button class={wd === i + 1 ? 'on' : ''} onClick={() => setWd(i + 1)}>{n}</button>)}</div>
  if (!d) return null
  if (d.none) return <Empty title={t('today')} hint={t('noActive')} />
  return <div>{tabs}<p class="msg">{t('week')} {d.plan.weekNumber} · {d.day?.label || ''}</p>
    {(!d.day || d.day.isRest) && <Empty title="OFF" hint="Descanso" />}
    {d.items.map(it => {
      const done = Array.from({ length: it.sets }).filter((_, i) => logs[it.id + '-' + i]?.done).length
      const isOpen = open === it.id
      return <div class={'card ex' + (done === it.sets ? ' fin' : '') + (it.groupId ? ' bi' : '')}>
        <div class="hd" onClick={() => setOpen(isOpen ? null : it.id)}>
          <b>{it.name}</b><span>{done}/{it.sets}</span></div>
        <div class="msg">{it.sets}× {it.repsRaw} · {t('rest')} {it.restRaw}{it.tech1 && ` · ${it.tech1}`}{it.tech2 && ` · ${it.tech2}`}</div>
        {isOpen && Array.from({ length: it.sets }).map((_, i) => {
          const l = logs[it.id + '-' + i] || {}, pv = prev[it.id]?.[i], target = it.repScheme.perSet?.[i]
          return <div class="set"><span>{i + 1}</span>
            <input type="number" inputmode="decimal" placeholder={pv ? `${pv.weightKg}` : 'kg'} value={l.weightKg ?? ''} onChange={e => save(it, i, { weightKg: e.target.value === '' ? null : +e.target.value })} />
            <input type="number" inputmode="numeric" placeholder={target ? `${target}` : pv?.reps ? `${pv.reps}` : 'reps'} value={l.reps ?? ''} onChange={e => save(it, i, { reps: e.target.value === '' ? null : +e.target.value })} />
            <button class={l.done ? 'on' : ''} onClick={() => save(it, i, { done: !l.done, weightKg: l.weightKg ?? pv?.weightKg ?? null, reps: l.reps ?? target ?? pv?.reps ?? null })}>✓</button></div>
        })}
        {isOpen && prev[it.id]?.[0] && <p class="msg">{t('last')}: {Object.values(prev[it.id]).map(x => `${x.weightKg}×${x.reps ?? '-'}`).join(' · ')}</p>}
      </div>
    })}</div>
}

function Settings({ rerender }) {
  const [msg, setMsg] = useState(''), [persisted, setPersisted] = useState(false), [unit, setUnit] = useState(localStorage.getItem('unit') || 'kg')
  useEffect(() => { navigator.storage?.persist?.().then(setPersisted) }, [])
  const set = (k, v) => { localStorage.setItem(k, v); k === 'lang' ? rerender() : setUnit(v) }
  const doExport = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(await exportAll()); a.download = `treino-backup-${todayStr()}.json`; a.click() }
  const doImport = async e => { try { await importAll(e.target.files[0]); setMsg(t('imported')) } catch { setMsg(t('error')) } }
  const Seg = ({ k, opts, val }) => <div class="seg">{opts.map(([v, l]) => <button class={val === v ? 'on' : ''} onClick={() => set(k, v)}>{l}</button>)}</div>
  return <div class="list">
    <label>{t('language')}</label><Seg k="lang" val={getLang()} opts={[['pt', 'Português'], ['en', 'English']]} />
    <label>{t('unit')}</label><Seg k="unit" val={unit} opts={[['kg', 'kg'], ['lb', 'lb']]} />
    <label>{t('data')}</label>
    <button class="btn" onClick={doExport}>{t('export')}</button>
    <label class="btn file">{t('import')}<input type="file" accept="application/json" onChange={doImport} hidden /></label>
    {msg && <p class="msg">{msg}</p>}
    <label>{t('storage')}</label><p class="msg">{persisted ? t('persisted') : t('notPersisted')}</p>
  </div>
}


const MET = { weight: 'Peso (kg)', cintura: 'Cintura (cm)', peito: 'Peito (cm)', braco: 'Braço (cm)', coxa: 'Coxa (cm)' }
async function shrink(file, max, q) {
  const b = await createImageBitmap(file), k = Math.min(1, max / Math.max(b.width, b.height))
  const c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k)
  c.getContext('2d').drawImage(b, 0, 0, c.width, c.height)
  return new Promise(r => c.toBlob(r, 'image/jpeg', q))
}
function Chart({ pts }) {
  if (pts.length < 2) return <p class="msg">Registre ao menos 2 medidas para ver o gráfico.</p>
  const W = 320, H = 150, P = 26; let lo = Math.min(...pts.map(p => p.y)), hi = Math.max(...pts.map(p => p.y)); if (lo === hi) { lo -= 1; hi += 1 }
  const X = i => P + i * (W - 2 * P) / (pts.length - 1), Y = v => H - P - (v - lo) * (H - 2 * P) / (hi - lo)
  return <svg viewBox={`0 0 ${W} ${H}`} class="chart"><polyline fill="none" stroke="#ffd400" stroke-width="2" points={pts.map((p, i) => X(i) + ',' + Y(p.y)).join(' ')} />
    {pts.map((p, i) => <circle cx={X(i)} cy={Y(p.y)} r="3" fill="#ffd400" />)}
    <text x="4" y="14" fill="#9b9886" font-size="11">{hi}</text><text x="4" y={H - 10} fill="#9b9886" font-size="11">{lo}</text>
    <text x={P} y={H - 2} fill="#9b9886" font-size="11">{pts[0].x}</text><text x={W - P} y={H - 2} text-anchor="end" fill="#9b9886" font-size="11">{pts[pts.length - 1].x}</text></svg>
}
function Body() {
  const [es, setEs] = useState([]), [ph, setPh] = useState([]), [f, setF] = useState({ date: todayStr() }), [m, setM] = useState('weight'), [big, setBig] = useState(null)
  const load = async () => {
    setEs((await db.bodyEntries.toArray()).sort((a, b) => a.date < b.date ? -1 : 1))
    setPh((await db.photos.toArray()).sort((a, b) => a.date < b.date ? 1 : -1).map(p => ({ ...p, url: URL.createObjectURL(p.thumb) })))
  }
  useEffect(() => { load() }, [])
  const num = k => f[k] == null || f[k] === '' ? null : +String(f[k]).replace(',', '.')
  const add = async () => {
    const e = { date: f.date || todayStr(), ...Object.fromEntries(Object.keys(MET).map(k => [k, num(k)])) }
    if (Object.keys(MET).every(k => e[k] == null)) return
    const old = es.find(x => x.date === e.date)
    await db.bodyEntries.put(old ? { ...old, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null)) } : e)
    setF({ date: todayStr() }); load()
  }
  const addPhotos = async ev => {
    for (const file of ev.target.files) await db.photos.add({ date: todayStr(), blob: await shrink(file, 1600, 0.8), thumb: await shrink(file, 320, 0.7) })
    ev.target.value = ''; load()
  }
  const pts = es.filter(e => e[m] != null).map(e => ({ x: e.date.slice(5), y: e[m] }))
  return <div class="list">
    <div class="card"><h3>Novo registro</h3>
      <input type="date" value={f.date} onInput={e => setF({ ...f, date: e.target.value })} />
      <div class="g2">{Object.entries(MET).map(([k, l]) => <input type="number" inputmode="decimal" placeholder={l} value={f[k] ?? ''} onInput={e => setF({ ...f, [k]: e.target.value })} />)}</div>
      <button class="btn pri" onClick={add}>{t('save')}</button></div>
    <div class="chips">{Object.keys(MET).map(k => <button class={m === k ? 'on' : ''} onClick={() => setM(k)}>{MET[k].split(' ')[0]}</button>)}</div>
    <Chart pts={pts} />
    {[...es].reverse().slice(0, 8).map(e => <div class="wk"><span>{e.date} · {Object.keys(MET).filter(k => e[k] != null).map(k => `${MET[k].split(' ')[0]} ${e[k]}`).join(' · ')}</span>
      <button onClick={async () => { await db.bodyEntries.delete(e.id); load() }}>✕</button></div>)}
    <label class="btn file">Adicionar fotos<input type="file" accept="image/*" multiple hidden onChange={addPhotos} /></label>
    <div class="photos">{ph.map(p => <img src={p.url} onClick={() => setBig(p)} />)}</div>
    {big && <div class="lb"><img src={URL.createObjectURL(big.blob)} /><div class="g2"><button class="btn" onClick={() => setBig(null)}>Fechar</button>
      <button class="btn" onClick={async () => { if (confirm('Apagar foto?')) { await db.photos.delete(big.id); setBig(null); load() } }}>Apagar</button></div><p class="msg">{big.date}</p></div>}
  </div>
}

export function App() {
  const [tab, setTab] = useState('today'), [, bump] = useState(0)
  return <div class="shell"><header><h1>{t(tab)}</h1></header>
    <main>{tab === 'today' && <Today key={localStorage.activePlan} />}
      {tab === 'plans' && <Plans go={setTab} />}
      {tab === 'body' && <Body />}
      {tab === 'settings' && <Settings rerender={() => bump(x => x + 1)} />}</main>
    <nav>{TABS.map(k => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>)}</nav></div>
}
