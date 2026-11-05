import { useState, useEffect } from 'preact/hooks'
import { db, norm, exportAll, importAll } from './db'
import { t, getLang } from './i18n'
import { readDoc, parsePages, parseReps, parseRest } from './parser'

const TABS = ['today', 'plans', 'progress', 'body', 'settings']
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const dec = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n }
const SET_SEC = 40
const setKcal = (it, kg) => ((SET_SEC + (it?.restMax ?? it?.restMin ?? 60)) / 3600) * +(localStorage.met || 5) * kg
const dayKcal = (items, logs, bw) => Math.round(items.reduce((a, it) => a + Array.from({ length: it.sets }).filter((_, i) => logs[it.id + '-' + i]?.done).length * setKcal(it, bw), 0))
const lastWeight = async () => (await db.bodyEntries.toArray()).filter(e => e.weight != null).sort((a, b) => a.date < b.date ? 1 : -1)[0]?.weight
const CARDIO = { esteira_caminhada: ['Esteira (caminhada)', 3.5], esteira_corrida: ['Esteira (corrida)', 9], bicicleta: ['Bicicleta', 6.8], eliptico: ['Elíptico', 5], escada: ['Escada', 8.8], remo: ['Remo', 7], corda: ['Pular corda', 11], outro: ['Outro', 5] }
const cardioKcal = (c, kg) => (CARDIO[c.type]?.[1] ?? 5) * kg * c.minutes / 60
let ac
const unlock = () => { try { ac ??= new (window.AudioContext || window.webkitAudioContext)(); ac.resume() } catch {} }
const beep = () => { try { const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = 0.25; o.start(); o.stop(ac.currentTime + 0.25) } catch {} }
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
  const [d, setD] = useState(null), [logs, setLogs] = useState({}), [prev, setPrev] = useState({}), [sess, setSess] = useState(null), [open, setOpen] = useState(null), [bw, setBw] = useState(null), [cardio, setCardio] = useState([]), [cf, setCf] = useState({ type: 'esteira_caminhada', min: '' })
  useEffect(() => { (async () => {
    setBw(await lastWeight()); setCardio(await db.cardio.where('date').equals(todayStr()).toArray())
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
  const [timer, setTimer] = useState(null), [now, setNow] = useState(Date.now()), [mute, setMute] = useState(localStorage.mute === '1')
  useEffect(() => { if (!timer) return; const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [timer])
  const left = timer ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : 0
  useEffect(() => {
    if (timer && !timer.fired && left === 0) {
      setTimer({ ...timer, fired: true })
      if (!mute) { beep(); setTimeout(beep, 350); setTimeout(beep, 700) }
      navigator.vibrate?.([200, 100, 200])
    }
  }, [left, timer])
  const wl = !!timer && !timer.fired
  useEffect(() => {
    if (!wl) return
    let lock; const get = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch {} }
    get(); const vis = () => { if (document.visibilityState === 'visible') get() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.().catch(() => {}) }
  }, [wl])
  const startRest = it => {
    unlock(); const r = it.restMax ?? it.restMin ?? 60
    if (!r) return setTimer(null)
    setNow(Date.now()); setTimer({ endAt: Date.now() + r * 1000, fired: false })
  }
  const save = async (it, i, patch) => {
    let sid = sess
    if (!sid) { sid = await db.sessions.add({ dayId: d.day.id, date: todayStr(), startedAt: Date.now() }); setSess(sid) }
    const k = it.id + '-' + i
    const nl = { ...(logs[k] || { sessionId: sid, planItemId: it.id, exerciseId: it.exerciseId, setIndex: i }), ...patch, timestamp: Date.now() }
    nl.id = await db.setLogs.put(nl); setLogs({ ...logs, [k]: nl })
  }
  const addCardio = async () => {
    const mins = dec(cf.min); if (!mins || mins <= 0) return
    await db.cardio.add({ date: todayStr(), type: cf.type, minutes: mins }); setCf({ ...cf, min: '' })
    setCardio(await db.cardio.where('date').equals(todayStr()).toArray())
  }
  const tabs = <div class="chips">{DOW.map((n, i) => <button class={wd === i + 1 ? 'on' : ''} onClick={() => setWd(i + 1)}>{n}</button>)}</div>
  if (!d) return null
  if (d.none) return <Empty title={t('today')} hint={t('noActive')} />
  return <div>{tabs}<p class="msg">{t('week')} {d.plan.weekNumber} · {d.day?.label || ''}</p>
    {bw ? (d.items.length > 0 || cardio.length > 0) && <p class="stats">Treino ~<b>{dayKcal(d.items, logs, bw)}</b> · Cardio ~<b>{Math.round(cardio.reduce((a, c) => a + cardioKcal(c, bw), 0))}</b> · Total ~<b>{dayKcal(d.items, logs, bw) + Math.round(cardio.reduce((a, c) => a + cardioKcal(c, bw), 0))}</b> kcal</p>
      : <p class="msg">Registre seu peso na aba Corpo para ver a estimativa de calorias.</p>}
    <details class="card"><summary>Cardio (opcional){cardio.length ? ` · ${cardio.reduce((a, c) => a + c.minutes, 0)} min` : ''}</summary>
      <div class="chips" style={{ flexWrap: 'wrap', margin: '10px 0' }}>{Object.entries(CARDIO).map(([k, [l]]) => <button style={{ flex: '1 0 30%' }} class={cf.type === k ? 'on' : ''} onClick={() => setCf({ ...cf, type: k })}>{l}</button>)}</div>
      <div class="g2"><input type="text" inputmode="decimal" placeholder="Minutos" value={cf.min} onInput={e => setCf({ ...cf, min: e.target.value })} /><button class="btn pri" onClick={addCardio}>Adicionar</button></div>
      {cardio.map(c => <div class="wk"><span>{CARDIO[c.type]?.[0]} · {c.minutes} min{bw ? ` · ~${Math.round(cardioKcal(c, bw))} kcal` : ''}</span>
        <button onClick={async () => { await db.cardio.delete(c.id); setCardio(cardio.filter(x => x.id !== c.id)) }}>✕</button></div>)}
    </details>
    {(!d.day || d.day.isRest) && <Empty title="OFF" hint="Descanso" />}
    {d.items.map(it => {
      const done = Array.from({ length: it.sets }).filter((_, i) => logs[it.id + '-' + i]?.done).length
      const isOpen = open === it.id
      return <div class={'card ex' + (done === it.sets ? ' fin' : '') + (it.groupId ? ' bi' : '')}>
        <div class="hd" onClick={() => setOpen(isOpen ? null : it.id)}>
          <b>{it.name}</b><span>{done}/{it.sets}{bw && done > 0 ? ` · ~${Math.round(done * setKcal(it, bw))} kcal` : ''}</span></div>
        <div class="msg">{it.sets}× {it.repsRaw} · {t('rest')} {it.restRaw}{it.tech1 && ` · ${it.tech1}`}{it.tech2 && ` · ${it.tech2}`}</div>
        {isOpen && Array.from({ length: it.sets }).map((_, i) => {
          const l = logs[it.id + '-' + i] || {}, pv = prev[it.id]?.[i], target = it.repScheme.perSet?.[i]
          return <div class="set"><span>{i + 1}</span>
            <input type="text" inputmode="decimal" placeholder={pv ? `${pv.weightKg}` : 'kg'} value={l.weightKg ?? ''} onChange={e => save(it, i, { weightKg: dec(e.target.value) })} />
            <input type="number" inputmode="numeric" placeholder={target ? `${target}` : pv?.reps ? `${pv.reps}` : 'reps'} value={l.reps ?? ''} onChange={e => save(it, i, { reps: e.target.value === '' ? null : +e.target.value })} />
            <button class={l.done ? 'on' : ''} onClick={() => { if (!l.done) startRest(it); save(it, i, { done: !l.done, weightKg: l.weightKg ?? pv?.weightKg ?? null, reps: l.reps ?? target ?? pv?.reps ?? null }) }}>✓</button></div>
        })}
        {isOpen && prev[it.id]?.[0] && <p class="msg">{t('last')}: {Object.values(prev[it.id]).map(x => `${x.weightKg}×${x.reps ?? '-'}`).join(' · ')}</p>}
      </div>
    })}
    {timer && <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--accent)', background: left ? 'var(--panel)' : 'var(--accent)', color: left ? 'var(--fg)' : '#000' }}>
      <b style={{ fontSize: 30, flex: 1 }}>{left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Próxima série!'}</b>
      <button class="btn" style={{ padding: '8px 12px' }} onClick={() => { unlock(); const v = !mute; setMute(v); localStorage.mute = v ? '1' : '0' }}>{mute ? '🔕' : '🔔'}</button>
      <button class="btn" style={{ padding: '8px 12px' }} onClick={() => setTimer({ ...timer, endAt: Math.max(timer.endAt, Date.now()) + 15000, fired: false })}>+15s</button>
      <button class="btn" style={{ padding: '8px 12px' }} onClick={() => setTimer(null)}>✕</button></div>}
  </div>
}

function Reminders() {
  const [days, setDays] = useState(JSON.parse(localStorage.remDays || '[1,3,5]')), [time, setTime] = useState(localStorage.remTime || '18:00'), [al, setAl] = useState(localStorage.remAlert || '0'), [msg, setMsg] = useState('')
  const toggle = n => { const v = days.includes(n) ? days.filter(x => x !== n) : [...days, n].sort(); setDays(v); localStorage.remDays = JSON.stringify(v) }
  const gen = async () => {
    if (!days.length) return setMsg('Escolha ao menos um dia.')
    const [h, mi] = time.split(':').map(Number), p = n => String(n).padStart(2, '0'), now = new Date()
    const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, ''), BY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
    const ev = days.map(wd => {
      const s = new Date(now); s.setDate(now.getDate() + (wd - (((now.getDay() + 6) % 7) + 1) + 7) % 7)
      return ['BEGIN:VEVENT', `UID:treino-${BY[wd - 1]}@treino.app`, `DTSTAMP:${stamp}`, `DTSTART:${s.getFullYear()}${p(s.getMonth() + 1)}${p(s.getDate())}T${p(h)}${p(mi)}00`,
        'DURATION:PT1H', `RRULE:FREQ=WEEKLY;BYDAY=${BY[wd - 1]}`, 'SUMMARY:Treino', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hora do treino', `TRIGGER:-PT${al}M`, 'END:VALARM', 'END:VEVENT'].join('\r\n')
    })
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Treino//PT', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n')
    const file = new File([ics], 'treino-lembretes.ics', { type: 'text/calendar' })
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return } } catch (e) { if (e.name === 'AbortError') return }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click()
  }
  return <div class="list"><label>Lembretes de treino (Calendário)</label>
    <div class="chips">{DOW.map((n, i) => <button class={days.includes(i + 1) ? 'on' : ''} onClick={() => toggle(i + 1)}>{n}</button>)}</div>
    <input type="time" value={time} onInput={e => { setTime(e.target.value); localStorage.remTime = e.target.value }} />
    <div class="chips">{[['0', 'Na hora'], ['15', '15 min antes'], ['30', '30 min antes']].map(([v, l]) => <button class={al === v ? 'on' : ''} onClick={() => { setAl(v); localStorage.remAlert = v }}>{l}</button>)}</div>
    <button class="btn" onClick={gen}>Gerar lembretes (.ics)</button>
    <p class="msg">{msg || 'Ao gerar, escolha Calendário e toque em Adicionar. Se já importou antes, apague os eventos antigos "Treino" para não duplicar.'}</p></div>
}

function Settings({ rerender }) {
  const [msg, setMsg] = useState(''), [persisted, setPersisted] = useState(false), [unit, setUnit] = useState(localStorage.getItem('unit') || 'kg'), [met, setMet] = useState(localStorage.getItem('met') || '5')
  useEffect(() => { navigator.storage?.persist?.().then(setPersisted) }, [])
  const set = (k, v) => { localStorage.setItem(k, v); k === 'lang' ? rerender() : k === 'unit' ? setUnit(v) : setMet(v) }
  const doExport = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(await exportAll()); a.download = `treino-backup-${todayStr()}.json`; a.click() }
  const doImport = async e => { try { await importAll(e.target.files[0]); setMsg(t('imported')) } catch { setMsg(t('error')) } }
  const Seg = ({ k, opts, val }) => <div class="seg">{opts.map(([v, l]) => <button class={val === v ? 'on' : ''} onClick={() => set(k, v)}>{l}</button>)}</div>
  return <div class="list">
    <label>{t('language')}</label><Seg k="lang" val={getLang()} opts={[['pt', 'Português'], ['en', 'English']]} />
    <label>{t('unit')}</label><Seg k="unit" val={unit} opts={[['kg', 'kg'], ['lb', 'lb']]} />
    <label>{t('intensity')}</label><Seg k="met" val={met} opts={[['3.5', 'Leve'], ['5', 'Moderada'], ['6', 'Intensa']]} />
    <p class="msg">Estimativa de calorias (MET × peso × tempo). O erro pode passar de 30%; use para comparar treinos.</p>
    <Reminders />
    <label>{t('data')}</label>
    <button class="btn" onClick={doExport}>{t('export')}</button>
    <label class="btn file">{t('import')}<input type="file" accept="application/json" onChange={doImport} hidden /></label>
    {msg && <p class="msg">{msg}</p>}
    <label>{t('storage')}</label><p class="msg">{persisted ? t('persisted') : t('notPersisted')}</p>
  </div>
}


const MET = { weight: 'Peso (kg)', cintura: 'Cintura (cm)', abdomen: 'Abdômen (cm)', quadril: 'Quadril (cm)', peito: 'Peito (cm)', braco: 'Braço (cm)', coxa: 'Coxa (cm)' }
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
  const num = k => dec(f[k])
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
      <div class="g2">{Object.entries(MET).map(([k, l]) => <input type="text" inputmode="decimal" placeholder={l} value={f[k] ?? ''} onInput={e => setF({ ...f, [k]: e.target.value })} />)}</div>
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

function Progress() {
  const [ex, setEx] = useState([]), [q, setQ] = useState(''), [sel, setSel] = useState(null), [m, setM] = useState('maxW'), [det, setDet] = useState(null), [cal, setCal] = useState(null)
  useEffect(() => { (async () => {
    const bw = await lastWeight(); if (!bw) return setCal({ nobw: true })
    const ss = await db.sessions.toArray(), its = await db.items.toArray(), logs = (await db.setLogs.toArray()).filter(l => l.done)
    const im = Object.fromEntries(its.map(i => [i.id, i])), sd = Object.fromEntries(ss.map(x => [x.id, x.date])); let w = 0, m = 0
    logs.forEach(l => { const d = sd[l.sessionId]; if (!d) return; const age = (Date.now() - new Date(d)) / 864e5, k = setKcal(im[l.planItemId], bw); if (age <= 7) w += k; if (age <= 30) m += k })
    ;(await db.cardio.toArray()).forEach(c => { const age = (Date.now() - new Date(c.date)) / 864e5, k = cardioKcal(c, bw); if (age <= 7) w += k; if (age <= 30) m += k })
    setCal({ w: Math.round(w), m: Math.round(m) })
  })() }, [])
  useEffect(() => { (async () => {
    const logs = (await db.setLogs.toArray()).filter(l => l.weightKg != null), by = {}
    logs.forEach(l => (by[l.exerciseId] ??= new Set()).add(l.sessionId))
    setEx((await db.exercises.toArray()).filter(e => by[e.id]).map(e => ({ ...e, n: by[e.id].size })).sort((a, b) => a.name.localeCompare(b.name)))
  })() }, [])
  useEffect(() => { if (!sel) return; (async () => {
    const logs = (await db.setLogs.where('exerciseId').equals(sel.id).toArray()).filter(l => l.weightKg != null)
    const ss = await db.sessions.toArray(), ds = await db.days.toArray(), ps = await db.plans.toArray(), by = {}
    logs.forEach(l => (by[l.sessionId] ??= []).push(l))
    setDet(Object.entries(by).map(([sid, ls]) => {
      const s = ss.find(x => x.id == sid); ls.sort((a, b) => a.setIndex - b.setIndex)
      return { date: s?.date || '', wk: ps.find(p => p.id === ds.find(d => d.id === s?.dayId)?.planId)?.weekNumber,
        sets: ls.map(l => `${l.weightKg}×${l.reps ?? '-'}`).join(' · '), maxW: Math.max(...ls.map(l => l.weightKg)),
        vol: Math.round(ls.reduce((a, l) => a + l.weightKg * (l.reps || 0), 0)),
        rm: Math.round(Math.max(...ls.map(l => l.weightKg * (1 + (l.reps || 0) / 30))) * 10) / 10 }
    }).sort((a, b) => a.date < b.date ? -1 : 1))
  })() }, [sel])
  if (sel) return <div class="list">
    <button class="btn" onClick={() => { setSel(null); setDet(null) }}>← {sel.name}</button>
    {det && <div>
      <p class="stats">Recorde <b>{Math.max(...det.map(r => r.maxW))}</b> kg · 1RM est. <b>{Math.max(...det.map(r => r.rm))}</b> · Volume <b>{Math.max(...det.map(r => r.vol))}</b></p>
      <div class="chips">{[['maxW', 'Carga máx'], ['rm', '1RM est.'], ['vol', 'Volume']].map(([k, l]) => <button class={m === k ? 'on' : ''} onClick={() => setM(k)}>{l}</button>)}</div>
      <Chart pts={det.map(r => ({ x: r.date.slice(5), y: r[m] }))} />
      {[...det].reverse().map(r => <div class="card"><b>{r.date}{r.wk ? ` · ${t('week')} ${r.wk}` : ''}</b><div class="msg">{r.sets}</div></div>)}
    </div>}
  </div>
  if (!ex.length) return <Empty title={t('progress')} hint="Registre cargas na aba Hoje para ver o histórico aqui." />
  return <div class="list">{cal && !cal.nobw && <p class="stats">~<b>{cal.w}</b> kcal na semana · <b>{cal.m}</b> kcal em 30 dias (treino + cardio)</p>}<input placeholder="Buscar exercício" value={q} onInput={e => setQ(e.target.value)} />
    {ex.filter(e => norm(e.name).includes(norm(q))).map(e => <div class="card hd" onClick={() => setSel(e)}><b>{e.name}</b><span>{e.n}×</span></div>)}</div>
}

export function App() {
  const [tab, setTab] = useState('today'), [, bump] = useState(0)
  return <div class="shell"><header><h1>{t(tab)}</h1></header>
    <main>{tab === 'today' && <Today key={localStorage.activePlan} />}
      {tab === 'plans' && <Plans go={setTab} />}
      {tab === 'progress' && <Progress />}
      {tab === 'body' && <Body />}
      {tab === 'settings' && <Settings rerender={() => bump(x => x + 1)} />}</main>
    <nav>{TABS.map(k => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>)}</nav></div>
}
