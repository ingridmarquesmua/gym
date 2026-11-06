let worker
const base = () => new URL('ocr', document.baseURI).href
export async function ocrCanvas(canvas, scale = 1) {
  if (!worker) {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('por', 1, { workerPath: base() + '/worker.min.js', corePath: base(), langPath: base(), gzip: true })
  }
  const { data } = await worker.recognize(canvas)
  return (data.words || []).filter(w => w.text.trim() && w.confidence > 5)
    .map(w => ({ s: w.text.trim(), x: w.bbox.x0 / scale, y: -(w.bbox.y0 + w.bbox.y1) / 2 / scale, w: (w.bbox.x1 - w.bbox.x0) / scale }))
}
