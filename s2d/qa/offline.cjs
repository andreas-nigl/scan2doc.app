/* Executes the shipped service worker with real responses, SHA-256 and file bytes.
 * CacheStorage, lifecycle events and network failure are simulated; no real browser.
 */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const build = JSON.parse(fs.readFileSync('s2d/WEB_BUILD.json'));
const source = fs.readFileSync('web/offline-worker.js','utf8');
const base = 'https://test.invalid/s2d.app/';
const tests = [];

class MemoryCache {
  constructor() { this.responses = new Map(); }
  async match(key) { return this.responses.get(String(key))?.clone(); }
  async put(key, response) { this.responses.set(String(key),response.clone()); }
}

function harness(options = {}) {
  const handlers = new Map();
  const caches = new Map();
  const progress = [];
  let network = true;
  let fetches = 0;
  let claimed = 0;
  let skipped = 0;
  const cacheStorage = {
    async open(name) { if (!caches.has(name)) caches.set(name,new MemoryCache()); return caches.get(name); },
    async keys() { return [...caches.keys()]; },
    async delete(name) { return caches.delete(name); }
  };
  const context = {
    URL, Response, Request, Map, Array, Uint8Array, JSON, Error, AbortSignal, crypto:webcrypto,
    caches:cacheStorage,
    fetch:async request => {
      fetches++;
      if (!network) throw new Error('Network offline');
      const url = new URL(typeof request === 'string' ? request : request.url);
      assert.equal(url.origin,new URL(base).origin);
      assert.ok(url.pathname.startsWith('/s2d.app/'));
      const path = decodeURIComponent(url.pathname.slice('/s2d.app/'.length));
      if (options.missing && path === options.missing) return new Response('not found',{status:404});
      let bytes = fs.readFileSync('web/'+path);
      if (options.corrupt && path === options.corrupt) bytes = Buffer.from('incomplete file');
      return new Response(bytes,{headers:{'Content-Type':path.endsWith('.js')?'text/javascript':'application/octet-stream'}});
    },
    self:{
      location:{href:base+'offline-worker.js'},
      addEventListener:(name,callback) => handlers.set(name,callback),
      skipWaiting:async () => { skipped++; },
      clients:{
        claim:async () => { claimed++; },
        matchAll:async () => [{url:base,postMessage:message=>progress.push(message)},
          {url:'https://test.invalid/other.app/',postMessage:()=>{throw Error('Leaked app progress to another project');}}]
      }
    }
  };
  vm.createContext(context); vm.runInContext(source,context);
  async function lifecycle(name) {
    let task;
    handlers.get(name)({waitUntil:promise=>{task=promise;}});
    await task;
  }
  async function request(path,navigate = false,method = 'GET') {
    let result = null;
    handlers.get('fetch')({request:{url:new URL(path,base).href,mode:navigate?'navigate':'cors',method},
      respondWith:promise=>{result=promise;}});
    return result === null ? null : await result;
  }
  async function status(url = base) {
    let result = null,task;
    handlers.get('message')({data:{type:'S2D_OFFLINE_STATUS'},source:{url},
      ports:[{postMessage:value=>{result=value;}}],waitUntil:promise=>{task=promise;}});
    await task; return result;
  }
  return {lifecycle,request,status,caches,cacheStorage,progress,
    offline:()=>{network=false;},fetchCount:()=>fetches,claimed:()=>claimed,skipped:()=>skipped};
}

async function test(name,action) { await action(); tests.push(name); console.log('PASS',name); }

async function main() {
  const app = harness();
  await test('Offline bereit erst nach vollständiger, SHA-256-geprüfter Installation',async()=>{
    assert.equal((await app.status()).ready,false);
    await app.lifecycle('install');
    assert.equal((await app.status()).ready,true);
    assert.equal(app.fetchCount(),build.files.length);
    assert.equal(app.progress.at(-1).completed,build.bytes);
    assert.equal(app.skipped(),0);
    await app.lifecycle('activate'); assert.equal(app.claimed(),1);
  });
  await test('Navigation und sämtliche 17 App-Ressourcen ohne Netzwerk verfügbar',async()=>{
    app.offline(); const count=app.fetchCount();
    for (const path of ['./','index.html?test=offline']) {
      const response=await app.request(path,true);assert.equal(response.status,200);
      assert.match(await response.text(),/S2D/);
    }
    for (const file of build.files) {
      const response=await app.request(file.path);
      assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,file.bytes);
    }
    assert.equal(app.fetchCount(),count,'Offline resources must not require network');
  });
  await test('Dokumente, APIs, fremde Projekte und POST werden nicht gecacht',async()=>{
    for (const path of ['api/documents','scans/private.pdf','../other.app/index.html','https://other.invalid/track']) {
      assert.equal(await app.request(path),null);
    }
    assert.equal(await app.request('index.html',false,'POST'),null);
    assert.equal(await app.status('https://test.invalid/other.app/'),null);
  });
  await test('Fehlende Datei verhindert Offline-Freigabe und räumt Teilkopie auf',async()=>{
    const failed=harness({missing:build.assetDirectory+'deu.traineddata'});
    await assert.rejects(failed.lifecycle('install'),/Offline-Datei nicht verfügbar/);
    assert.equal(failed.caches.size,0);
    assert.equal((await failed.status()).ready,false);
    assert.ok(failed.progress.at(-1).error);
  });
  await test('Abweichende Bytes verhindern gemischten oder beschädigten App-Stand',async()=>{
    const failed=harness({corrupt:'index.html'});
    await assert.rejects(failed.lifecycle('install'),/unvollständig/);
    assert.equal(failed.caches.size,0);
  });
  await test('Aktivierung erhält vorige Version und löscht keine fremden App-Caches',async()=>{
    const update=harness();const prefix='s2d-offline-'+encodeURIComponent('/s2d.app/')+'-';
    await update.cacheStorage.open('ofp2flyer-offline-v1-test');
    await update.cacheStorage.open('s2d-offline-other-scope-v1');
    await update.cacheStorage.open(prefix+'older');
    await update.cacheStorage.open(prefix+'previous');
    await update.lifecycle('install');await update.lifecycle('activate');
    const names=await update.cacheStorage.keys();
    assert.ok(names.includes(prefix+'previous'));assert.ok(!names.includes(prefix+'older'));
    assert.ok(names.includes('ofp2flyer-offline-v1-test'));assert.ok(names.includes('s2d-offline-other-scope-v1'));
    assert.equal(update.skipped(),0,'Running editors must not be forcibly replaced');
  });
  await test('Manifest, Worker-Importe und externe HTML-Skripte liegen im Offlinepaket',async()=>{
    const manifest=JSON.parse(fs.readFileSync('web/manifest.webmanifest'));
    const html=fs.readFileSync('web/index.html','utf8');
    assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
    const files=new Set(build.files.map(file=>file.path));
    for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) assert.ok(files.has(match[1]));
    for (const icon of manifest.icons) assert.ok(files.has(icon.src));
    const worker=fs.readFileSync('web/'+build.assetDirectory+'image-worker.js','utf8');
    assert.ok(worker.startsWith("importScripts('./opencv.js','./vision.js');"));
    assert.ok(files.has(build.assetDirectory+'opencv.js'));assert.ok(files.has(build.assetDirectory+'vision.js'));
    assert.ok(files.has(build.assetDirectory+'deu.traineddata'));assert.ok(files.has(build.assetDirectory+'eng.traineddata'));
    assert.ok(!html.includes('embedded-assets'),'Online UI must not parse embedded large OCR assets');
  });
  fs.writeFileSync('s2d/qa/offline-results.json',JSON.stringify({ok:true,build:build.build,tests,
    limitations:'CacheStorage, browser lifecycle and network simulated. Shipped bytes and real SHA-256 used. Real browser/Android airplane-mode test remains open.'},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
