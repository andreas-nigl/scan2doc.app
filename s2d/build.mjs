import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let html = read('template.html');
for (const name of ['assets.json', 'pdf-lib.js', 'tesseract.js', 'opencv.js', 'vision.js', 'metadata.js', 'app.js', 'image-worker.js', 'extras.js']) {
  const content = read(name);
  if (name.endsWith('.js')) new vm.Script(content, {filename: name});
  html = html.replace('__' + name.toUpperCase().replaceAll('.', '_') + '__', () => content.replace(/<\/script/gi, '<\\/script'));
}
const now = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Berlin',year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p => [p.type,p.value]));
const name = `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}_s2d.html`;
fs.mkdirSync('dist', {recursive:true}); fs.writeFileSync('dist/'+name, html);
fs.writeFileSync('s2d/BUILD.json', JSON.stringify({name, builtAt: now.toISOString(), bytes:Buffer.byteLength(html),sha256:crypto.createHash('sha256').update(html).digest('hex')},null,2));
console.log(name);
