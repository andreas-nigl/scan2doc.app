'use strict';

// Replaced by the build. No document data, credentials or export files enter this cache.
const BUILD = __BUILD__;
const FILES = __FILES__;
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
