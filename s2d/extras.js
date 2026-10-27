/* Interaction and scheduling helpers for the restored S2D data contract. */
'use strict';
const imagePending = new Map();
let imageWorkerInstance = null, imageSequence = 0, imageWorkerURL = null;
function releaseImageWorkerURL() {
  if (imageWorkerURL) { URL.revokeObjectURL(imageWorkerURL); imageWorkerURL = null; }
}
function imageWorker() {
  if (imageWorkerInstance) return imageWorkerInstance;
  let sourceURL;
  if (globalThis.S2D_ASSET_BASE) sourceURL = new URL('image-worker.js', globalThis.S2D_ASSET_BASE).href;
  else {
    const parts = ['opencv-source','vision-source','image-worker-source'].flatMap(id => [document.getElementById(id).textContent, '\n']);
    imageWorkerURL = URL.createObjectURL(new Blob(parts, {type:'text/javascript'}));
    sourceURL = imageWorkerURL;
  }
  let worker;
  try { worker = new Worker(sourceURL); }
  catch (error) { releaseImageWorkerURL(); throw error; }
  worker.onmessage = event => {
    releaseImageWorkerURL();
    const waiting = imagePending.get(event.data.id); if (!waiting) return;
    imagePending.delete(event.data.id); clearTimeout(waiting.timer);
    if (event.data.error) waiting.reject(new Error(event.data.error)); else waiting.resolve(event.data.result);
  };
  worker.onerror = event => { resetImageWorker(new Error(event.message || 'Bildverarbeitung konnte nicht gestartet werden.')); };
  imageWorkerInstance = worker; return worker;
}
function resetImageWorker(error) {
  releaseImageWorkerURL(); engineReady = null;
  imageWorkerInstance?.terminate(); imageWorkerInstance = null;
  for (const entry of imagePending.values()) { clearTimeout(entry.timer); entry.reject(error); }
  imagePending.clear();
}
function visionTask(job) {
  return new Promise((resolve, reject) => {
    const id = ++imageSequence;
    try {
      const worker = imageWorker();
      const timer = setTimeout(() => resetImageWorker(new Error('Bildverarbeitung dauert zu lange. Bitte erneut versuchen.')), 90000);
      imagePending.set(id, {resolve, reject, timer}); worker.postMessage({id, ...job});
    } catch (error) { imagePending.delete(id); reject(error); }
  });
}
function activity() {
  const text = state.busy ? (state.busyText || 'Bild wird verarbeitet …') : state.processing ? 'Vorschau / Bild wird verbessert …' : state.ocrRunning ? (state.ocrMessage || 'Texterkennung startet …') : '';
  $('#activity').hidden = !text; $('#activityText').textContent = text;
}
function copyDocument(doc) {
  return {...doc, meta: {...doc.meta}, edited: {...doc.edited}, pages: doc.pages.map(page => ({...page, corners: page.corners.map(p => ({...p}))}))};
}
function invalidateOcr(page) {
  page.ocrState = 'dirty'; page.ocrError = '';
  state.ocrTasks = (state.ocrTasks || []).filter(job => job.pageId !== page.id);
}
function ocrLanguage() { return state.rules.settings?.ocrEnglish ? 'deu+eng' : 'deu'; }
function ocrFresh(page) { return page.ocrState === 'done' && page.ocrRevision === page.revision && (page.ocrLanguage || 'deu') === ocrLanguage(); }
function queueOcr(page, force = false) {
  if (!page || !state.current || (!force && ocrFresh(page))) return;
  state.ocrTasks ||= [];
  if (state.ocrActive?.pageId === page.id && state.ocrActive.revision === page.revision && state.ocrActive.language === ocrLanguage()) return;
  if (state.ocrTasks.some(job => job.pageId === page.id && job.revision === page.revision && job.language === ocrLanguage())) return;
  page.ocrState = 'queued';
  state.ocrTasks.push({docId:state.current.id, pageId:page.id, revision:page.revision, language:ocrLanguage()});
  void runOcrQueue();
}
function ocrSummary() {
  const pages = state.current?.pages || [], done = pages.filter(ocrFresh).length;
  $('#ocrStatus').textContent = state.ocrRunning ? state.ocrMessage || 'Texterkennung läuft …' : pages.some(p => p.ocrState === 'error') ? 'OCR fehlgeschlagen · unter Dateiname erneut starten oder Angaben ergänzen.' : done === pages.length && pages.length ? `Texterkennung abgeschlossen · ${done} Seite(n)` : 'Texterkennung startet beim Seitenwechsel oder mit „Weiter“.';
  activity();
}
let desiredEdit = null, editingLoop = null, editTimer = null, editSequence = 0;
function chooseEnhancement(final = false) {
  if (state.busy || !currentPage()) return;
  const page = currentPage();
  // Capture input BEFORE any render. This fixes the original reset-before-read bug.
  const mode = $('#filterMode').value, strength = Number($('#enhanceStrength').value) / 100;
  if (page.retouched && !confirm('Darstellung neu berechnen und Retuschen dieser Seite zurücksetzen?')) { renderPages(); return; }
  page.retouched = false; page.mode = mode; page.strength = strength;
  state.editUncommitted = true; state.editFailed = false;
  $('#strengthValue').textContent = `${Math.round(strength * 100)} %`;
  $('#enhanceStrength').disabled = mode === 'original';
  desiredEdit = {page, mode, strength, final, sequence:++editSequence};
  state.processing = true; activity();
  clearTimeout(editTimer); editTimer = setTimeout(() => void processEdits(), final ? 0 : 100);
}
async function processEdits() {
  if (editingLoop) return editingLoop;
  editingLoop = (async () => {
    while (desiredEdit) {
      const job = desiredEdit; desiredEdit = null;
      try {
        const result = await visionTask({kind: job.final ? 'enhance' : 'preview', original: job.page.original, mode: job.mode, strength: job.strength});
        if (job.sequence !== editSequence) continue;
        if (currentPage()?.id === job.page.id && state.step === 'review') $('#largePreview').src = result.processed;
        if (job.final) {
          Object.assign(job.page, result); job.page.revision++; invalidateOcr(job.page);
          state.editUncommitted = false; await persist(); renderPages();
        } else state.editUncommitted = true;
      } catch (error) { state.editFailed = true; fail(error); }
    }
  })();
  try { await editingLoop; } finally { editingLoop = null; state.processing = false; activity(); void runOcrQueue(); }
}
async function flushEdits() {
  clearTimeout(editTimer);
  if (desiredEdit) desiredEdit.final = true;
  if (state.editUncommitted && !desiredEdit) {
    const page = currentPage(); if (page) desiredEdit = {page, mode:page.mode, strength:page.strength, final:true, sequence:++editSequence};
  }
  if (desiredEdit || editingLoop) await processEdits();
  // A preview may have completed while navigation was waiting.
  if (state.editFailed) { state.editFailed = false; throw new Error('Bildänderung konnte nicht übernommen werden. Bitte die Darstellung erneut wählen.'); }
  if (state.editUncommitted) return flushEdits();
}
function openViewer() {
  const page = currentPage(); if (!page) return;
  state.viewer = {scroll:window.scrollY, scale:1, x:0, y:0, pointers:new Map()};
  $('#viewerImage').src = page.processed; $('#viewerTitle').textContent = `Seite ${state.current.pages.indexOf(page)+1}`;
  $('#viewer').showModal(); viewerTransform();
}
function closeViewer() {
  if (!$('#viewer').open) return;
  $('#viewer').close(); window.scrollTo({top:state.viewer?.scroll || 0, behavior:'instant'}); state.viewer = null;
}
function viewerTransform() { const v = state.viewer; $('#viewerImage').style.transform = `translate(${v.x}px,${v.y}px) scale(${v.scale})`; }
function setupViewer() {
  $('#viewer').addEventListener('cancel', event => {event.preventDefault(); closeViewer();});
  $('#viewerStage').addEventListener('wheel', event => {event.preventDefault(); const v=state.viewer; v.scale=clamp(v.scale * (event.deltaY<0?1.15:1/1.15),1,8); if(v.scale===1)v.x=v.y=0; viewerTransform();},{passive:false});
  $('#viewerStage').addEventListener('dblclick', () => {const v=state.viewer; v.scale=v.scale===1?2:1;v.x=v.y=0;viewerTransform();});
  $('#viewerStage').addEventListener('pointerdown',event=>{
    const v=state.viewer; if(!v)return; event.currentTarget.setPointerCapture(event.pointerId);v.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(v.pointers.size===2){const p=[...v.pointers.values()];v.pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),scale:v.scale,cx:(p[0].x+p[1].x)/2,cy:(p[0].y+p[1].y)/2,x:v.x,y:v.y};}
  });
  $('#viewerStage').addEventListener('pointermove',event=>{
    const v=state.viewer,old=v?.pointers.get(event.pointerId);if(!old)return;v.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(v.pointers.size===2&&v.pinch){const p=[...v.pointers.values()];v.scale=clamp(v.pinch.scale*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/Math.max(1,v.pinch.distance),1,8);v.x=v.pinch.x+(p[0].x+p[1].x)/2-v.pinch.cx;v.y=v.pinch.y+(p[0].y+p[1].y)/2-v.pinch.cy;}
    else if(v.scale>1){v.x+=event.clientX-old.x;v.y+=event.clientY-old.y;}viewerTransform();
  });
  for(const type of ['pointerup','pointercancel']) $('#viewerStage').addEventListener(type,event=>{state.viewer?.pointers.delete(event.pointerId);if(state.viewer)state.viewer.pinch=null;});
}
function insetPoints(points, inset) {
  const center=points.reduce((a,p)=>({x:a.x+p.x/4,y:a.y+p.y/4}),{x:0,y:0});
  return points.map(p=>({x:p.x+(center.x-p.x)*inset*2,y:p.y+(center.y-p.y)*inset*2}));
}
function edgeDistance(p,a,b) { const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy); }
function parallelEdge(points,index,delta) {
  const output=points.map(p=>({...p})),a=points[index],b=points[(index+1)%4],length=Math.hypot(b.x-a.x,b.y-a.y);
  const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length,d=delta.x*nx+delta.y*ny;
  output[index]={x:a.x+d*nx,y:a.y+d*ny};output[(index+1)%4]={x:b.x+d*nx,y:b.y+d*ny};return output;
}
function drawLoupe(point, event) {
  const loupe=$('#cropLoupe'),ctx=loupe.getContext('2d'),source=state.crop.source,rect=$('#cropCanvas').getBoundingClientRect();
  loupe.hidden=false;
  const span=130 * source.width / rect.width / 3;
  ctx.fillStyle='#182b3b';ctx.fillRect(0,0,180,180);ctx.drawImage(source,point.x-span/2,point.y-span/2,span,span,0,0,180,180);
  const points=state.crop.points;ctx.strokeStyle='#49e2c0';ctx.lineWidth=2;ctx.beginPath();
  points.forEach((p,i)=>{const x=90+(p.x-point.x)*180/span,y=90+(p.y-point.y)*180/span;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();
  ctx.strokeStyle='#ffdc65';ctx.beginPath();ctx.moveTo(75,90);ctx.lineTo(105,90);ctx.moveTo(90,75);ctx.lineTo(90,105);ctx.stroke();
  const left=event.clientX<innerWidth/2?innerWidth-152:12;loupe.style.left=`${left}px`;loupe.style.top=`${Math.max(72,Math.min(innerHeight-152,event.clientY-180))}px`;
}
function setupCrop() {
  $('#cropInset').addEventListener('change',drawCrop);
  $('#cropCanvas').addEventListener('pointerdown',event=>{
    if(!state.crop)return;const c=$('#cropCanvas'),p=pointOn(c,event),points=state.crop.points,limit=28*c.width/c.getBoundingClientRect().width;
    const corners=points.map((q,i)=>({i,d:Math.hypot(q.x-p.x,q.y-p.y)})).sort((a,b)=>a.d-b.d);
    const edges=points.map((q,i)=>({i,d:edgeDistance(p,q,points[(i+1)%4])})).sort((a,b)=>a.d-b.d);
    let kind,index;if(corners[0].d<=limit){kind='corner';index=corners[0].i;}else if(edges[0].d<=limit){kind='edge';index=edges[0].i;}else return;
    state.crop.drag={kind,index,start:p,points:points.map(q=>({...q})),pointer:event.pointerId};c.setPointerCapture(event.pointerId);drawLoupe(kind==='corner'?points[index]:p,event);
  });
  $('#cropCanvas').addEventListener('pointermove',event=>{
    const edit=state.crop,drag=edit?.drag;if(!drag||drag.pointer!==event.pointerId)return;
    const p=pointOn($('#cropCanvas'),event),delta={x:p.x-drag.start.x,y:p.y-drag.start.y};let next;
    if(drag.kind==='corner'){next=drag.points.map(q=>({...q}));next[drag.index]={x:drag.points[drag.index].x+delta.x,y:drag.points[drag.index].y+delta.y};}
    else next=parallelEdge(drag.points,drag.index,delta);
    if(S2DVision.validQuad(next,edit.source.width,edit.source.height))edit.points=next;
    drawCrop();drawLoupe(drag.kind==='corner'?edit.points[drag.index]:p,event);
  });
  for(const type of ['pointerup','pointercancel'])$('#cropCanvas').addEventListener(type,()=>{if(state.crop)state.crop.drag=null;$('#cropLoupe').hidden=true;});
}
function setupOrdering() {
  let drag=null,suppressUntil=0;
  $('#pageStrip').addEventListener('contextmenu',e=>e.preventDefault());
  $('#pageStrip').addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();}},true);
  $('#pageStrip').addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-page]');if(!button||state.busy)return;
    drag={id:button.dataset.page,pointer:event.pointerId,x:event.clientX,y:event.clientY,target:null,active:false,button};
    drag.timer=setTimeout(()=>{if(!drag)return;drag.active=true;suppressUntil=Date.now()+1500;button.setPointerCapture(event.pointerId);button.closest('.thumb').classList.add('dragging');navigator.vibrate?.(20);},event.pointerType==='mouse'?140:350);
  });
  $('#pageStrip').addEventListener('pointermove',event=>{
    if(!drag)return;
    if(!drag.active){
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(drag.scrolling||Math.abs(dx)>9){clearTimeout(drag.timer);drag.scrolling=true;suppressUntil=Date.now()+600;$('#pageStrip').scrollLeft-=dx;drag.x=event.clientX;if(event.cancelable)event.preventDefault();}
      else if(Math.abs(dy)>9){clearTimeout(drag.timer);drag=null;}
      return;
    }
    event.preventDefault();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.thumb');if(target)drag.target=target.dataset.id;
    const rect=$('#pageStrip').getBoundingClientRect();if(event.clientX<rect.left+25)$('#pageStrip').scrollLeft-=12;if(event.clientX>rect.right-25)$('#pageStrip').scrollLeft+=12;
  });
  for(const type of ['pointerup','pointercancel'])$('#pageStrip').addEventListener(type,()=>{
    if(!drag)return;clearTimeout(drag.timer);
    if(drag.active){suppressUntil=Date.now()+600;const pages=state.current.pages,from=pages.findIndex(p=>p.id===drag.id),to=pages.findIndex(p=>p.id===drag.target);if(type==='pointerup'&&to>=0&&from!==to){pages.splice(to,0,pages.splice(from,1)[0]);void persist();}renderPages();}drag=null;
  });
  $('#pageStrip').addEventListener('keydown',event=>{
    const button=event.target.closest('[data-page]');if(!button||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const pages=state.current.pages,from=pages.findIndex(p=>p.id===button.dataset.page),to=clamp(from+(event.key==='ArrowLeft'?-1:1),0,pages.length-1);pages.splice(to,0,pages.splice(from,1)[0]);void persist();renderPages();$(`[data-page="${button.dataset.page}"]`)?.focus();
  });
}
function askSave() {
  if(!state.folder || !state.current.meta.sender) return exportFiles(false);
  const sender=state.current.meta.sender,old=state.rules.rules[S2DMeta.senderKey(sender)];
  $('#saveChoiceText').textContent=`Diesen Ordner künftig für „${sender}“ verwenden? Gewählt: ${state.folder.name}.${old?` Bisherige Zuordnung: ${old.folder}.`:''}`;
  $('#saveChoice').showModal();
}
setupViewer();setupCrop();setupOrdering();

startApplication();
