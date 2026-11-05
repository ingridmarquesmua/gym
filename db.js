import Dexie from 'dexie'
export const db = new Dexie('treino')
db.version(1).stores({
  exercises: '++id,nameNormalized',
  programs: '++id,createdAt',
  plans: '++id,programId,weekNumber',
  days: '++id,planId,weekday',
  items: '++id,dayId,exerciseId,order',
  sessions: '++id,dayId,date',
  setLogs: '++id,sessionId,exerciseId,timestamp',
  bodyEntries: '++id,date',
  photos: '++id,date',
  reminders: '++id'
})
db.version(2).stores({ cardio: '++id,date' })
export const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const b2d = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) })
const d2b = async u => (await fetch(u)).blob()

export async function exportAll() {
  const out = { app: 'treino', version: 2, exportedAt: new Date().toISOString(), tables: {} }
  for (const t of db.tables) {
    let rows = await t.toArray()
    if (t.name === 'photos') rows = await Promise.all(rows.map(async p => ({ ...p, blob: await b2d(p.blob), thumb: await b2d(p.thumb) })))
    out.tables[t.name] = rows
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' })
}
export async function importAll(file) {
  const data = JSON.parse(await file.text())
  if (data.app !== 'treino') throw new Error('invalid')
  const ph = data.tables.photos
  if (ph?.length) data.tables.photos = await Promise.all(ph.map(async p => ({ ...p, blob: await d2b(p.blob), thumb: await d2b(p.thumb) })))
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (data.tables[t.name]?.length) await t.bulkPut(data.tables[t.name])
  })
}
