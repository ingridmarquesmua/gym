const d = {
  pt: { today: 'Hoje', plans: 'Fichas', body: 'Corpo', settings: 'Ajustes',
    noPlans: 'Nenhuma ficha ainda', noPlansHint: 'A importação de PDF e a criação manual chegam na próxima etapa.',
    programs: 'programas', weeks: 'semanas', sessions: 'treinos registrados',
    language: 'Idioma', unit: 'Unidade de carga', data: 'Dados', export: 'Exportar backup (JSON)',
    import: 'Restaurar backup', storage: 'Armazenamento', persisted: 'Protegido contra limpeza',
    notPersisted: 'Não protegido: instale na tela inicial', imported: 'Backup restaurado', error: 'Arquivo inválido. Escolha um backup exportado por este app.',
    soon: 'Em breve', todayHint: 'O treino do dia aparece aqui quando houver uma ficha.', bodyHint: 'Peso, medidas e fotos chegam na etapa 6.' },
  en: { today: 'Today', plans: 'Plans', body: 'Body', settings: 'Settings',
    noPlans: 'No plans yet', noPlansHint: 'PDF import and manual creation arrive in the next step.',
    programs: 'programs', weeks: 'weeks', sessions: 'logged workouts',
    language: 'Language', unit: 'Weight unit', data: 'Data', export: 'Export backup (JSON)',
    import: 'Restore backup', storage: 'Storage', persisted: 'Protected from cleanup',
    notPersisted: 'Not protected: add to Home Screen', imported: 'Backup restored', error: 'Invalid file. Choose a backup exported by this app.',
    soon: 'Soon', todayHint: "Today's workout shows here once you have a plan.", bodyHint: 'Weight, measures and photos arrive in step 6.' }
}
export const getLang = () => localStorage.getItem('lang') || (navigator.language.startsWith('en') ? 'en' : 'pt')
d.en.progress = 'Progress'
Object.assign(d.pt, { progress: 'Evolução', importPdf: 'Importar PDF(s)', reading: 'Lendo...', review: 'Revisar importação', programName: 'Nome do programa',
  save: 'Salvar fichas', cancel: 'Cancelar', use: 'Usar', active: 'Ativa', del: 'Apagar', rest: 'Descanso', noActive: 'Escolha uma ficha na aba Fichas.',
  week: 'Semana', noText: 'Sem texto selecionável (PDF digitalizado). O OCR chega na próxima parte.', last: 'Última', set: 'Série', load: 'Carga', reps: 'Reps', saved: 'Salvo' })
export const t = k => d[getLang()][k] || d.pt[k] || k
