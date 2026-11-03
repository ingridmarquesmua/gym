import { useState, useEffect } from 'preact/hooks'
import { db, exportAll, importAll } from './db'
import { t, getLang } from './i18n'

const TABS = ['today', 'plans', 'body', 'settings']

function Empty({ title, hint }) {
  return <div class="empty"><h2>{title}</h2><p>{hint}</p></div>
}

function Plans() {
  const [n, setN] = useState({ p: 0, w: 0, s: 0 })
  useEffect(() => { (async () => setN({ p: await db.programs.count(), w: await db.plans.count(), s: await db.sessions.count() }))() }, [])
  if (!n.p) return <Empty title={t('noPlans')} hint={t('noPlansHint')} />
  return <div class="stats"><b>{n.p}</b> {t('programs')} · <b>{n.w}</b> {t('weeks')} · <b>{n.s}</b> {t('sessions')}</div>
}

function Settings({ rerender }) {
  const [msg, setMsg] = useState('')
  const [persisted, setPersisted] = useState(false)
  const [unit, setUnit] = useState(localStorage.getItem('unit') || 'kg')
  useEffect(() => { navigator.storage?.persist?.().then(setPersisted) }, [])
  const set = (k, v) => { localStorage.setItem(k, v); k === 'lang' ? rerender() : setUnit(v) }
  const doExport = async () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await exportAll())
    a.download = `treino-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const doImport = async e => {
    try { await importAll(e.target.files[0]); setMsg(t('imported')) } catch { setMsg(t('error')) }
  }
  const Seg = ({ k, opts, val }) => <div class="seg">{opts.map(([v, l]) =>
    <button class={val === v ? 'on' : ''} onClick={() => set(k, v)}>{l}</button>)}</div>
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

export function App() {
  const [tab, setTab] = useState('today')
  const [, bump] = useState(0)
  return <div class="shell">
    <header><h1>{t(tab)}</h1></header>
    <main>
      {tab === 'today' && <Empty title={t('today')} hint={t('todayHint')} />}
      {tab === 'plans' && <Plans />}
      {tab === 'body' && <Empty title={t('body')} hint={t('bodyHint')} />}
      {tab === 'settings' && <Settings rerender={() => bump(x => x + 1)} />}
    </main>
    <nav>{TABS.map(k => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>)}</nav>
  </div>
}
