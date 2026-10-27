/* Integration tests against scripts extracted from the DELIVERED HTML.
 * DOM, IndexedDB and OCR scheduling are simulated. Canvas, OpenCV worker and PDF are real.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {Worker:Thread}=require('node:worker_threads');
const {createCanvas,Image:NativeImage,ImageData}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const root=path.resolve('s2d/qa/extracted');fs.mkdirSync(root,{recursive:true});
const webMode=process.env.S2D_TEST_WEB==='1';
const webBuild=webMode?JSON.parse(fs.readFileSync('s2d/WEB_BUILD.json')):null;
const build=webMode?{name:'web/index.html'}:JSON.parse(fs.readFileSync('s2d/BUILD.json'));
const html=fs.readFileSync(process.env.S2D_TEST_HTML || (webMode?'web/index.html':'dist/'+build.name),'utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m=>({attrs:m[1],source:m[2].replace(/<\\\/script/gi,'</script')}));
if(webMode)for(const script of scripts){const src=script.attrs.match(/src="([^"]+)"/)?.[1];if(src)script.source=fs.readFileSync('web/'+src,'utf8');}
for(const [id,name] of [['opencv-source','opencv'],['vision-source','vision'],['image-worker-source','image-worker']])fs.writeFileSync(root+'/'+name+'.js',webMode?fs.readFileSync('web/'+webBuild.assetDirectory+name+'.js'):scripts.find(s=>s.attrs.includes(`id="${id}"`)).source);
const nodes=new Map(),windowEvents=new Map();let focused=null,ctx;
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.attrs={};this.open=false;this.scrollLeft=0;this.className='';this.classList={toggle:(v,on)=>{},add:()=>{},remove:()=>{}};}
 append(...items){for(const child of items){child.parent=this;this.children.push(child);}}
 replaceChildren(...items){this.children=[];this.append(...items);}
 setAttribute(key,value){this.attrs[key]=value;if(key==='id'){this.id=value;nodes.set(value,this);}}
 removeAttribute(key){delete this.attrs[key];}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
 async fire(type,extra={}){const e={target:this,currentTarget:this,pointerId:1,clientX:0,clientY:0,cancelable:true,preventDefault(){},stopPropagation(){},...extra};for(const fn of this.listeners[type]||[])await fn(e);}
 closest(selector){if(selector==='button'&&this.tagName==='BUTTON')return this;if(selector==='.thumb'&&this.className.includes('thumb'))return this;if(selector==='[data-page]'&&this.dataset.page)return this;return this.parent?.closest?.(selector)||null;}
 getBoundingClientRect(){return {left:0,top:0,width:this.width||360,height:this.height||480,right:this.width||360,bottom:this.height||480};}
 setPointerCapture(){} focus(){focused=this;} showModal(){this.open=true;} close(){this.open=false;} click(){this.clicked=true;} remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
}
function canvasElement(){const c=createCanvas(1,1),e=new Element('canvas');for(const key of Object.keys(e))c[key]=e[key];for(const key of Object.getOwnPropertyNames(Element.prototype))if(key!=='constructor')c[key]=Element.prototype[key];return c;}
for(const match of html.matchAll(/<([a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
 const e=match[1]==='canvas'?canvasElement():new Element(match[1]);e.id=match[3];e.hidden=/\bhidden\b/.test(match[2]);e.checked=/\bchecked\b/.test(match[2]);e.value=match[2].match(/\bvalue="([^"]*)"/)?.[1]||'';nodes.set(e.id,e);
}
for(const script of scripts){const id=script.attrs.match(/id="([^"]+)"/)?.[1];if(id)nodes.get(id).textContent=script.source;}
function descendants(e){return [e,...(e.children||[]).flatMap(descendants)];}
const document={activeElement:null,body:new Element('body'),hidden:false,events:{},getElementById:id=>nodes.get(id),
 querySelector(selector){if(selector.startsWith('#'))return nodes.get(selector.slice(1))||null;if(selector.startsWith('[data-page=')){const id=selector.match(/"([^"]+)"/)[1];return descendants(nodes.get('pageStrip')).find(e=>e.dataset?.page===id)||null;}return null;},
 querySelectorAll(){return[];},createElement:tag=>tag==='canvas'?canvasElement():new Element(tag),addEventListener(type,fn){(this.events[type]||=[]).push(fn);},elementFromPoint(){return this.pointTarget;}
};
const dbStores=new Map(['documents','settings','folders'].map(k=>[k,new Map()]));
function request(value){const r={result:value};queueMicrotask(()=>r.onsuccess?.());return r;}
const db={createObjectStore(){},transaction(store){const tx={objectStore:()=>({put(value,key){dbStores.get(store).set(key,structuredClone(value));setTimeout(()=>tx.oncomplete?.(),0);},get:key=>request(dbStores.get(store).get(key)),getAll:()=>request([...dbStores.get(store).values()])})};return tx;}};
const blobs=new Map();let blobCount=0,rejectNextWorker=false;const workers=[];
class AppWorker{
 constructor(url){if(webMode)assert.equal(new URL(url).pathname,'/s2d.app/'+webBuild.assetDirectory+'image-worker.js');else assert.ok(blobs.has(url));if(rejectNextWorker){rejectNextWorker=false;throw new Error('Simulierter Worker-Startfehler');}this.thread=new Thread(path.resolve('s2d/qa/vision-runner.cjs'),{workerData:{root}});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message}));workers.push(this);}
 postMessage(data){this.thread.postMessage(data);}terminate(){this.thread.terminate();}
}
class BrowserImage extends NativeImage{decode(){return this.complete?Promise.resolve():new Promise((resolve,reject)=>{this.onload=resolve;this.onerror=reject;});}}
const ocrCalls=[];let ocrDelay=5;
const TestURL=class extends URL{};
TestURL.createObjectURL=blob=>{const id='blob:'+ ++blobCount;blobs.set(id,blob);return id;};
TestURL.revokeObjectURL=url=>blobs.delete(url);
ctx={console,document,Image:BrowserImage,ImageData,Blob,File,URL:TestURL,location:{href:'https://test.invalid/s2d.app/'},Worker:AppWorker,Uint8Array,Uint8ClampedArray,ArrayBuffer,Date,Math,JSON,Promise,Map,Set,Number,String,Object,Error,Boolean,RegExp,TextEncoder,TextDecoder,WebAssembly,structuredClone,atob,btoa,setTimeout,clearTimeout,queueMicrotask,crypto:require('node:crypto').webcrypto,navigator:{},innerWidth:390,innerHeight:844,scrollY:120,confirm:()=>true,
 indexedDB:{open:()=>request(db)},localStorage:{getItem:()=>null,setItem:()=>{}},history:{replaceState(){},pushState(){}},scrollTo(){},addEventListener:(type,fn)=>windowEvents.set(type,fn),
 Tesseract:{createWorker:async langs=>({recognize:async source=>{ocrCalls.push({source,langs});await new Promise(r=>setTimeout(r,ocrDelay));return{data:{text:'ALLIANZ VERSICHERUNG\nRechnung\nRechnungsdatum 22.09.2026\nGesamtbetrag 785,62 EUR'}};},terminate:async()=>{}})}
};
if(webMode)ctx.fetch=async url=>{const name=new URL(url).pathname.replace('/s2d.app/','');return new Response(fs.readFileSync('web/'+name));};
ctx.Response=Response;
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
const run=code=>vm.runInContext(code,ctx),wait=ms=>new Promise(r=>setTimeout(r,ms));
const tests=[];
async function test(name,fn){await fn();tests.push(name);console.log('PASS',name);}
async function main(){
 for(const script of scripts){
  if(script.attrs.includes('application/json')||script.attrs.includes('text/plain'))continue;
  if(script.source.trim()===fs.readFileSync('s2d/tesseract.js','utf8').trim())continue;
  // Offline-client has a separate service-worker test harness; app DOM is simulated here.
  if(webMode&&script.attrs.includes('offline-client.js'))continue;
  vm.runInContext(script.source,ctx);await wait(0);
 }
 await test('Start mit Microtask-Pausen zwischen HTML-Skripten',async()=>{
  await run('engineReady');await wait(50);
  assert.equal(nodes.get('engineState').textContent,'Bildverarbeitung bereit · OCR lokal');
  assert.equal(blobs.size,0);
 });
 await test('Worker-Startfehler kann ohne Neuladen wiederholt werden',async()=>{
  run("resetImageWorker(new Error('Test-Neustart'))");rejectNextWorker=true;
  await assert.rejects(run('ensureImageEngine()'),/Simulierter Worker-Startfehler/);
  assert.equal(run('engineReady'),null);assert.equal(blobs.size,0);
  await run('ensureImageEngine()');assert.equal(nodes.get('engineState').textContent,'Bildverarbeitung bereit · OCR lokal');
 });
 const source=createCanvas(900,1250),c=source.getContext('2d');c.fillStyle='#bab2a2';c.fillRect(0,0,900,1250);c.fillStyle='#e8e2d5';c.fillRect(45,45,810,1160);c.fillStyle='#af1720';c.font='bold 44px sans-serif';c.fillText('ALLIANZ VERSICHERUNG',70,130);c.fillStyle='#252525';c.font='32px sans-serif';c.fillText('Rechnung',70,220);c.fillText('Rechnungsdatum 22.09.2026',70,290);c.fillText('Gesamtbetrag 785,62 EUR',70,370);c.fillText('Kleiner Text bleibt erhalten',70,500);
 fs.writeFileSync('s2d/qa/input.png',source.toBuffer('image/png'));ctx.fixture=source.toDataURL('image/png');
 await test('Zwei Aufnahmen werden angehängt; keine OCR beim Import',async()=>{await run('newDocument(); addImage(fixture)');await run('addImage(fixture)');assert.equal(run('state.current.pages.length'),2);assert.equal(ocrCalls.length,0);run("setStep('review')");});
 await test('Graustufen und Intensität 35 % bleiben ausgewählt',async()=>{nodes.get('filterMode').value='gray';nodes.get('enhanceStrength').value='35';await nodes.get('filterMode').fire('change');await run('flushEdits()');assert.equal(run('currentPage().mode'),'gray');assert.equal(run('currentPage().strength'),.35);assert.equal(nodes.get('filterMode').value,'gray');assert.equal(nodes.get('enhanceStrength').value,'35');const im=new BrowserImage();im.src=run('currentPage().processed');await im.decode();const out=createCanvas(im.width,im.height),cx=out.getContext('2d');cx.drawImage(im,0,0);const pixels=cx.getImageData(0,0,out.width,out.height).data;assert.ok(pixels.every((v,i)=>i%4>1||v===pixels[i-i%4]));});
 await test('Schnelle Regleränderungen: letzter Wert gewinnt; kein OCR',async()=>{nodes.get('filterMode').value='auto';for(const value of [80,15,60,22]){nodes.get('enhanceStrength').value=String(value);await nodes.get('enhanceStrength').fire('input');await wait(110);}await nodes.get('enhanceStrength').fire('change');await run('flushEdits()');assert.equal(run('currentPage().strength'),.22);assert.equal(nodes.get('enhanceStrength').value,'22');assert.equal(ocrCalls.length,0);assert.equal(nodes.get('activity').hidden,true);});
 await test('Original und Schwarz-Weiß erzeugen verschiedene Bilder',async()=>{nodes.get('filterMode').value='original';await nodes.get('filterMode').fire('change');await run('flushEdits()');const original=run('currentPage().processed');assert.equal(nodes.get('enhanceStrength').disabled,true);nodes.get('filterMode').value='bw';await nodes.get('filterMode').fire('change');await run('flushEdits()');assert.notEqual(run('currentPage().processed'),original);});
 await test('Seitenwechsel startet OCR; Vollansicht und Zurück erhalten Auswahl',async()=>{await run("dispatch({id:'',dataset:{page:state.current.pages[0].id}})");assert.equal(nodes.get('viewer').open,true);await run("dispatch({id:'viewerClose',dataset:{}})");await wait(650);assert.equal(ocrCalls.length,1);assert.equal(run('state.current.pages[1].ocrState'),'done');assert.equal(run('state.selected'),run('state.current.pages[0].id'));});
 await test('Weiter erkennt nur ausstehende Seiten; manuelle Felder geschützt',async()=>{run("state.current.meta.sender='mein_absender';state.current.edited.sender=true;");await run("dispatch({id:'continueMetadata',dataset:{}})");await wait(650);assert.equal(ocrCalls.length,2);assert.equal(run('state.current.meta.sender'),'mein_absender');await run("dispatch({id:'backReview',dataset:{}})");await run("dispatch({id:'continueMetadata',dataset:{}})");await wait(50);assert.equal(ocrCalls.length,2);});
 await test('Sicherheitsbeschnitt zeichnet sofort eine andere Vorschau',async()=>{await run('openCrop()');const before=nodes.get('cropCanvas').toDataURL();nodes.get('cropInset').value='.05';await nodes.get('cropInset').fire('change');assert.notEqual(nodes.get('cropCanvas').toDataURL(),before);await run('applyCrop()');assert.equal(run('currentPage().inset'),.05);assert.equal(ocrCalls.length,2);});
 await test('Kanten bewegen sich nur parallel; Lupe wird ein-/ausgeblendet',async()=>{const points=[{x:50,y:50},{x:850,y:50},{x:850,y:1200},{x:50,y:1200}];ctx.geometry=points;const shifted=run('parallelEdge(geometry,1,{x:-20,y:120})');assert.equal(shifted[1].x,830);assert.equal(shifted[1].y,50);assert.equal(shifted[2].y,1200);await run('openCrop()');run('state.crop.points=geometry.map(p=>({...p}));drawCrop()');await nodes.get('cropCanvas').fire('pointerdown',{clientX:850,clientY:600});assert.equal(nodes.get('cropLoupe').hidden,false);await nodes.get('cropCanvas').fire('pointermove',{clientX:830,clientY:720});assert.equal(run('state.crop.points[1].x'),830);assert.equal(run('state.crop.points[1].y'),50);await nodes.get('cropCanvas').fire('pointerup');assert.equal(nodes.get('cropLoupe').hidden,true);});
 await test('Links- und Rechtsdrehung erhalten Geometrie und starten keine OCR',async()=>{run("setStep('review')");const points=JSON.stringify(run('currentPage().corners'));await run('rotatePage(-1)');await run('rotatePage(1)');assert.equal(JSON.stringify(run('currentPage().corners')),points);assert.equal(ocrCalls.length,2);});
 await test('Speicherabfrage, Abbrechen und Zwei-Seiten-PDF',async()=>{run("state.folder={name:'S2D'};askSave()");assert.equal(nodes.get('saveChoice').open,true);await run("dispatch({id:'saveCancel',dataset:{}})");assert.equal(nodes.get('saveChoice').open,false);run('state.folder=null');await run('exportFiles(false)');const file=run('state.exportReady[0]');const pdf=await run('PDFLib.PDFDocument.load')(new Uint8Array(await file.arrayBuffer()));assert.equal(pdf.getPageCount(),2);});
 await test('Entwurf bleibt mit Einstellungen und Seiten wiederöffnbar',async()=>{const id=run('state.current.id');await run('persist()');assert.equal(dbStores.get('documents').get(id).pages.length,2);ctx.savedId=id;await run('openDocument(savedId)');assert.equal(run('state.current.pages.length'),2);assert.equal(run('currentPage().inset'),.05);});
 await test('Verspätete OCR nach Bildänderung wird verworfen',async()=>{ocrDelay=300;const count=ocrCalls.length;run('queueOcr(currentPage())');await wait(50);run('currentPage().revision++;invalidateOcr(currentPage())');await wait(550);assert.equal(ocrCalls.length,count+1);assert.equal(run('ocrFresh(currentPage())'),false);assert.equal(run('currentPage().ocrState'),'dirty');ocrDelay=5;});
 await test('Gedrückt halten und ziehen sortiert ohne OCR',async()=>{run("setStep('review')");const strip=nodes.get('pageStrip'),first=strip.children[0].children[0],second=strip.children[1];const before=run('state.current.pages[0].id'),count=ocrCalls.length;await strip.fire('pointerdown',{target:first,clientX:30,clientY:30,pointerType:'touch'});await wait(380);document.pointTarget=second;await strip.fire('pointermove',{clientX:180,clientY:30});await strip.fire('pointerup');assert.notEqual(run('state.current.pages[0].id'),before);assert.equal(ocrCalls.length,count);});
 await test('Ordnerregel erst nach erfolgreichem Schreiben; Nur diesmal ändert keine Regel',async()=>{ctx.savedFiles=[];run("state.folderId='test-folder';state.folder={name:'Testordner',requestPermission:async()=> 'granted',getFileHandle:async()=>({createWritable:async()=>({write:async(file)=>savedFiles.push(file),close:async()=>{},abort:async()=>{}})}) }; ");await run('exportFiles(true)');assert.equal(run("state.rules.rules['mein absender'].folder"),'Testordner');run("state.folder.name='Einmalordner'");await run('exportFiles(false)');assert.equal(run("state.rules.rules['mein absender'].folder"),'Testordner');assert.equal(ctx.savedFiles.length,2);});
 const result={ok:true,file:build.name,tests,limitations:'DOM, IndexedDB and OCR scheduling simulated. Actual shipped image worker, Canvas, OpenCV and PDF executed. Real browser / Android UI not tested.'};fs.writeFileSync(webMode?'s2d/qa/web-results.json':'s2d/qa/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const worker of workers)worker.terminate();setTimeout(()=>process.exit(process.exitCode||0),50);});
