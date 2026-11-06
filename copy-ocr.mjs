import { cpSync, mkdirSync } from 'fs'
mkdirSync('dist/ocr', { recursive: true })
for (const p of ['node_modules/tesseract.js/dist/worker.min.js', 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz'])
  cpSync(p, 'dist/ocr/' + p.split('/').pop())
