'use strict';

(() => {
  const element = id => document.getElementById(id);
  const panel = element('offlinePanel');
  if (!panel) return;
  panel.hidden = false;
  const currentBuild = document.querySelector('meta[name="s2d-build"]').content;
  let registration = null;
  let ready = false;
  let preparing = false;
  let installPrompt = null;
  let errorText = '';

  function render() {
    const offline = navigator.onLine === false;
    element('offlineState').textContent = errorText ||
      (ready ? (offline ? 'Offline · App bereit' : 'Offline bereit · Kamera, OCR und Export lokal verfügbar') :
        preparing ? 'Offline-Kopie wird vorbereitet …' : 'Offline-Kopie noch nicht vollständig verfügbar');
    element('offlineRetry').disabled = preparing || offline;
    element('offlineProgress').hidden = !preparing;
    element('offlineUpdate').hidden = !registration?.waiting;
  }

  function status(worker) {
    return new Promise((resolve, reject) => {
      if (!worker) { resolve({ready:false}); return; }
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Offline-Status konnte nicht geprüft werden.')); }, 10000);
      channel.port1.onmessage = event => {
        clearTimeout(timer); channel.port1.close(); resolve(event.data);
      };
      worker.postMessage({type:'S2D_OFFLINE_STATUS'}, [channel.port2]);
    });
  }

  async function refresh() {
    if (!registration?.active) { render(); return; }
    try {
      const result = await status(registration.active);
      ready = result.ready && result.build === currentBuild;
      if (ready) { preparing = false; errorText = ''; }
    } catch (error) { if (!ready) errorText = error.message; }
    render();
  }

  function observe(worker) {
    if (!worker) return;
    const changed = () => {
      if (worker.state === 'redundant' && !ready) {
        preparing = false;
        errorText ||= 'Offline-Vorbereitung fehlgeschlagen. Bei bestehender Verbindung erneut versuchen.';
      }
      if (worker.state === 'activated') void refresh();
      if (worker.state === 'installed') {
        preparing = false;
        if (registration?.waiting) element('offlineUpdate').hidden = false;
      }
      render();
    };
    worker.addEventListener('statechange', changed);
    changed();
  }

  async function prepare() {
    if (preparing) return;
    if (!isSecureContext || !('serviceWorker' in navigator)) {
      errorText = 'Offlineinstallation benötigt HTTPS und einen Browser mit Service-Worker-Unterstützung.';
      render(); return;
    }
    preparing = true; errorText = ''; render();
    try {
      // Read the installed copy first: registration/update can fail without network.
      registration = await navigator.serviceWorker.getRegistration(new URL('./', location.href).href);
      await refresh();
      if (navigator.onLine === false) { preparing = false; render(); return; }
      registration = await navigator.serviceWorker.register('./offline-worker.js', {
        scope:'./', updateViaCache:'none'
      });
      registration.addEventListener('updatefound', () => observe(registration.installing));
      observe(registration.installing);
      await refresh();
      if (!registration.installing) preparing = false;
    } catch (error) {
      if (ready) element('offlineDetails').textContent = 'Updateprüfung nicht erreichbar. Die geprüfte Offline-Kopie bleibt verfügbar.';
      else errorText = 'Offline-Vorbereitung fehlgeschlagen: ' + error.message;
      preparing = false;
    }
    render();
  }

  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type !== 'S2D_OFFLINE_PROGRESS' || event.data.build !== currentBuild) return;
    const data = event.data;
    if (data.error) { errorText = data.error; preparing = false; }
    else {
      preparing = !data.ready;
      element('offlineProgress').max = data.total;
      element('offlineProgress').value = data.completed;
      element('offlineDetails').textContent = data.ready ? 'App vollständig auf diesem Gerät gespeichert.' :
        `${(data.completed / 1048576).toFixed(1)} / ${(data.total / 1048576).toFixed(1)} MiB · ${data.file}`;
    }
    render();
    if (data.ready) void refresh();
  });
  navigator.serviceWorker?.addEventListener('controllerchange', () => void refresh());
  element('offlineRetry').addEventListener('click', () => void prepare());
  element('offlineUpdate').addEventListener('click', () => {
    element('offlineDetails').textContent = 'Neue Version vollständig geladen. Alle S2D-Fenster schließen und die App neu öffnen. Deine Entwürfe bleiben erhalten.';
  });
  element('checkUpdate').addEventListener('click', async () => {
    try {
      if (!registration) { await prepare(); return; }
      await registration.update();
      element('offlineDetails').textContent = registration.waiting ?
        'Neue Version bereit. Alle S2D-Fenster schließen und neu öffnen.' :
        registration.installing ? 'Neue Version wird im Hintergrund vollständig vorbereitet.' : 'Keine neue Version gefunden.';
    } catch { element('offlineDetails').textContent = 'Updateprüfung derzeit nicht möglich. Die gespeicherte App bleibt verfügbar.'; }
    render();
  });
  element('protectStorage').addEventListener('click', async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      element('offlineDetails').textContent = granted ?
        'Browser hat beständigen Speicher bestätigt. Eine separate Dokumentensicherung bleibt sinnvoll.' :
        'Browser hat keinen beständigen Speicher zugesagt. Bitte Dokumente regelmäßig sichern.';
    } catch { element('offlineDetails').textContent = 'Speicherschutz ist hier nicht verfügbar. Bitte Dokumente regelmäßig sichern.'; }
  });
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; element('installApp').hidden = false;
  });
  element('installApp').addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt(); await installPrompt.userChoice;
    installPrompt = null; element('installApp').hidden = true;
  });
  addEventListener('appinstalled', () => { installPrompt = null; element('installApp').hidden = true; });
  addEventListener('offline', render);
  addEventListener('online', () => void prepare());
  render(); void prepare();
})();
