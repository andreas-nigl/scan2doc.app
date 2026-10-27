import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = path.resolve('web');
const read = name => fs.readFileSync(path.join(sourceRoot, name));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const template = read('template.html').toString();
const embedded = JSON.parse(read('assets.json'));
const icon = decodeURIComponent(template.match(/rel="icon" href="data:image\/svg\+xml,([^"]+)"/)[1]);
const payloads = new Map();
for (const name of ['app.js','extras.js','metadata.js','vision.js','pdf-lib.js','tesseract.js','opencv.js']) {
  payloads.set(name, read(name));
}
payloads.set('image-worker.js', Buffer.from("importScripts('./opencv.js','./vision.js');\n" + read('image-worker.js')));
payloads.set('ocr-worker.js', Buffer.from(embedded.ocrWorker, 'base64'));
payloads.set('deu.traineddata', Buffer.from(embedded.deu, 'base64'));
payloads.set('eng.traineddata', Buffer.from(embedded.eng, 'base64'));
payloads.set('offline-client.js', read('pwa/offline-client.js'));
payloads.set('icon.svg', Buffer.from(icon));
for (const size of [192,512]) payloads.set(`icon-${size}.png`, read(`pwa/icon-${size}.png`));
for (const [name, data] of payloads) if (name.endsWith('.js')) new vm.Script(data.toString(), {filename:name});
const fingerprint = crypto.createHash('sha256').update(template).update(read('pwa/offline-worker.js')).update(read('build-web.mjs'));
for (const [name,data] of payloads) fingerprint.update(name).update(data);
const build = fingerprint.digest('hex').slice(0,16);
const assetDirectory = `assets/${build}/`;
const files = [];

function write(name, data, label = name) {
  const target = path.join(outputRoot, name);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, data);
  files.push({path:name, bytes:Buffer.byteLength(data), sha256:hash(data), label});
}
for (const [name,data] of payloads) {
  const label = name === 'opencv.js' ? 'Bildverarbeitung' : name === 'ocr-worker.js' ? 'OCR-Programm' :
    name.endsWith('.traineddata') ? `OCR-Sprachdaten ${name.startsWith('deu') ? 'Deutsch' : 'Englisch'}` : 'App-Dateien';
  write(assetDirectory + name, data, label);
}
const manifest = {
  id:'./', name:'S2D · Scan to Document', short_name:'S2D', lang:'de',
  description:'Dokumente lokal scannen, bearbeiten, erkennen und als PDF oder Bilder speichern.',
  start_url:'./', scope:'./', display:'standalone', background_color:'#edf2f7', theme_color:'#205f9d',
  icons:[192,512].map(size => ({src:assetDirectory + `icon-${size}.png`, sizes:`${size}x${size}`, type:'image/png', purpose:'any'}))
};
write('manifest.webmanifest', JSON.stringify(manifest,null,2), 'Installationsdaten');
const offlinePanel = `<details id="offlinePanel" class="card" hidden>
<summary id="offlineState" role="status">Offline-Kopie prüfen …</summary>
<progress id="offlineProgress" max="1" value="0" aria-label="Offline-Vorbereitung" hidden></progress>
<div class="actions"><button id="installApp" class="primary" hidden>App installieren</button><button id="offlineRetry">Offline erneut vorbereiten</button><button id="checkUpdate">Nach Updates suchen</button><button id="offlineUpdate" hidden>Neue Version bereit</button><button id="protectStorage">Lokalen Speicher schützen</button></div>
<p id="offlineDetails" class="hint" role="status">Einmal mit Internet öffnen und auf „Offline bereit“ warten. Alternativ über das Browsermenü installieren.</p>
<p class="hint">Dokumente bleiben auf diesem Gerät. Browserdaten können gelöscht werden; nutze regelmäßig „Dokumente sichern“.</p></details>`;
let html = template.slice(0,template.indexOf('<script id="embedded-assets"'));
html = html.replace(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/, `<link rel="icon" href="${assetDirectory}icon.svg">`);
html = html.replace('</head>', `<meta name="s2d-build" content="${build}"><link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="${assetDirectory}icon-192.png"><script>globalThis.S2D_ASSET_BASE=new URL('${assetDirectory}',location.href).href;</script></head>`);
html = html.replace('<details class="card"><summary>Zuordnungen',offlinePanel + '<details class="card"><summary>Zuordnungen');
html = html.replace('Unverschlüsselte Testversion. Bilder und Texterkennung bleiben auf diesem Gerät. Alle benötigten Bibliotheken sind eingebettet.', 'Bilder und Texterkennung bleiben auf diesem Gerät. Nach vollständiger Offline-Vorbereitung funktioniert die App ohne Internet.');
html = html.replace('Eine neu benannte HTML kann einen getrennten Browser-Speicher erhalten.', 'Beim Wechsel von der lokalen HTML zur Online-App die Sicherung einmal einlesen.');
for (const name of ['pdf-lib.js','tesseract.js','vision.js','metadata.js','app.js','extras.js','offline-client.js']) {
  html += `<script defer src="${assetDirectory + name}"></script>\n`;
}
html += '</body></html>\n';
write('index.html', html, 'App-Oberfläche');
let worker = read('pwa/offline-worker.js').toString();
worker = worker.replace('__BUILD__',JSON.stringify(build)).replace('__FILES__',JSON.stringify(files));
new vm.Script(worker,{filename:'offline-worker.js'});
fs.writeFileSync(path.join(outputRoot,'offline-worker.js'),worker);
fs.writeFileSync(path.join(outputRoot,'.nojekyll'),'');
const report = {
  build, builtAt:new Date().toISOString(), bytes:files.reduce((sum,file)=>sum+file.bytes,0),
  indexBytes:Buffer.byteLength(html), assetDirectory, files,
  deployFiles:[...files.map(file=>file.path),'offline-worker.js','.nojekyll']
};
fs.writeFileSync('s2d/WEB_BUILD.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({build,indexBytes:report.indexBytes,offlineBytes:report.bytes,files:files.length}));
