/* Browser-worker API adapters for running the shipped worker with real OpenCV. */
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),vm=require('node:vm');
const canvas=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
globalThis.self=globalThis;
globalThis.cv=require(workerData.root+'/opencv.js');
globalThis.S2DVision=require(workerData.root+'/vision.js');
globalThis.importScripts=(...files)=>{for(const file of files)if(!['./opencv.js','./vision.js'].includes(file))throw new Error('Unexpected worker dependency: '+file);};
globalThis.ImageData=canvas.ImageData;
globalThis.OffscreenCanvas=class {
  constructor(width,height){const c=canvas.createCanvas(width,height);c.convertToBlob=async({type,quality})=>({_buffer:c.toBuffer(type,quality),type});return c;}
};
globalThis.FileReaderSync=class{readAsDataURL(blob){return `data:${blob.type};base64,${blob._buffer.toString('base64')}`;}};
globalThis.createImageBitmap=async(blob)=>{const image=await canvas.loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image;};
globalThis.postMessage=message=>parentPort.postMessage(message);
vm.runInThisContext(fs.readFileSync(workerData.root+'/image-worker.js','utf8'),{filename:'shipped-image-worker.js'});
parentPort.on('message',data=>self.onmessage({data}));
