let worker
const base = () => new URL('ocr', document.baseURI).href
function prep(c) {
  const ctx = c.getContext('2d'), im = ctx.getImageData(0, 0, c.width, c.height), d = im.data
  let sum = 0, n = 0
  for (let i = 0; i < d.length; i += 160) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++ }
  const dark = sum / n < 120
  for (let i = 0; i < d.length; i += 4) {
    let g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    if (dark) g = 255 - g
    g = Math.max(0, Math.min(255, (g - 40) * 1.4)); d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(im, 0, 0)
}
export async function ocrCanvas(canvas, scale = 1) {
  prep(canvas)
  if (!worker) {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('por', 1, { workerPath: base() + '/worker.min.js', corePath: base(), langPath: base(), gzip: true })
  }
  const { data } = await worker.recognize(canvas)
  return (data.words || []).filter(w => w.text.trim() && w.confidence > 5)
    .map(w => ({ s: w.text.trim(), x: w.bbox.x0 / scale, y: -(w.bbox.y0 + w.bbox.y1) / 2 / scale, w: (w.bbox.x1 - w.bbox.x0) / scale, h: (w.bbox.y1 - w.bbox.y0) / scale }))
}
