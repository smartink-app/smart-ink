import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
const exported={};let calls=0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('integrations/google-feedback/localBridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported,require:()=>crypto,Buffer,AbortSignal,fetch:async(_url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.token,'x'.repeat(32));return {ok:true,json:async()=>({ok:true,id:payload.row[0]})};}});
let handler;
const server={middlewares:{use:(_path,h)=>handler=h}};
const env={GOOGLE_FEEDBACK_WEBAPP_URL:'https://script.google.com/macros/s/test/exec',GOOGLE_FEEDBACK_SECRET:'x'.repeat(32)};
exported.googleFeedbackBridge(env).configureServer(server);
const row=['test-1','test@example.test','2026-10-29','Projects','Test comment','test','new',''];
async function request(method,body,headers={},remote='127.0.0.1') {
 const req={method,headers:{host:'127.0.0.1:4320',origin:'http://127.0.0.1:4320','content-type':'application/json',...headers},socket:{remoteAddress:remote},async *[Symbol.asyncIterator](){yield JSON.stringify(body);}};
 let result;const res={setHeader(){},statusCode:200,end:s=>result={status:this?.statusCode,body:JSON.parse(s)}};
 await handler(req,res);return {...result,status:res.statusCode};
}
let r=await request('GET');assert.equal(r.body.configured,true);assert.equal(JSON.stringify(r).includes('xxxxxxxx'),false);
assert.equal((await request('POST',{row})).body.ok,true);assert.equal(calls,1);
assert.equal((await request('POST',{row},{origin:'https://evil.example'})).status,403);
assert.equal((await request('POST',{row},{host:'evil.example'})).status,403);
assert.equal((await request('POST',{row},{},'192.168.1.20')).status,403);
assert.equal((await request('POST',{row:['bad']})).status,400);
assert.equal((await request('POST',{row},{'content-type':'text/plain'})).status,415);
assert.equal((await request('POST',{row:[...row.slice(0,4),'x'.repeat(190000),...row.slice(5)]})).status,413);
assert.equal(calls,1,'Invalid requests must never reach Google');
exported.googleFeedbackBridge({}).configureServer(server);
assert.equal((await request('GET')).body.configured,false);assert.equal((await request('POST',{row})).status,503);
console.log('PASS: bridge auth boundary, payload limits, server-only secret, acknowledged export and unconfigured state');
