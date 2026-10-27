'use strict';

// Replaced by the build. No document data, credentials or export files enter this cache.
const BUILD = "bf0f3cc571d924da";
const FILES = [{"path":"assets/bf0f3cc571d924da/app.js","bytes":47148,"sha256":"9a86d47657d33e012d62acf631dc98e941c12cb3769e81399374be3b0a3d97f6","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/extras.js","bytes":15112,"sha256":"561d4822c6d7b25abad60ddb56d7b6d8870043ced0818c301f5f1f221da515b5","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/metadata.js","bytes":4040,"sha256":"1fefd182f3746de97ea449f34a357c837e38c7a03010fb434ba491169620e7b2","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/vision.js","bytes":8454,"sha256":"8847ec0d87d7db7985975cf84f149ce1e477bee55ab0bfd564f6159f9954f9fb","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/pdf-lib.js","bytes":525099,"sha256":"0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/tesseract.js","bytes":62961,"sha256":"000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/opencv.js","bytes":13298870,"sha256":"fff89d4ae3db9144a18a13161dd45547af688cf2191674a640ca131df99cc228","label":"Bildverarbeitung"},{"path":"assets/bf0f3cc571d924da/image-worker.js","bytes":4463,"sha256":"555ed72e65cdab548c19c9dbb27ee66c90d4d735ee56f3a58d75dc776d76ed93","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/ocr-worker.js","bytes":4008109,"sha256":"981804557d19228890b9784071a76e66a7a3b727c99f0751341942576f98c0b1","label":"OCR-Programm"},{"path":"assets/bf0f3cc571d924da/deu.traineddata","bytes":1525436,"sha256":"19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d","label":"OCR-Sprachdaten Deutsch"},{"path":"assets/bf0f3cc571d924da/eng.traineddata","bytes":4113088,"sha256":"7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2","label":"OCR-Sprachdaten Englisch"},{"path":"assets/bf0f3cc571d924da/offline-client.js","bytes":6447,"sha256":"f259554d82a6266c67781b3c15620e5e04e5c80c5698945ed8f1f97e0edbeff1","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/icon.svg","bytes":696,"sha256":"ab4801f08a1d4cc961e4411f217f33e5b2ad957add62aedef08e71e8ca1ab549","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/icon-192.png","bytes":17442,"sha256":"560f4775aa042a7bba075897d8d3f59f50e3e76410430f2063d6f3e87e4573bd","label":"App-Dateien"},{"path":"assets/bf0f3cc571d924da/icon-512.png","bytes":81178,"sha256":"35a3b3d0fa0d6aa3ef309b3135f8bcdfcdcacae96ed436a25d9eb224858cef10","label":"App-Dateien"},{"path":"manifest.webmanifest","bytes":620,"sha256":"52ce2e21f894333ca0904141d888566d48cd41f74eec40c4197764c46b9a4951","label":"Installationsdaten"},{"path":"index.html","bytes":45347,"sha256":"2f9d8baf74b5c8ce30f98e14816ec79cdd1a2c3dbfcc4c4996f9ff73c09174d3","label":"App-Oberfläche"}];
const ROOT = new URL('./', self.location.href);
const PREFIX = 's2d-offline-' + encodeURIComponent(ROOT.pathname) + '-';
const CACHE = PREFIX + BUILD;
const READY = new URL('.s2d-offline-ready-' + BUILD, ROOT).href;
const INDEX = new URL('index.html', ROOT).href;
const ASSETS = new Map(FILES.map(file => [new URL(file.path, ROOT).href, file]));

async function notify(message) {
  const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  for (const client of clients) {
    if (client.url.startsWith(ROOT.href)) client.postMessage({type:'S2D_OFFLINE_PROGRESS', build:BUILD, ...message});
  }
}

async function offlineStatus() {
  const cache = await caches.open(CACHE);
  if (!await cache.match(READY)) return {ready:false, build:BUILD};
  for (const url of ASSETS.keys()) if (!await cache.match(url)) return {ready:false, build:BUILD};
  return {ready:true, build:BUILD};
}

async function installCopy() {
  if ((await offlineStatus()).ready) return;
  const cache = await caches.open(CACHE);
  let completed = 0;
  const total = FILES.reduce((sum, file) => sum + file.bytes, 0);
  try {
    for (const [url, file] of ASSETS) {
      await notify({completed, total, file:file.label});
      const response = await fetch(url, {
        cache:'reload', credentials:'omit', redirect:'error', signal:AbortSignal.timeout(90000)
      });
      if (!response.ok || response.redirected) throw new Error('Offline-Datei nicht verfügbar: ' + file.path);
      const finalURL = new URL(response.url || url);
      if (finalURL.origin !== ROOT.origin || !finalURL.pathname.startsWith(ROOT.pathname)) {
        throw new Error('Unerwarteter Speicherort der App-Datei.');
      }
      const data = await response.clone().arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (data.byteLength !== file.bytes || hash !== file.sha256) {
        throw new Error('App-Datei unvollständig oder inzwischen geändert. Bitte erneut vorbereiten.');
      }
      await cache.put(url, response);
      completed += file.bytes;
    }
    await cache.put(READY, new Response(JSON.stringify({build:BUILD}), {
      headers:{'Content-Type':'application/json'}
    }));
    await notify({completed:total, total, ready:true});
  } catch (error) {
    await caches.delete(CACHE);
    await notify({error:error.message});
    throw error;
  }
}

self.addEventListener('install', event => {
  // Deliberately no skipWaiting: an update must not replace a running editor.
  event.waitUntil(installCopy());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Activation normally waits until old app windows are closed. Retain one prior copy.
    const old = (await caches.keys()).filter(name => name.startsWith(PREFIX) && name !== CACHE);
    for (const name of old.slice(0, -1)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== ROOT.origin) return;
  const navigation = request.mode === 'navigate' &&
    (url.pathname === ROOT.pathname || url.pathname === new URL('index.html', ROOT).pathname);
  const key = navigation ? INDEX : url.origin + url.pathname;
  if (!navigation && !ASSETS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached) return cached;
    // Unknown resources and private data are never opportunistically cached.
    try { return await fetch(request); }
    catch { return new Response('Offline-Kopie unvollständig. Bitte die App einmal online vorbereiten.', {
      status:503, headers:{'Content-Type':'text/plain;charset=utf-8'}
    }); }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'S2D_OFFLINE_STATUS') return;
  const source = event.source?.url && new URL(event.source.url);
  if (!source || source.origin !== ROOT.origin ||
      ![ROOT.pathname, new URL('index.html', ROOT).pathname].includes(source.pathname)) return;
  event.waitUntil(offlineStatus().then(result => event.ports?.[0]?.postMessage(result)));
});
