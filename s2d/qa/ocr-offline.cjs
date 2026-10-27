/* Executes the exact embedded OCR worker and models with network blocked. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const assets=JSON.parse(fs.readFileSync('s2d/assets.json'));
const webMode=process.env.S2D_TEST_WEB==='1';
const webBuild=webMode?JSON.parse(fs.readFileSync('s2d/WEB_BUILD.json')):null;
const workerSource=webMode?fs.readFileSync('web/'+webBuild.assetDirectory+'ocr-worker.js','utf8'):Buffer.from(assets.ocrWorker,'base64').toString();
const germanData=webMode?fs.readFileSync('web/'+webBuild.assetDirectory+'deu.traineddata'):Buffer.from(assets.deu,'base64');
const bootstrap=`const {parentPort,workerData}=require('node:worker_threads');
global.self=global;global.postMessage=data=>parentPort.postMessage(data);const listeners=[];
global.addEventListener=(type,callback)=>{if(type==='message')listeners.push(callback);};
global.importScripts=()=>{throw new Error('Network disabled');};global.fetch=()=>{throw new Error('Network disabled');};
global.location={href:'file:///offline-worker.js'};
const vm=require('node:vm');vm.runInThisContext(workerData.source,{filename:'embedded-ocr-worker.js'});
parentPort.on('message',data=>{const e={data};for(const fn of listeners)fn(e);if(global.onmessage)global.onmessage(e);});`;
const worker=new Worker(bootstrap,{eval:true,workerData:{source:workerSource}});
const pending=new Map();let id=0;
worker.on('message',m=>{const p=pending.get(m.jobId);if(!p)return;if(m.status==='resolve'){pending.delete(m.jobId);p.resolve(m.data);}else if(m.status==='reject'){pending.delete(m.jobId);p.reject(new Error(m.data));}});
worker.on('error',error=>{for(const p of pending.values())p.reject(error);});
function call(action,payload={}){return new Promise((resolve,reject)=>{const jobId=String(++id);pending.set(jobId,{resolve,reject});worker.postMessage({workerId:'test',jobId,action,payload});});}
async function main(){
 await call('load',{options:{lstmOnly:true}});
 const langs=[{code:'deu',data:new Uint8Array(germanData)}];
 await call('loadLanguage',{langs,options:{gzip:false,cacheMethod:'none',lstmOnly:true}});
 await call('initialize',{langs,oem:1,config:{}});
 const result=await call('recognize',{image:new Uint8Array(fs.readFileSync('s2d/qa/input.png')),options:{},output:{text:true}});
 const text=result.text;assert.match(text,/785[,.]62/);assert.match(text,/22[.]09[.]2026/);assert.match(text,/ALLIANZ/i);
 const meta=require('../metadata.js'),values=meta.extract(text);assert.equal(values.amount,'785.62');
 fs.writeFileSync(webMode?'s2d/qa/web-ocr-result.json':'s2d/qa/ocr-result.json',JSON.stringify({ok:true,offline:true,language:'deu',text,metadata:values},null,2));console.log('PASS offline German OCR: date, sender and total amount');
}
const timeout=setTimeout(()=>{console.error('OCR timeout');worker.terminate();process.exitCode=1;},90000);
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);worker.terminate();});
