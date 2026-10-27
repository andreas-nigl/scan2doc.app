/* Runs entirely inside a dedicated worker; all image inputs are local data URLs. */
'use strict';
const ready = Promise.resolve(self.cv);
let cache = null;
async function decodeImage(url) {
  if (!/^data:image\/(png|jpeg);base64,/.test(url)) throw new Error('Ungültiges lokales Bild.');
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = surface.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
  return surface;
}
function toMat(cv, surface) { return cv.matFromImageData(surface.getContext('2d').getImageData(0, 0, surface.width, surface.height)); }
function toCanvas(mat) {
  const surface = new OffscreenCanvas(mat.cols, mat.rows);
  surface.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows), 0, 0);
  return surface;
}
async function encode(surface, type = 'image/png', quality = .94) {
  return new FileReaderSync().readAsDataURL(await surface.convertToBlob({type, quality}));
}
async function smallUrl(surface, maximum = 240) {
  const ratio = Math.min(1, maximum / Math.max(surface.width, surface.height));
  const small = new OffscreenCanvas(Math.max(1, Math.round(surface.width * ratio)), Math.max(1, Math.round(surface.height * ratio)));
  small.getContext('2d').drawImage(surface, 0, 0, small.width, small.height);
  return encode(small, 'image/jpeg', .85);
}
function clearCache() { if (cache) { cache.original.delete(); cache.corrected.delete(); cache = null; } }
async function execute(job) {
  const cv = await ready;
  if (job.kind === 'ready') return {ready: !!cv.Mat};
  if (job.kind === 'detect') {
    const source = await decodeImage(job.source), mat = toMat(cv, source);
    try { return S2DVision.detect(cv, mat, job.maximum || 800); } finally { mat.delete(); }
  }
  if (job.kind === 'rotate') {
    const result = {};
    for (const key of ['source', 'original', 'processed']) {
      const source = await decodeImage(job[key]);
      const surface = new OffscreenCanvas(source.height, source.width), ctx = surface.getContext('2d');
      if (job.direction > 0) { ctx.translate(surface.width, 0); ctx.rotate(Math.PI / 2); }
      else { ctx.translate(0, surface.height); ctx.rotate(-Math.PI / 2); }
      ctx.drawImage(source, 0, 0); result[key] = await encode(surface, key === 'source' ? 'image/jpeg' : 'image/png', .97);
      if (key === 'source') { result.width = source.width; result.height = source.height; }
      if (key === 'processed') result.thumb = await smallUrl(surface);
    }
    clearCache(); return result;
  }
  let originalUrl = job.original;
  if (job.newCrop) {
    const source = await decodeImage(job.source), input = toMat(cv, source); let warped;
    try { warped = S2DVision.warp(cv, input, job.corners, job.inset); originalUrl = await encode(toCanvas(warped)); }
    finally { input.delete(); warped?.delete(); }
  }
  if (!cache || cache.url !== originalUrl) {
    clearCache(); const source = await decodeImage(originalUrl), original = toMat(cv, source);
    try { cache = {url: originalUrl, original, corrected: S2DVision.enhance(cv, original, 'auto', 1)}; }
    catch (error) { original.delete(); throw error; }
  }
  const result = new cv.Mat();
  try {
    if (job.mode === 'original') cache.original.copyTo(result);
    else {
      cv.addWeighted(cache.original, 1 - job.strength, cache.corrected, job.strength, 0, result);
      if (job.mode === 'gray' || job.mode === 'bw') {
        const gray = new cv.Mat();
        try {
          cv.cvtColor(result, gray, cv.COLOR_RGBA2GRAY);
          if (job.mode === 'bw') cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 41, 12);
          cv.cvtColor(gray, result, cv.COLOR_GRAY2RGBA);
        } finally { gray.delete(); }
      }
    }
    const surface = toCanvas(result);
    if (job.kind === 'preview') return {processed: await smallUrl(surface, 700)};
    return {original: originalUrl, processed: await encode(surface), thumb: await smallUrl(surface)};
  } finally { result.delete(); }
}
let queue = Promise.resolve();
self.onmessage = event => {
  const {id, ...job} = event.data;
  queue = queue.catch(() => {}).then(async () => {
    try { self.postMessage({id, result: await execute(job)}); }
    catch (error) { self.postMessage({id, error: error.message || String(error)}); }
  });
};
