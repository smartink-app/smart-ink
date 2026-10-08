/** Run the real panel with controlled React scheduling and delayed network calls. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const bundle=await build({stdin:{contents:"export {default} from './src/RevealPanel';",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'reveal-lifecycle',setup(builder){
  builder.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:args.path,namespace:'hooks'}));
  builder.onLoad({filter:/.*/,namespace:'hooks'},args=>({contents:args.path==='react'
    ? 'export const useRef=value=>globalThis.__revealHooks.ref(value);export const useState=value=>globalThis.__revealHooks.state(value);export const useEffect=(fn,deps)=>globalThis.__revealHooks.effect(fn,deps);'
    : 'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'}));
  builder.onResolve({filter:/\/revealRenderService$/},()=>({path:'service',namespace:'service'}));
  builder.onLoad({filter:/.*/,namespace:'service'},()=>({contents:['getRevealCapabilities','submitReveal','getRevealJob','cancelReveal','revealOutputUrl'].map(name=>`export const ${name}=(...args)=>globalThis.__revealServices.${name}(...args);`).join('')}));
}}]});
const {default:Panel}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const saved={storage:globalThis.localStorage,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
const values=new Map();let storageBlocked=false;
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(storageBlocked)throw Error('Blocked');values.set(key,value);},removeItem:key=>values.delete(key)};
let timerId=0;const timers=new Map();
globalThis.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};
globalThis.clearTimeout=id=>timers.delete(id);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const calls={capabilities:[],jobs:[],submits:[],cancels:[]};
function request(list,args){const next={...deferred(),args};list.push(next);return next.promise;}
globalThis.__revealServices={getRevealCapabilities:(...args)=>request(calls.capabilities,args),getRevealJob:(...args)=>request(calls.jobs,args),submitReveal:(...args)=>request(calls.submits,args),cancelReveal:(...args)=>request(calls.cancels,args),revealOutputUrl:id=>`/video/${id}`};
function elements(tree,out=[]){if(Array.isArray(tree))tree.forEach(child=>elements(child,out));else if(tree&&typeof tree==='object'){out.push(tree);elements(tree.props?.children,out);}return out;}
function harness(sceneKey,buildShot=async()=>({contract:{},inkBlob:{}})){
  const slots=[],effects=[];let cursor=0,alive=true,tree,writesAfterUnmount=0;
  const state=value=>{const index=cursor++;if(!slots[index])slots[index]={value:typeof value==='function'?value():value};return[slots[index].value,next=>{if(!alive){writesAfterUnmount++;return;}slots[index].value=typeof next==='function'?next(slots[index].value):next;}];};
  const hooks={state,ref(value){const index=cursor++;return slots[index]??=( {current:value})},effect(fn,deps){const index=cursor++,previous=slots[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i]))){slots[index]={deps,cleanup:previous?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn();});}}};
  const render=()=>{globalThis.__revealHooks=hooks;cursor=0;tree=Panel({sceneKey,buildShot,onPreview(){},previewing:false,hasTattoo:true});while(effects.length)effects.shift()();return tree;};
  const button=label=>elements(tree).find(node=>node.type==='button'&&node.props.children===label);
  const unmount=()=>{alive=false;slots.forEach(slot=>slot.cleanup?.());};
  render();return{render,button,unmount,nodes:()=>elements(tree),get writesAfterUnmount(){return writesAfterUnmount;}};
}
async function settle(...apps){for(let i=0;i<8;i++)await Promise.resolve();for(const app of apps)app.render();for(let i=0;i<8;i++)await Promise.resolve();for(const app of apps)app.render();}
const job=(id,status='rendering')=>({id,status,frame:3,totalFrames:96,message:`${id} ${status}`,preset:'reveal',createdAt:'now',updatedAt:'now'});
async function ready(app){calls.capabilities.at(-1).resolve({supported:true,message:''});await settle(app);}
function runTimer(){const entry=timers.entries().next().value;assert.ok(entry,'A poll retry is scheduled');timers.delete(entry[0]);entry[1].fn();return entry[1].delay;}
try{
  // Supported capability is not sufficient: older job recovery must complete.
  values.set('smartink:reveal:restore','previous');let builds=0;
  const restoring=harness('restore',async()=>{builds++;return{contract:{},inkBlob:{}};});
  await ready(restoring);assert.equal(calls.jobs.at(-1).args[0],'previous');
  assert.equal(restoring.button('Render video').props.disabled,true);
  restoring.button('Render video').props.onClick();await settle(restoring);assert.equal(builds,0,'Guard also protects queued/duplicate handlers');
  calls.jobs.at(-1).resolve(job('previous'));await settle(restoring);assert.equal(restoring.button('Render video').props.disabled,true);
  restoring.unmount();assert.equal(timers.size,0);

  // Immediately repeated click submits once. Closing after dispatch cannot
  // abort the upload or lose its ID; a new panel waits for that same upload.
  for(const blocked of [false,true]){
    storageBlocked=blocked;const scene=`upload-${blocked}`;let prepared=0;
    const first=harness(scene,async()=>{prepared++;return{contract:{},inkBlob:{}};});await ready(first);
    const count=calls.submits.length;
    first.button('Render video').props.onClick();first.button('Render video').props.onClick();await settle(first);
    assert.equal(prepared,1);assert.equal(calls.submits.length,count+1);assert.equal(calls.submits.at(-1).args[3],undefined,'Panel abort signal must not own submitted render');
    const upload=calls.submits.at(-1);first.unmount();
    const reopened=harness(scene);await ready(reopened);assert.equal(reopened.button('Render video').props.disabled,true);
    upload.resolve(job(`accepted-${blocked}`));await settle(reopened);
    assert.equal(calls.jobs.at(-1).args[0],`accepted-${blocked}`,'Accepted job restores even when storage is blocked');
    calls.jobs.at(-1).resolve(job(`accepted-${blocked}`));await settle(reopened);
    assert.equal(first.writesAfterUnmount,0);assert.equal(reopened.button('Render video').props.disabled,true);
    if(!blocked)assert.equal(values.get(`smartink:reveal:${scene}`),`accepted-${blocked}`);
    reopened.unmount();assert.equal(timers.size,0);
  }
  storageBlocked=false;
  {
    const build=deferred(),app=harness('close-before-dispatch',()=>build.promise);await ready(app);
    const count=calls.submits.length;app.button('Render video').props.onClick();app.unmount();build.resolve({contract:{},inkBlob:{}});await settle();
    assert.equal(calls.submits.length,count,'Unmount during local preparation does not create a job');assert.equal(app.writesAfterUnmount,0);
  }
  {
    const app=harness('late-capability'),cap=calls.capabilities.at(-1);app.unmount();cap.resolve({supported:true,message:''});await settle();assert.equal(app.writesAfterUnmount,0,'Late capability response cannot update unmounted UI');
  }
  // Failed restores keep submission gated until an explicit successful retry.
  {
    values.set('smartink:reveal:retry','recovery');const app=harness('retry');await ready(app);
    calls.jobs.at(-1).reject(Error('Offline'));await settle(app);
    assert.equal(app.button('Render video').props.disabled,true);assert.ok(app.button('Retry connection'));
    app.button('Retry connection').props.onClick();await settle(app);await ready(app);
    calls.jobs.at(-1).resolve(job('recovery','complete'));await settle(app);assert.equal(app.button('Render video').props.disabled,false);app.unmount();
  }
  // Poll failures back off and recover; terminal responses stop polling.
  {
    values.set('smartink:reveal:poll','running');const app=harness('poll');await ready(app);calls.jobs.at(-1).resolve(job('running'));await settle(app);
    assert.equal(runTimer(),1000);calls.jobs.at(-1).reject(Error('Network lost'));await settle(app);
    assert.ok(app.nodes().some(node=>node.props.role==='alert'&&node.props.children.includes('Retrying')));
    assert.equal(runTimer(),3000);calls.jobs.at(-1).resolve(job('running','complete'));await settle(app);
    assert.equal(timers.size,0);assert.equal(app.button('Render video').props.disabled,false);app.unmount();
  }
  // A server response that ignored abort must never undo a successful cancel.
  {
    values.set('smartink:reveal:cancel','cancelme');const app=harness('cancel');await ready(app);calls.jobs.at(-1).resolve(job('cancelme'));await settle(app);
    runTimer();const stale=calls.jobs.at(-1);app.button('Cancel video').props.onClick();app.button('Cancel video').props.onClick();await settle(app);
    assert.equal(calls.cancels.length,1,'Cancellation is locked synchronously too');calls.cancels.at(-1).resolve(job('cancelme','cancelled'));await settle(app);
    stale.resolve(job('cancelme','rendering'));await settle(app);
    assert.ok(app.nodes().some(node=>node.type==='p'&&node.props.children==='cancelme cancelled'));assert.equal(app.button('Cancel video'),undefined);assert.equal(timers.size,0);app.unmount();
  }
  console.log('Reveal lifecycle passed: restored-job gate, immediate submission/cancel locks, upload survives unmount, remount recovery with blocked storage, preparation cancellation, late-response guards, restore retry, polling backoff/completion, cancellation race.');
}finally{
  globalThis.localStorage=saved.storage;globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;delete globalThis.__revealHooks;delete globalThis.__revealServices;
}
