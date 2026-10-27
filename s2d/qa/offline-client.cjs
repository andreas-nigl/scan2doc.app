/* UI state tests for the exact shipped offline client; DOM/worker channel simulated. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const build=JSON.parse(fs.readFileSync('s2d/WEB_BUILD.json'));
const source=fs.readFileSync('web/'+build.assetDirectory+'offline-client.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function harness({online=false,installed=true,available=true,networkError=false,firstInstall=false}={}) {
  const nodes=new Map(),events=new Map();let registers=0;
  for(const id of ['offlinePanel','offlineState','offlineRetry','offlineProgress','offlineDetails','offlineUpdate','checkUpdate','protectStorage','installApp']) {
    nodes.set(id,{hidden:true,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
  }
  class Channel {
    constructor(){this.port1={onmessage:null,close(){}};this.port2={postMessage:value=>queueMicrotask(()=>this.port1.onmessage?.({data:value}))};}
  }
  const active={state:'activated',postMessage(message,ports){ports[0].postMessage({ready:available,build:build.build});}};
  const installing={state:'installing',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const registration={active:installed?active:null,installing:firstInstall?installing:null,waiting:null,
    listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},update:async()=>{}};
  const serviceWorker={
    listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
    getRegistration:async scope=>{assert.equal(scope,'https://test.invalid/s2d.app/');return installed?registration:null;},
    register:async(url,options)=>{registers++;assert.equal(url,'./offline-worker.js');assert.equal(options.scope,'./');if(networkError)throw Error('Network offline');return registration;}
  };
  const context={console,URL,MessageChannel:Channel,isSecureContext:true,setTimeout,clearTimeout,
    location:{href:'https://test.invalid/s2d.app/'},navigator:{onLine:online,serviceWorker,storage:{persist:async()=>false}},
    document:{getElementById:id=>nodes.get(id),querySelector:()=>({content:build.build})},
    addEventListener:(name,callback)=>events.set(name,callback)};
  vm.createContext(context);vm.runInContext(source,context);
  return {nodes,registration,serviceWorker,active,installing,events,registers:()=>registers};
}
const tests=[];
async function test(name,fn){await fn();tests.push(name);console.log('PASS',name);}
async function main(){
  await test('Offline-Start prüft installierte Kopie ohne neue Registrierung',async()=>{
    const app=harness();await tick();
    assert.equal(app.nodes.get('offlineState').textContent,'Offline · App bereit');
    assert.equal(app.registers(),0);assert.equal(app.nodes.get('offlineProgress').hidden,true);
  });
  await test('Fehlgeschlagene Onlineprüfung erhält bestätigten Offline-Status',async()=>{
    const app=harness({online:true,networkError:true});await tick();
    assert.match(app.nodes.get('offlineState').textContent,/Offline bereit/);
    assert.equal(app.registers(),1);assert.match(app.nodes.get('offlineDetails').textContent,/bleibt verfügbar/);
  });
  await test('Fehlende Offline-Dateien werden nicht als bereit ausgegeben',async()=>{
    const app=harness({available:false});await tick();
    assert.match(app.nodes.get('offlineState').textContent,/noch nicht vollständig/);
    assert.equal(app.registers(),0);
  });
  await test('Erstinstallation wird erst nach Aktivierung als offline bereit angezeigt',async()=>{
    const app=harness({online:true,installed:false,firstInstall:true});await tick();
    assert.match(app.nodes.get('offlineState').textContent,/vorbereitet/);
    app.serviceWorker.listeners.message({data:{type:'S2D_OFFLINE_PROGRESS',build:build.build,ready:true,completed:build.bytes,total:build.bytes}});
    assert.doesNotMatch(app.nodes.get('offlineState').textContent,/Offline bereit/);
    app.registration.active=app.active;app.registration.installing=null;app.installing.state='activated';
    app.installing.listeners.statechange();await tick();
    assert.match(app.nodes.get('offlineState').textContent,/Offline bereit/);
  });
  await test('Update verlangt Schließen der App; Speicherzusage wird nicht vorgetäuscht',async()=>{
    const app=harness();await tick();app.registration.waiting={};
    app.nodes.get('offlineUpdate').listeners.click();
    assert.match(app.nodes.get('offlineDetails').textContent,/Alle S2D-Fenster schließen/);
    await app.nodes.get('protectStorage').listeners.click();
    assert.match(app.nodes.get('offlineDetails').textContent,/keinen beständigen Speicher zugesagt/);
  });
  fs.writeFileSync('s2d/qa/offline-client-results.json',JSON.stringify({ok:true,build:build.build,tests,
    limitations:'DOM, MessageChannel and ServiceWorker registration simulated. No browser UI or installation dialog tested.'},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
