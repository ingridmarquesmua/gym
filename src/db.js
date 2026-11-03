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
export const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export async function exportAll() {
  const out = { app: 'treino', version: 1, exportedAt: new Date().toISOString(), tables: {} }
  for (const t of db.tables) out.tables[t.name] = t.name === 'photos' ? [] : await t.toArray()
  return new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
}
export async function importAll(file) {
  const data = JSON.parse(await file.text())
  if (data.app !== 'treino') throw new Error('invalid')
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (data.tables[t.name]?.length) await t.bulkPut(data.tables[t.name])
  })
}
