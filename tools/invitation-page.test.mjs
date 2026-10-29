import assert from 'node:assert/strict';
import {build} from 'esbuild';
let states=[],cursor=0,effect=null,calls=[],entered=null;
let invite={code:'INVITE',email:'artist@example.com',expiresAt:Date.now()+86400000,redeemed:false};
globalThis.inviteHooks={state(v){const i=cursor++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},effect(fn){if(!effect)effect=fn;}};
globalThis.inviteApi={get:async()=>invite,send:async(...args)=>{calls.push(['send',...args]);return {};},verify:async(...args)=>{calls.push(['verify',...args]);return {email:args[0]};}};
const result=await build({entryPoints:['src/InvitePage.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',plugins:[{name:'mock',setup(b){
b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'react'}));
b.onLoad({filter:/.*/,namespace:'react'},a=>({contents:a.path==='react'?'export const useState=v=>globalThis.inviteHooks.state(v),useEffect=f=>globalThis.inviteHooks.effect(f);':'export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment="Fragment";'}));
b.onResolve({filter:/auth\/betaAuthService$/},()=>({path:'auth',namespace:'auth'}));
b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:'export const authMode=()=>"supabase",getInvite=()=>globalThis.inviteApi.get(),requestEmailCode=(...args)=>globalThis.inviteApi.send(...args),verifyEmailCode=(...args)=>globalThis.inviteApi.verify(...args),signInWithGoogle=async()=>null;'}));
}}]});
const {default:Page}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const nodes=x=>Array.isArray(x)?x.flatMap(nodes):x?.props?[x,...nodes(x.props.children)]:[];
const text=x=>Array.isArray(x)?x.map(text).join(''):x?.props?text(x.props.children):x??'';
let logins=0;
const render=()=>{cursor=0;return Page({code:'INVITE',onAuthenticated:s=>entered=s,onBack(){},onLogin(){logins++;}});};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let tree=render();effect();await settle();tree=render();
assert.equal(nodes(tree).find(n=>n.props.id==='invite-email').props.readOnly,true);
assert.equal(nodes(tree).some(n=>n.props.id==='invite-otp'),false);
assert.match(text(tree),/Continue with Google/);
assert.equal(nodes(tree).some(n=>n.type==='button'&&text(n)==='Accept invite'),false);
nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();tree=render();
assert.deepEqual(calls,[['send','artist@example.com','INVITE']]);
assert.ok(nodes(tree).find(n=>n.props.id==='invite-otp'));
nodes(tree).find(n=>n.props.id==='invite-otp').props.onChange({target:{value:'123456'}});tree=render();
nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();
assert.equal(entered.email,'artist@example.com');assert.deepEqual(calls[1],['verify','artist@example.com','123456','INVITE']);
for(const update of [{redeemed:true},{redeemed:false,expiresAt:1}]){
 invite={...invite,...update};states=[];effect=null;render();effect();await settle();tree=render();
 assert.equal(nodes(tree).some(n=>n.type==='form'),false);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Go to sign in').props.onClick();
}
assert.equal(logins,2);
console.log('Invitation page passed: direct sign-in, reserved recipient, progressive OTP, studio entry, used/expired recovery.');
