'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const embedded = $('#embedded-assets') ? JSON.parse($('#embedded-assets').textContent) : null;
const state = { db: null, docs: [], current: null, selected: null, step: 'home', busy: false, cv: null, stream: null, liveTimer: null, folder: null, folderId: null, ocrWorker: null, ocrPromise: null, ocrRunning: false, persistQueue: Promise.resolve(), dirty: false, rules: { version: 1, rules: {}, settings: {} }, editor: null, crop: null };

function toast(text) {
  $('#toast').textContent = text; $('#toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}
function fail(error) { console.error(error); toast(error?.message || String(error)); }
function storageState(text, error = false) { $('#storageState').textContent = text; $('#storageState').classList.toggle('error', error); }
function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function database() {
  const request = indexedDB.open('s2d-documents-v2', 1);
  request.onupgradeneeded = () => { for (const name of ['documents', 'settings', 'folders']) request.result.createObjectStore(name); };
  return requestResult(request);
}
function dbWrite(store, value, key) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('Speichern abgebrochen'));
  });
}
async function dbRead(store, key) { return requestResult(state.db.transaction(store).objectStore(store).get(key)); }
const saveBatches = new Map();
function persist() {
  if (!state.current) return Promise.resolve();
  state.current.updatedAt = new Date().toISOString();
  const snapshot = copyDocument(state.current);
  const index = state.docs.findIndex(doc => doc.id === snapshot.id);
  if (index < 0) state.docs.push(snapshot); else state.docs[index] = snapshot;
  const pending=saveBatches.get(snapshot.id);
  if(pending){pending.snapshot=snapshot;return pending.promise;}
  const batch={snapshot,promise:null};
  state.pendingSaves = (state.pendingSaves || 0) + 1;
  state.dirty = true; storageState('Entwurf wird gesichert …');
  batch.promise = state.persistQueue.catch(() => {}).then(async () => {
    await pause(120); saveBatches.delete(snapshot.id);
    if (!state.db) throw new Error('Lokaler Speicher nicht verfügbar. Bitte „Dokumente sichern“ verwenden.');
    await dbWrite('documents', batch.snapshot, snapshot.id);
    state.saveError = false;
  }).catch(error => { state.saveError = true; storageState(`Nicht gesichert: ${error.message}. Bitte eine Sicherung herunterladen.`, true); })
    .finally(() => { state.pendingSaves--; state.dirty = state.pendingSaves > 0 || state.saveError; if (!state.dirty) storageState('Entwurf auf diesem Gerät gesichert'); });
  saveBatches.set(snapshot.id,batch);state.persistQueue=batch.promise;return batch.promise;
}
async function saveRules() {
  if (state.db) await dbWrite('settings', state.rules, 'rules');
  try { localStorage.setItem('s2d-standalone-data-v1', JSON.stringify(state.rules)); } catch { /* IndexedDB remains authoritative. */ }
}
function title(doc) { return doc.meta.customName || S2DMeta.filename(doc.meta, doc.takenDate); }
function currentPage() { return state.current?.pages.find(page => page.id === state.selected) || state.current?.pages[0]; }
function setStep(step) {
  if (step !== 'capture') stopCamera();
  state.step = step;
  $('#homeView').hidden = step !== 'home';
  $('#workspace').hidden = ['home', 'crop', 'retouch'].includes(step);
  $('#cropView').hidden = step !== 'crop'; $('#retouchView').hidden = step !== 'retouch';
  for (const name of ['capture', 'review', 'metadata', 'save', 'done']) $(`#${name}Step`).hidden = name !== step;
  $('#captureActions').hidden = !['capture', 'review'].includes(step);
  if (step === 'home') renderDocuments();
  if (step === 'metadata') populateMetadata();
  if (step === 'save') updateExport();
  if (state.current && !['crop', 'retouch', 'home', 'done'].includes(step)) { state.current.lastStep = step; void persist(); }
  renderPages(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function newDocument() {
  stopCamera();
  state.current = { id: uid(), takenDate: S2DMeta.localDate(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pages: [], meta: { date: '', sender: '', type: '', amount: '', customName: '' }, edited: {}, lastStep: 'capture', format: 'pdf' };
  state.selected = null; state.folder = null; state.folderId = null;
  setStep('capture'); void persist();
}
async function openDocument(id) {
  await state.persistQueue;
  const saved = state.docs.find(doc => doc.id === id);
  if (!saved) return;
  state.current = copyDocument(saved); state.selected = state.current.pages[0]?.id || null;
  state.folder = null; state.folderId = null;
  if (state.current.folderId && state.db) {
    state.folder = await dbRead('folders', state.current.folderId); state.folderId = state.current.folderId;
  }
  setStep(state.current.pages.length ? 'review' : 'capture'); ocrSummary();
}
function renderDocuments() {
  const list = $('#documentList'); list.replaceChildren();
  const docs = [...state.docs].filter(doc => doc.pages.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (!docs.length) { list.textContent = 'Noch keine Dokumente aufgenommen.'; return; }
  for (const doc of docs) {
    const row = document.createElement('div'); row.className = 'doc-row';
    const image = new Image(); image.src = doc.pages[0].thumb || doc.pages[0].processed; image.alt = '';
    const button = document.createElement('button'); button.textContent = title(doc); button.dataset.document = doc.id;
    const info = document.createElement('small'); info.textContent = `${doc.pages.length} Seite${doc.pages.length === 1 ? '' : 'n'} · ${new Date(doc.updatedAt).toLocaleString('de-DE')}`;
    button.append(info); row.append(image, button); list.append(row);
  }
}
function renderPages() {
  const strip = $('#pageStrip'); strip.replaceChildren();
  const pages = state.current?.pages || [];
  strip.classList.toggle('large-single', pages.length === 1 && state.step === 'capture');
  pages.forEach((page, index) => {
    const thumb = document.createElement('article'); thumb.className = `thumb${page.id === currentPage()?.id ? ' selected' : ''}`; thumb.dataset.id = page.id;
    const button = document.createElement('button'); button.dataset.page = page.id; button.setAttribute('aria-label', `Seite ${index + 1} auswählen`);
    const image = new Image(); image.src = page.thumb || page.processed; image.alt = `Seite ${index + 1}`;
    const label = document.createElement('span'); label.textContent = `${index + 1}${page.needsCrop ? ' · Kanten prüfen' : ''}`;
    button.title = 'Antippen: Ganzseitenansicht. Gedrückt halten und ziehen: Reihenfolge. Alt + Pfeiltaste: verschieben.';
    button.append(label, image); thumb.append(button); strip.append(thumb);
  });
  $('#pageSummary').textContent = `${pages.length} Seite${pages.length === 1 ? '' : 'n'} · Antippen: Vollansicht · Halten und ziehen: sortieren`;
  $('#finishCapture').disabled = !pages.length || state.busy;
  const page = currentPage();
  if (page) {
    $('#largePreview').src = page.processed; $('#filterMode').value = page.mode;
    $('#enhanceStrength').value = String(Math.round(page.strength * 100));
    $('#strengthValue').textContent = `${Math.round(page.strength * 100)} %`;
    $('#enhanceStrength').disabled = page.mode === 'original';
    $('#cropStatus').textContent = page.needsCrop ? 'Dokumentkanten nicht eindeutig erkannt. Das gesamte Foto ist erhalten; bitte unter „Zuschneiden“ korrigieren.' : 'Perspektive korrigiert. Bei Bedarf die Kanten unter „Zuschneiden“ anpassen.';
  } else $('#largePreview').removeAttribute('src');
  $('#continueMetadata').disabled = !pages.length || state.busy;
  ocrSummary();
}
function canvas(width, height) { const result = document.createElement('canvas'); result.width = width; result.height = height; return result; }
async function imageCanvas(source, maximum = 2600) {
  const image = new Image(); image.src = source; await image.decode();
  const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
  const output = canvas(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)));
  output.getContext('2d').drawImage(image, 0, 0, output.width, output.height); return output;
}
async function thumbnail(url) { return (await imageCanvas(url, 240)).toDataURL('image/jpeg', .8); }
function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
async function transformPage(page, newCrop = false) {
  await ensureImageEngine();
  const result = await visionTask({kind:'enhance', newCrop, source:page.source, original:page.original, corners:page.corners, inset:page.inset, mode:page.mode, strength:page.strength});
  Object.assign(page,result); page.revision = (page.revision || 0) + 1; invalidateOcr(page);
}
async function addImage(source) {
  if (!state.current) newDocument();
  const documentId = state.current.id;
  await ensureImageEngine();
  const input = await imageCanvas(source);
  const normalizedSource = input.toDataURL('image/jpeg', .97);
  input.width = input.height = 1;
  const detection = await visionTask({kind:'detect', source:normalizedSource});
  const page = { id: uid(), source:normalizedSource, corners: detection.points, inset: 0, needsCrop: !detection.detected, mode: 'auto', strength: 1, ocrState: 'preparing', revision: 0 };
  // Persist the unmodified source first, before expensive enhancement/OCR.
  page.original = page.source; page.processed = page.source; page.thumb = await thumbnail(page.source);
  if (state.current.id !== documentId) throw new Error('Dokumentwechsel während der Aufnahme. Bitte Bild erneut hinzufügen.');
  state.current.pages.push(page); state.selected = page.id; await persist(); renderPages();
  try { await transformPage(page, true); } catch (error) { page.needsCrop = true; page.ocrState = 'pending'; fail(error); }
  renderPages(); await persist();
}
async function importImages(event) {
  const files = [...(event.target.files || [])]; event.target.value = '';
  if (!files.length) return;
  if (!state.current) newDocument();
  if (state.step === 'home') setStep('capture');
  await exclusive(async () => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) { toast(`Bildformat nicht unterstützt: ${file.name}`); continue; }
      try { await addImage(await readFile(file)); } catch (error) { fail(error); }
    }
  });
}
async function exclusive(action) {
  if (state.busy) { toast('Die aktuelle Verarbeitung läuft noch.'); return; }
  state.busy = true; activity(); renderPages();
  try { return await action(); } finally { state.busy = false; activity(); renderPages(); void runOcrQueue(); }
}
function stopCamera() {
  state.cameraEpoch = (state.cameraEpoch || 0) + 1;
  clearTimeout(state.liveTimer); state.liveTimer = null;
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null;
  $('#cameraVideo').srcObject = null; $('#livePanel').hidden = true; $('#captureFrame').disabled = true;
}
async function startCamera() {
  if (!state.current) newDocument();
  setStep('capture'); stopCamera();
  const cameraEpoch = state.cameraEpoch;
  if (!navigator.mediaDevices?.getUserMedia) { $('#captureNotice').hidden = false; $('#fileCapture').click(); return; }
  $('#captureNotice').hidden = true; $('#livePanel').hidden = false; $('#liveStatus').textContent = 'Kamera startet …';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
    if (state.step !== 'capture' || cameraEpoch !== state.cameraEpoch) { stream.getTracks().forEach(track => track.stop()); return; }
    state.stream = stream; $('#cameraVideo').srcObject = stream; await $('#cameraVideo').play();
    $('#captureFrame').disabled = false; await ensureImageEngine(); state.livePrevious = null; state.liveStable = 0; state.liveArmed = true; void liveLoop();
  } catch {
    if (cameraEpoch !== state.cameraEpoch) return;
    stopCamera(); $('#captureNotice').hidden = false;
    $('#fileCapture').click(); toast('Live-Kamera nicht verfügbar. Bei Bedarf erneut „Weitere Seite scannen“ wählen.');
  }
}
async function liveLoop() {
  if (!state.stream) return;
  try {
    if (!state.busy) {
      const video = $('#cameraVideo');
      if (video.videoWidth) {
        const sample = canvas(640, Math.round(640 * video.videoHeight / video.videoWidth)); sample.getContext('2d').drawImage(video, 0, 0, sample.width, sample.height);
        const detection = await visionTask({kind:'detect', source:sample.toDataURL('image/jpeg',.85), maximum:640});
        if (!state.stream) return;
        const overlay = $('#liveOverlay'); overlay.width = sample.width; overlay.height = sample.height;
        const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (detection.detected) {
          ctx.strokeStyle = state.liveArmed ? '#44e1b0' : '#f7c56a'; ctx.lineWidth = 3; ctx.beginPath();
          detection.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
          const motion = state.livePrevious ? Math.max(...detection.points.map((p, i) => Math.hypot(p.x - state.livePrevious[i].x, p.y - state.livePrevious[i].y))) : Infinity;
          state.liveStable = motion < 5 ? state.liveStable + 1 : 0;
          state.livePrevious = detection.points;
          $('#liveStatus').textContent = state.liveArmed ? 'Dokument erkannt · ruhig halten' : 'Aufgenommen · Blatt kurz aus dem Bild nehmen, dann nächste Seite';
          if ($('#autoCapture').checked && state.liveArmed && state.liveStable >= 3) { state.liveArmed = false; await captureFrame(); }
        } else {
          state.liveStable = 0; state.livePrevious = null; state.liveArmed = true;
          $('#liveStatus').textContent = 'Ganzes Blatt mit etwas Hintergrund zeigen. Manueller Auslöser ist ebenfalls möglich.';
        }
      }
    }
  } catch (error) { $('#liveStatus').textContent = `Erkennung pausiert: ${error.message}`; }
  if (state.stream) state.liveTimer = setTimeout(liveLoop, 450);
}
async function captureFrame() {
  if (!state.stream || !$('#cameraVideo').videoWidth) return;
  await exclusive(async () => {
    const video = $('#cameraVideo'), output = canvas(video.videoWidth, video.videoHeight);
    output.getContext('2d').drawImage(video, 0, 0); state.liveArmed = false;
    await addImage(output.toDataURL('image/jpeg', .97)); toast('Seite aufgenommen und gesichert');
  });
}
function bytes(base64) { return Uint8Array.from(atob(base64), char => char.charCodeAt(0)); }
async function ocrWorker(language = ocrLanguage()) {
  if (state.ocrPromise && state.workerLanguage !== language) { const previous=await state.ocrPromise; await previous.terminate(); state.ocrPromise=null; }
  if (!state.ocrPromise) {
    state.workerLanguage = language;
    state.ocrPromise = (async () => {
      const localAssets = globalThis.S2D_ASSET_BASE;
      const url = localAssets ? new URL('ocr-worker.js', localAssets).href : URL.createObjectURL(new Blob([bytes(embedded.ocrWorker)], {type:'text/javascript'}));
      const languageData = async code => {
        if (!localAssets) return bytes(embedded[code]);
        const response = await fetch(new URL(code + '.traineddata', localAssets));
        if (!response.ok) throw new Error('OCR-Sprachdaten fehlen. Bitte einmal online die Offline-Vorbereitung abschließen.');
        return new Uint8Array(await response.arrayBuffer());
      };
      try {
        const languages = [{code:'deu', data:await languageData('deu')}];
        if(language.includes('eng')) languages.push({code:'eng', data:await languageData('eng')});
        const worker = await Tesseract.createWorker(languages, 1, {
          workerPath: url, workerBlobURL: false, cacheMethod: 'none', gzip: false,
          logger: message => { if (message.status === 'recognizing text') { state.ocrMessage = `Texterkennung · ${Math.round(message.progress * 100)} %`; ocrSummary(); } },
          errorHandler: error => console.warn('OCR', error)
        });
        state.ocrWorker = worker; return worker;
      } finally { if (!localAssets) URL.revokeObjectURL(url); }
    })().catch(error => { state.ocrPromise = null; throw error; });
  }
  return state.ocrPromise;
}
async function runOcrQueue() {
  if (state.ocrRunning || state.busy || state.processing || !state.ocrTasks?.length) return;
  state.ocrRunning = true;
  try {
    while (state.ocrTasks.length && !state.busy && !state.processing) {
      const job=state.ocrTasks.shift();
      const doc=state.current?.id===job.docId?state.current:state.docs.find(d=>d.id===job.docId);
      const page=doc?.pages.find(p=>p.id===job.pageId);
      if(!page || page.revision!==job.revision || ocrFresh(page)) continue;
      state.ocrActive=job; const revision=page.revision;
      page.ocrState='running'; state.ocrMessage=`Texterkennung · Seite ${doc.pages.indexOf(page)+1} startet …`; ocrSummary();
      try {
        const worker = await ocrWorker(job.language);
        const input = await imageCanvas(page.processed, 2000);
        const result = await worker.recognize(input.toDataURL('image/png'));
        if (page.revision !== revision) continue;
        page.ocrText = result.data.text; page.ocrState = 'done'; page.ocrRevision=revision; page.ocrLanguage=job.language;
      } catch (error) { if(page.revision===revision){page.ocrState = 'error'; page.ocrError = error.message;} }
      const targetDoc = state.current?.id === doc.id ? state.current : state.docs.find(item => item.id === doc.id);
      const targetPage = targetDoc?.pages.find(item => item.id === page.id);
      if (targetPage && targetPage.revision === revision) {
        Object.assign(targetPage, { ocrText: page.ocrText || '', ocrState: page.ocrState, ocrError: page.ocrError || '', ocrRevision:page.ocrRevision, ocrLanguage:page.ocrLanguage });
      }
      if (state.current === targetDoc) {
        applySuggestions(); await persist();
        if (state.step === 'metadata') populateMetadata();
      } else if (state.db && targetDoc) { await dbWrite('documents', targetDoc, targetDoc.id); }
    }
  } finally {
    state.ocrRunning = false; state.ocrActive=null; ocrSummary();
  }
}
function applySuggestions(force = false) {
  if (!state.current) return;
  const doc = state.current; const suggestion = S2DMeta.extract(doc.pages.filter(ocrFresh).map(page => page.ocrText || '').join('\n'), state.rules.rules);
  for (const key of ['date', 'sender', 'type', 'amount']) if (force || !doc.edited[key]) doc.meta[key] = suggestion[key] || (key === 'date' ? doc.takenDate : '');
  doc.warnings = suggestion.warnings;
}
function populateMetadata() {
  const doc = state.current;
  for (const [id, key] of [['docDate', 'date'], ['sender', 'sender'], ['docType', 'type'], ['amount', 'amount']]) $(`#${id}`).value = doc.meta[key] || (key === 'date' ? doc.takenDate : '');
  if (document.activeElement !== $('#filenameMeta')) $('#filenameMeta').value = title(doc);
  $('#metadataNotice').textContent = ['OCR-Vorschläge prüfen; Änderungen bleiben erhalten.', ...(doc.warnings || [])].join(' ');
  $('#recognizedText').textContent = doc.pages.map((page, i) => `Seite ${i + 1}\n${page.ocrText || '(noch kein Text)'}`).join('\n\n');
}
async function suggestFolder() {
  if (state.folder) return;
  const key = S2DMeta.senderKey(state.current.meta.sender);
  const rule = state.rules.rules[key];
  if (rule?.folderId && state.db) { state.folder = await dbRead('folders', rule.folderId); state.folderId = state.folder ? rule.folderId : null; }
}
function updateExport() {
  const doc = state.current; $('#format').value = doc.format || 'pdf';
  const base = title(doc); $('#exportName').textContent = doc.format === 'pdf' ? `${base}.pdf` : `${base}_01.${doc.format || 'pdf'}${doc.pages.length > 1 ? ` … ${String(doc.pages.length).padStart(2, '0')}` : ''}`;
  $('#folderLabel').textContent = state.folder?.name || 'Noch kein Ordner ausgewählt';
  const direct = typeof window.showDirectoryPicker === 'function';
  $('#chooseFolder').textContent = direct ? 'Speicherort auswählen' : 'System-Speichern verwenden';
  $('#folderHint').textContent = direct ? 'Ein bestätigter Ordner kann für diesen Absender wiederverwendet werden.' : 'Dieser Browser bietet keinen direkten Ordnerzugriff. Der Systemdialog wird beim Export geöffnet, sofern verfügbar. Sein Zielordner wird der App nicht mitgeteilt und kann hier deshalb nicht gelernt werden.';
}
async function chooseFolder() {
  if (!window.showDirectoryPicker) { toast('Beim Speichern öffnet sich der verfügbare Systemdialog. Direkter Ordnerzugriff wird von diesem Browser nicht unterstützt.'); return; }
  try { const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 's2d-exports' });
    const folderId = uid();
    if (state.db) await dbWrite('folders', handle, folderId);
    state.folder = handle; state.folderId = folderId; state.current.folderId = folderId; await persist(); updateExport();
  } catch (error) { if (error.name !== 'AbortError') throw error; }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function exportFiles(remember = false) {
  const doc = state.current, base = S2DMeta.safe(title(doc));
  if (!doc?.pages.length) throw new Error('Keine Seiten vorhanden.');
  // Request permission before processing, while the export click is active.
  if (state.folder && await state.folder.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Ordnerzugriff nicht erteilt. Bitte Speicherort erneut auswählen.');
  let fileHandle = null;
  if (!state.folder && doc.format === 'pdf' && window.showSaveFilePicker) {
    try { fileHandle = await window.showSaveFilePicker({ suggestedName: `${base}.pdf`, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }); }
    catch (error) { if (error.name === 'AbortError') return; throw error; }
  }
  await exclusive(async () => {
    const files = [];
    if (doc.format === 'pdf') {
      const pdf = await PDFLib.PDFDocument.create();
      for (const page of doc.pages) {
        const image = await imageCanvas(page.processed), jpeg = image.toDataURL('image/jpeg', .95);
        const embeddedImage = await pdf.embedJpg(bytes(jpeg.split(',')[1]));
        const width = image.width > image.height ? 842 : 595, height = width * image.height / image.width;
        const sheet = pdf.addPage([width, height]); sheet.drawImage(embeddedImage, { x: 0, y: 0, width, height });
      }
      files.push(new File([await pdf.save()], `${base}.pdf`, { type: 'application/pdf' }));
    } else {
      for (let i = 0; i < doc.pages.length; i++) {
        const image = await imageCanvas(doc.pages[i].processed);
        const blob = await new Promise(resolve => image.toBlob(resolve, doc.format === 'png' ? 'image/png' : 'image/jpeg', .95));
        if (!blob) throw new Error('Bildexport fehlgeschlagen.');
        files.push(new File([blob], `${base}_${String(i + 1).padStart(doc.pages.length >= 100 ? 3 : 2, '0')}.${doc.format}`, { type: blob.type }));
      }
    }
    let completed = 0;
    if (state.folder || fileHandle) {
      for (const file of files) {
        let handle = fileHandle;
        if (!handle) {
          let existing = null;
          try { existing = await state.folder.getFileHandle(file.name); } catch (error) { if (error.name !== 'NotFoundError') throw error; }
          if (existing && !confirm(`${file.name} existiert bereits. Ersetzen?`)) throw new Error(`Export gestoppt. ${completed} Dateien bereits geschrieben; Entwurf bleibt erhalten.`);
          handle = existing || await state.folder.getFileHandle(file.name, { create: true });
        }
        const writer = await handle.createWritable();
        try { await writer.write(file); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
        completed++;
      }
      $('#doneTitle').textContent = 'Dateien gespeichert'; $('#doneMessage').textContent = `${files.length} Datei(en) · ${state.folder?.name || files[0].name}`;
      if (state.folder && remember && doc.meta.sender) {
        const key = S2DMeta.senderKey(doc.meta.sender), old = state.rules.rules[key];
          state.rules.rules[key] = { ...old, folder: state.folder.name, folderId: state.folderId, updatedAt: new Date().toISOString() }; await saveRules();
      }
      state.exportReady = null;
    } else {
      state.exportReady = files;
      $('#doneTitle').textContent = 'Dateien zum Speichern bereit'; $('#doneMessage').textContent = 'Wähle „Teilen / Speichern“ für den Systemdialog oder lade die Dateien einzeln herunter. Dein bearbeitbarer Entwurf bleibt erhalten.';
    }
    doc.lastExportAt = new Date().toISOString(); await persist(); setStep('done'); renderExportDownloads();
  });
}
function renderExportDownloads() {
  $('#exportDownloads')?.remove();
  if (!state.exportReady) return;
  const area = document.createElement('div'); area.id = 'exportDownloads'; area.className = 'actions';
  const files = state.exportReady;
  if (navigator.canShare?.({ files })) { const share = document.createElement('button'); share.id = 'shareFiles'; share.textContent = 'Teilen / Speichern'; share.className = 'primary'; area.append(share); }
  files.forEach((file, i) => { const button = document.createElement('button'); button.dataset.download = String(i); button.textContent = `Herunterladen: ${file.name}`; area.append(button); });
  $('#doneStep').append(area);
}

async function openCrop() {
  const page = currentPage(), source = await imageCanvas(page.source);
  state.crop = { page, source, points: page.corners.map(p => ({ ...p })), dragging: -1 };
  const output = $('#cropCanvas'); output.width = source.width; output.height = source.height; $('#cropInset').value = String(page.inset);
  setStep('crop'); drawCrop();
}
function drawCrop() {
  const { source, points } = state.crop, output = $('#cropCanvas'), ctx = output.getContext('2d');
  ctx.drawImage(source, 0, 0); ctx.beginPath(); ctx.rect(0, 0, output.width, output.height);
  ctx.moveTo(points[0].x, points[0].y); points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = '#0008'; ctx.fill('evenodd');
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  ctx.strokeStyle = S2DVision.validQuad(points, output.width, output.height) ? '#49e2c0' : '#fa6248'; ctx.lineWidth = output.width / 180; ctx.stroke();
  const inside=insetPoints(points,Number($('#cropInset').value));
  ctx.beginPath();inside.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle='#ffdc65';ctx.setLineDash([output.width/80,output.width/120]);ctx.stroke();ctx.setLineDash([]);
  points.forEach((p,i)=>{const q=points[(i+1)%4],size=output.width/75;ctx.fillStyle='#49e2c0';ctx.fillRect((p.x+q.x)/2-size/2,(p.y+q.y)/2-size/2,size,size);});
  const radius = Math.max(15, output.width / 45);
  points.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.stroke(); ctx.font = `bold ${radius}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#205f9d'; ctx.fillText(String(i + 1), p.x, p.y); });
}
function pointOn(element, event) { const rect = element.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) * element.width / rect.width, 0, element.width - 1), y: clamp((event.clientY - rect.top) * element.height / rect.height, 0, element.height - 1) }; }
async function applyCrop() {
  const edit = state.crop;
  if (!S2DVision.validQuad(edit.points, edit.source.width, edit.source.height)) throw new Error('Bitte vier gültige, nicht gekreuzte Ecken setzen.');
  await exclusive(async () => { edit.page.corners = edit.points; edit.page.inset = Number($('#cropInset').value); await transformPage(edit.page, true); edit.page.needsCrop = false; edit.page.retouched=false; await persist(); setStep('review'); });
}
async function rotatePage(direction = 1) {
  await exclusive(async () => {
    const page = currentPage();
    const result=await visionTask({kind:'rotate', direction, source:page.source, original:page.original, processed:page.processed});
    const {width,height}=result;
    page.corners = S2DVision.order(page.corners.map(p => direction>0?{x:height-1-p.y,y:p.x}:{x:p.y,y:width-1-p.x}));
    for(const key of ['source','original','processed','thumb'])page[key]=result[key];
    page.revision++; invalidateOcr(page); await persist(); renderPages();
  });
}
async function openRetouch() {
  const source = await imageCanvas(currentPage().processed), output = $('#editCanvas'); output.width = source.width; output.height = source.height; output.getContext('2d').drawImage(source, 0, 0);
  state.editor = { page: currentPage(), scale: 1, x: 0, y: 0, tool: 'white', pointers: new Map(), undo: [], redo: [], snapshot: null, last: null, pinch: null };
  setStep('retouch'); editorTransform();
}
function editorTransform() { const edit = state.editor; $('#editCanvas').style.transform = `translate(${edit.x}px,${edit.y}px) scale(${edit.scale})`; $('#zoomValue').textContent = `${Math.round(edit.scale * 100)} %`; }
function drawStroke(point) {
  const edit = state.editor, output = $('#editCanvas'), ctx = output.getContext('2d', { willReadFrequently: true });
  const radius = Number($('#brushSize').value) * output.width / output.getBoundingClientRect().width;
  const previous = edit.last || point, steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / Math.max(1, radius / 3)));
  for (let step = 0; step <= steps; step++) {
    const x = previous.x + (point.x - previous.x) * step / steps, y = previous.y + (point.y - previous.y) * step / steps;
    let color = [255, 255, 255];
    if (edit.tool === 'smart') {
      const samples = [];
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        const sx = clamp(Math.round(x + Math.cos(angle) * radius * 1.5), 0, output.width - 1), sy = clamp(Math.round(y + Math.sin(angle) * radius * 1.5), 0, output.height - 1);
        samples.push([...ctx.getImageData(sx, sy, 1, 1).data].slice(0, 3));
      }
      samples.sort((a, b) => a.reduce((s, c) => s + c, 0) - b.reduce((s, c) => s + c, 0)); color = samples[Math.floor(samples.length * .75)];
    }
    const gradient = ctx.createRadialGradient(x, y, radius * .6, x, y, radius); gradient.addColorStop(0, `rgba(${color.join(',')},1)`); gradient.addColorStop(1, `rgba(${color.join(',')},0)`);
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  edit.last = point;
}
function undoRedo(direction) {
  const edit = state.editor, ctx = $('#editCanvas').getContext('2d'), from = edit[direction], to = edit[direction === 'undo' ? 'redo' : 'undo'];
  if (!from.length) return;
  to.push(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)); ctx.putImageData(from.pop(), 0, 0);
}
async function backupAll() {
  await state.persistQueue;
  download(new Blob([JSON.stringify({ version: 2, kind: 's2d-backup', exportedAt: new Date().toISOString(), documents: state.docs, rules: state.rules })], { type: 'application/json' }), `${S2DMeta.localDate().replace(/-/g, '').slice(2)}_s2d_sicherung.json`);
}
function validRules(data) {
  if (data?.version !== 1 || !data.rules || typeof data.rules !== 'object' || Array.isArray(data.rules)) throw new Error('Ungültige S2D-Zuordnungsdatei.');
  const rules = {};
  for (const [name, rule] of Object.entries(data.rules)) {
    if (!rule || typeof rule.folder !== 'string') throw new Error('Ungültige Ordnerregel.');
    const key = S2DMeta.senderKey(name); if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    rules[key] = { folder: rule.folder.slice(0, 1000), aliases: Array.isArray(rule.aliases) ? rule.aliases.filter(a => typeof a === 'string').slice(0, 50) : [], updatedAt: rule.updatedAt || '' };
  }
  return { version: 1, rules, settings: data.settings && typeof data.settings === 'object' ? data.settings : {} };
}
async function importJson(event, backup) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  const data = JSON.parse(await file.text());
  if (!backup) {
    const incoming = validRules(data); state.rules.rules = { ...state.rules.rules, ...incoming.rules }; await saveRules(); toast('Zuordnungen eingelesen. Ordner müssen erneut ausgewählt werden.'); return;
  }
  if (data.version !== 2 || data.kind !== 's2d-backup' || !Array.isArray(data.documents)) throw new Error('Keine gültige Dokument-Sicherung.');
  const incoming = [];
  for (const doc of data.documents) {
    if (!Array.isArray(doc.pages) || !doc.meta || typeof doc.takenDate !== 'string') throw new Error('Beschädigte Dokumentdaten.');
    for (const page of doc.pages) {
      for (const key of ['source', 'original', 'processed']) if (typeof page[key] !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(page[key])) throw new Error('Ungültiges Bild in der Sicherung.');
      if (!Array.isArray(page.corners) || page.corners.length !== 4 || !page.corners.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error('Ungültige Bildgeometrie.');
      page.id = uid(); page.ocrState = page.ocrText && (page.ocrRevision===undefined || page.ocrRevision===page.revision) ? 'done' : 'dirty';
      if(page.ocrState==='done')page.ocrRevision=page.revision;
    }
    doc.id = uid(); delete doc.folderId; doc.edited ||= {}; doc.updatedAt = new Date().toISOString(); incoming.push(doc);
  }
  if (!state.db) throw new Error('Lokaler Speicher nicht verfügbar.');
  for (const doc of incoming) { await dbWrite('documents', doc, doc.id); state.docs.push(doc); }
  if (data.rules) { const imported = validRules(data.rules); state.rules.rules = { ...state.rules.rules, ...imported.rules }; await saveRules(); }
  renderDocuments(); toast(`${incoming.length} Dokumente als Kopien wiederhergestellt.`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  void dispatch(button).catch(fail);
});
async function dispatch(button) {
  const id = button.id;
  if(id==='viewerClose') return closeViewer();
  if(id==='saveCancel') { $('#saveChoice').close();return; }
  if(id==='saveRemember'||id==='saveOnce'){ $('#saveChoice').close();return exportFiles(id==='saveRemember'); }
  if (state.busy) { toast('Verarbeitung läuft. Bitte kurz warten.'); return; }
  await flushEdits();
  if (button.dataset.document) return openDocument(button.dataset.document);
  if (button.dataset.page) { const old=currentPage();if(old?.id!==button.dataset.page && state.step==='review')queueOcr(old);state.selected = button.dataset.page; renderPages(); openViewer(); return; }
  if(id==='openLargePreview')return openViewer();
  if (button.dataset.download !== undefined) { const file = state.exportReady[Number(button.dataset.download)]; download(file, file.name); return; }
  if (id === 'showHome' || id === 'doneHome') { await persist(); setStep('home'); return; }
  if (id === 'newDocument') { await persist(); newDocument(); return; }
  if (id === 'startScan' || id === 'scanMore') { if (!state.current) newDocument(); return startCamera(); }
  if (id === 'openFilesHome' || id === 'openFilesCapture') { if (!state.current) newDocument(); $('#fileGallery').click(); return; }
  if (id === 'captureFrame') return captureFrame();
  if (id === 'closeCamera') { stopCamera(); return; }
  if (id === 'finishCapture' || id === 'backReview' || id === 'editAgain') return setStep('review');
  if (id === 'backCapture') return setStep('capture');
  if (id === 'continueMetadata' || id === 'backMetadata') { setStep('metadata');state.current.pages.forEach(page=>queueOcr(page));return; }
  if (id === 'continueSave') { await suggestFolder(); return setStep('save'); }
  if (id === 'chooseFolder') return chooseFolder();
  if (id === 'saveDocument') return askSave();
  if (id === 'shareFiles') { try { await navigator.share({ files: state.exportReady, title: title(state.current) }); } catch (error) { if (error.name !== 'AbortError') throw error; } return; }
  if (id === 'cropPage') return openCrop();
  if (id === 'cropCancel' || id === 'editCancel') return setStep('review');
  if (id === 'cropApply') return applyCrop();
  if (id === 'cropFull') { state.crop.points = S2DVision.fullQuad(state.crop.source.width, state.crop.source.height); $('#cropInset').value = '0'; drawCrop(); return; }
  if (id === 'cropDetect') {return exclusive(async()=>{const result=await visionTask({kind:'detect',source:state.crop.page.source});state.crop.points=result.points;if(!result.detected)toast('Kanten nicht eindeutig erkannt. Bitte manuell setzen.');drawCrop();});}
  if (id === 'rotateLeft' || id === 'rotateRight') return rotatePage(id==='rotateLeft'?-1:1);
  if (id === 'retouchPage') return openRetouch();
  if (id === 'deletePage') { if (confirm('Diese Seite aus dem Dokument entfernen?')) { const page = currentPage(); state.current.pages = state.current.pages.filter(p => p.id !== page.id); state.selected = state.current.pages[0]?.id || null; await persist(); setStep(state.current.pages.length ? 'review' : 'capture'); } return; }
  if (id === 'editApply') { return exclusive(async()=>{const page = state.editor.page; page.processed = $('#editCanvas').toDataURL('image/png'); page.retouched = true; page.thumb = await thumbnail(page.processed); page.revision++; invalidateOcr(page); await persist(); setStep('review');}); }
  if (id === 'undo' || id === 'redo') return undoRedo(id);
  if (id.startsWith('tool')) { state.editor.tool = id === 'toolWhite' ? 'white' : id === 'toolSmart' ? 'smart' : 'pan'; for (const key of ['toolWhite', 'toolSmart', 'toolPan']) $(`#${key}`).classList.toggle('active', id === key); return; }
  if (id === 'zoomIn' || id === 'zoomOut') { state.editor.scale = clamp(state.editor.scale * (id === 'zoomIn' ? 1.25 : .8), 1, 8); editorTransform(); return; }
  if (id === 'resetZoom') { Object.assign(state.editor, { scale: 1, x: 0, y: 0 }); editorTransform(); return; }
  if (id === 'retryOcr') { state.current.pages.forEach(p=>{if(p.ocrState!=='running'){p.ocrState='dirty';queueOcr(p,true);}});return; }
  if (id === 'acceptOcr') { if (confirm('Manuelle Feldänderungen durch den OCR-Vorschlag ersetzen?')) { state.current.edited = {}; applySuggestions(true); populateMetadata(); await persist(); } return; }
  if (id === 'backupAll') return backupAll();
  if (id === 'restoreBackup') return $('#backupImport').click();
  if (id === 'exportData') { const portable = JSON.parse(JSON.stringify(state.rules)); Object.values(portable.rules).forEach(rule => delete rule.folderId); download(new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' }), `s2d_daten_${S2DMeta.localDate()}.json`); return; }
  if (id === 'importData') return $('#dataImport').click();
}

for (const id of ['fileCapture', 'fileGallery']) $(`#${id}`).addEventListener('change', event => { void importImages(event).catch(fail); });
$('#dataImport').addEventListener('change', event => { void importJson(event, false).catch(fail); });
$('#backupImport').addEventListener('change', event => { void importJson(event, true).catch(fail); });
for (const [id, key] of [['docDate', 'date'], ['sender', 'sender'], ['docType', 'type'], ['amount', 'amount']]) {
  $(`#${id}`).addEventListener('input', event => {
    const doc = state.current; doc.meta[key] = event.target.value; doc.edited[key] = true;
    if (key === 'sender') { state.folder = null; state.folderId = null; delete doc.folderId; }
    if (!doc.meta.customName) $('#filenameMeta').value = title(doc); void persist();
  });
}
$('#filenameMeta').addEventListener('input', event => { state.current.meta.customName = S2DMeta.safe(event.target.value).replace(/\.(pdf|jpg|png)$/i, ''); void persist(); });
$('#format').addEventListener('change', event => { state.current.format = event.target.value; updateExport(); void persist(); });
$('#filterMode').addEventListener('change',()=>chooseEnhancement(true));
$('#enhanceStrength').addEventListener('input',()=>chooseEnhancement(false));
$('#enhanceStrength').addEventListener('change',()=>chooseEnhancement(true));
$('#ocrEnglish').addEventListener('change',event=>{state.rules.settings.ocrEnglish=event.target.checked;void saveRules();ocrSummary();});

$('#editStage').addEventListener('pointerdown', event => {
  const edit = state.editor; if (!edit) return; $('#editStage').setPointerCapture(event.pointerId); edit.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const ctx = $('#editCanvas').getContext('2d');
  if (edit.pointers.size === 1) { edit.last = null; edit.snapshot = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height); }
  else if (edit.pointers.size === 2) {
    if (edit.snapshot) ctx.putImageData(edit.snapshot, 0, 0); // Undo any first-finger mark before a pinch.
    edit.snapshot = null; const p = [...edit.pointers.values()]; edit.pinch = { distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), centerX: (p[0].x + p[1].x) / 2, centerY: (p[0].y + p[1].y) / 2, scale: edit.scale, x: edit.x, y: edit.y };
  }
});
$('#editStage').addEventListener('pointermove', event => {
  const edit = state.editor; if (!edit?.pointers.has(event.pointerId)) return;
  const previous = edit.pointers.get(event.pointerId); edit.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (edit.pointers.size === 2 && edit.pinch) { const p = [...edit.pointers.values()]; edit.scale = clamp(edit.pinch.scale * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / Math.max(1, edit.pinch.distance), 1, 8); edit.x = edit.pinch.x + (p[0].x + p[1].x) / 2 - edit.pinch.centerX; edit.y = edit.pinch.y + (p[0].y + p[1].y) / 2 - edit.pinch.centerY; editorTransform(); }
  else if (edit.pointers.size === 1 && !edit.pinch) { if (edit.tool === 'pan') { edit.x += event.clientX - previous.x; edit.y += event.clientY - previous.y; editorTransform(); } else drawStroke(pointOn($('#editCanvas'), event)); }
});
for (const type of ['pointerup', 'pointercancel']) $('#editStage').addEventListener(type, event => {
  const edit = state.editor; if (!edit) return;
  if (type === 'pointerup' && edit.pointers.size === 1 && !edit.pinch && edit.tool !== 'pan' && edit.snapshot) { if (!edit.last) drawStroke(pointOn($('#editCanvas'), event)); edit.undo.push(edit.snapshot); if (edit.undo.length > 3) edit.undo.shift(); edit.redo = []; }
  if (type === 'pointercancel' && edit.snapshot) $('#editCanvas').getContext('2d').putImageData(edit.snapshot, 0, 0);
  edit.pointers.delete(event.pointerId); if (!edit.pointers.size) { edit.snapshot = null; edit.pinch = null; edit.last = null; }
});
window.addEventListener('beforeunload', event => { if (state.dirty || state.busy || state.processing || state.editUncommitted) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopCamera(); void persist(); } });
let historyGuard = false;
try { history.replaceState({ s2d: 'base' }, ''); history.pushState({ s2d: 'guard' }, ''); historyGuard = true; } catch { /* A restrictive viewer may not expose history. */ }
window.addEventListener('popstate', async () => {
  if (historyGuard) try { history.pushState({ s2d: 'guard' }, ''); } catch { /* Draft persistence is the primary safeguard. */ }
  if($('#viewer').open){closeViewer();return;}
  if($('#saveChoice').open){$('#saveChoice').close();return;}
  if (state.busy) { toast('Verarbeitung läuft; Entwurf wird gesichert.'); return; }
  try { await flushEdits(); } catch(error) {fail(error);return;}
  if (['crop', 'retouch', 'metadata'].includes(state.step)) setStep('review');
  else if (state.step === 'save') setStep('metadata');
  else if (state.step !== 'home') setStep('home');
  else toast('Zum Beenden den Browser-Tab schließen. Dokumente bleiben lokal gespeichert.');
});

// Called after extras.js has initialized all worker helpers.
let engineReady = null;
function ensureImageEngine() {
  if (engineReady) return engineReady;
  $('#engineState').textContent = 'Bildverarbeitung startet …';
  engineReady = Promise.resolve().then(() => visionTask({kind:'ready'})).then(engine => {
    if (!engine.ready) throw new Error('OpenCV konnte nicht gestartet werden.');
    $('#engineState').textContent = 'Bildverarbeitung bereit · OCR lokal'; return engine;
  }).catch(error => {
    resetImageWorker(error);
    $('#engineState').textContent = 'Bildverarbeitung nicht verfügbar · beim nächsten Bild erneut versuchen';
    throw error;
  });
  return engineReady;
}
async function initialize() {
  try {
    state.db = await database();
    state.docs = await requestResult(state.db.transaction('documents').objectStore('documents').getAll());
    for (const doc of state.docs) for (const page of doc.pages) {if(page.ocrState==='done' && page.ocrRevision===undefined)page.ocrRevision=page.revision;else if(['running','preparing','pending','queued'].includes(page.ocrState))page.ocrState='dirty';}
    const stored = await dbRead('settings', 'rules');
    if (stored) state.rules = stored; else try { const old = localStorage.getItem('s2d-standalone-data-v1'); if (old) state.rules = validRules(JSON.parse(old)); } catch { /* Ignore corrupt legacy settings, preserve documents. */ }
    state.rules.settings ||= {}; $('#ocrEnglish').checked=!!state.rules.settings.ocrEnglish;
    storageState('Lokale Entwürfe verfügbar');
  } catch (error) { storageState(`Browser-Speicher nicht verfügbar: ${error.message}. Dokumente vor dem Schließen sichern.`, true); }
  renderDocuments();
}
function startApplication() {
  void initialize();
  void ensureImageEngine().catch(fail);
}
