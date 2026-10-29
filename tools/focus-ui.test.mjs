/** Production UI handlers under controlled hooks; no browser or remote account access. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
const root = process.cwd();
const landingSource = await fs.readFile('src/LandingPage.tsx','utf8');
const requestForm = landingSource.slice(landingSource.indexOf('const RequestAccessForm:'), landingSource.indexOf('const LandingPage:'));
let lazyId = 0;
globalThis.__focusLazy = () => `Lazy${lazyId++}`;
const stubNames = /^(\.\/)(beta-feedback\/BetaFeedback|beta-journey\/JourneyTracking|client\/ClientProjectSpace|artist\/ArtistPanel|discovery\/ArtistDiscovery|moodboard\/MoodboardPortal|AccountSettings|FocusDialog|TattooLibrary|RenderHistoryPage|TemplatePreviewRenderer|LandingPage|LoginPage|InvitePage|InviteCodeEntry|BetaAdminPage|Workspace|PublicDemo)$/;
const { outputFiles } = await build({
  stdin: { contents: `export {default as Dashboard} from './src/ScenesDashboard'; export {default as App} from './src/App'; export {default as Rail} from './src/StudioRail'; export {default as More} from './src/MoreControls'; export {ThemeRoot} from './src/Theme'; export {usePreference} from './src/usePreference'; export {RequestAccessForm} from 'focus-request-form';`, resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'focus-production-handlers', setup(b) {
    b.onResolve({filter:/^focus-request-form$/},()=>({path:'request',namespace:'request'}));
    b.onLoad({filter:/.*/,namespace:'request'},()=>({contents:`import {useState,useId} from 'react'; import {authMode,requestBetaAccess} from './src/auth/betaAuthService'; import {CONTACT_EMAIL,isWaitlistEndpointConfigured,submitWaitlistRequest} from './src/auth/waitlistSubmit'; export ${requestForm}`,loader:'tsx',resolveDir:root}));
    b.onResolve({filter:/\/auth\/waitlistSubmit$/},()=>({path:'delivery',namespace:'delivery'}));
    b.onLoad({filter:/.*/,namespace:'delivery'},()=>({contents:'export const CONTACT_EMAIL="",isWaitlistEndpointConfigured=()=>globalThis.__focusRequests.endpoint,submitWaitlistRequest=(...a)=>globalThis.__focusRequests.deliver(...a);'}));
    b.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, a => ({ path: a.path, namespace: 'hooks' }));
    b.onLoad({ filter: /.*/, namespace: 'hooks' }, a => ({ contents: a.path === 'react' ? `
      export const useState=v=>globalThis.__focusHooks.state(v),useRef=v=>globalThis.__focusHooks.ref(v),useEffect=(f,d)=>globalThis.__focusHooks.effect(f,d),useMemo=(f,d)=>globalThis.__focusHooks.memo(f,d),useCallback=(f,d)=>globalThis.__focusHooks.memo(()=>f,d),useId=()=>globalThis.__focusHooks.memo(()=>"focus-test",[]),useSyncExternalStore=(...a)=>globalThis.__focusHooks.external(...a),lazy=()=>globalThis.__focusLazy(),Suspense="Suspense"; export default {};
    ` : 'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="Fragment";' }));
    b.onResolve({ filter: /^react-icons\/fi$/ }, a => ({ path: a.path, namespace: 'icons' }));
    b.onLoad({ filter: /.*/, namespace: 'icons' }, () => ({ contents: 'export const FiSidebar="sidebar",FiMessageSquare="message",FiCompass="compass",FiUsers="users",FiCalendar="calendar",FiGrid="grid",FiEdit3="edit",FiImage="image",FiAperture="aperture",FiUser="user",FiMoon="moon",FiSun="sun",FiSearch="search",FiPlus="plus",FiArrowUpRight="arrow",FiEdit2="edit",FiTrash2="trash";' }));
    b.onResolve({ filter: stubNames }, a => ({ path: a.path.slice(2), namespace: 'component' }));
    b.onLoad({ filter: /.*/, namespace: 'component' }, a => ({ contents: `export default ${JSON.stringify(a.path)};` }));
    b.onResolve({ filter: /\/sceneStorage$/ }, () => ({ path: 'store', namespace: 'data' }));
    b.onResolve({ filter: /\/auth\/betaAuthService$/ }, () => ({ path: 'auth', namespace: 'data' }));
    b.onResolve({ filter: /\/auth\/useBetaAuth$/ }, () => ({ path: 'session', namespace: 'data' }));
    b.onLoad({ filter: /.*/, namespace: 'data' }, a => ({ contents: a.path === 'store'
      ? 'export const loadScenes=(...a)=>globalThis.__focusStore.load(...a),addScene=(...a)=>globalThis.__focusStore.add(...a),deleteScene=(...a)=>globalThis.__focusStore.remove(...a),updateScene=(...a)=>globalThis.__focusStore.update(...a);'
      : a.path === 'auth' ? 'export const authMode=()=>globalThis.__focusMode??"demo",requestBetaAccess=(...a)=>globalThis.__focusRequests.record(...a);' : 'export const useBetaAuth=()=>globalThis.__focusAuth;' }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = (value, result = []) => {
  if (Array.isArray(value)) value.forEach(item => nodes(item,result));
  else if (value && typeof value === 'object' && value.props) { result.push(value); nodes(value.props.children,result); }
  return result;
};
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
function harness(component, props = {}) {
  const slots = [], pending = []; let cursor = 0, tree;
  const changed = (a,b) => !a || !b || a.length !== b.length || a.some((v,i)=>v!==b[i]);
  const hooks = {
    state(initial) { const i=cursor++; slots[i]??={value:typeof initial==='function'?initial():initial}; return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}]; },
    ref(initial) { return slots[cursor++]??={current:initial}; },
    memo(fn,deps) { const i=cursor++; if(changed(slots[i]?.deps,deps)) slots[i]={value:fn(),deps}; return slots[i].value; },
    effect(fn,deps) { const i=cursor++; if(changed(slots[i]?.deps,deps)) pending.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};}); },
    external(subscribe,read) { const i=cursor++; slots[i]??={cleanup:subscribe(()=>{})}; return read(); },
  };
  const render=()=>{cursor=0;globalThis.__focusHooks=hooks;tree=component(props);pending.splice(0).forEach(fn=>fn());return nodes(tree);};
  return { render, get tree(){return tree;}, async settle(){for(let i=0;i<4;i++){await tick();render();}}, unmount(){slots.forEach(slot=>slot?.cleanup?.());}, button(label){const match=render().find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(match,`Button: ${label}`);return match;} };
}
const savedGlobals = new Map(['window','document','localStorage'].map(key=>[key,globalThis[key]]));
const events = new EventTarget(), storage = new Map(); let writesFail=false, readsFail=false;
globalThis.localStorage={getItem(key){if(readsFail)throw Error('blocked');return storage.get(key)??null;},setItem(key,value){if(writesFail)throw Error('quota');storage.set(key,value);}};
globalThis.document={documentElement:{dataset:{}},getElementById:()=>null};
globalThis.window={matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}}),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),confirm:()=>true,location:{href:'http://local/',search:''},history:{replaceState(_,__,url){window.location={href:new URL(url,'http://local/').href,search:new URL(url,'http://local/').search};}},setTimeout};
const session={email:'test@example.invalid',displayName:'Test artist',userId:'local-test',method:'email'};
try {
  // The beta always opens in dark mode, even with an old saved light preference.
  storage.set('smartink:focus:theme','light');
  const rootTheme=harness(api.ThemeRoot,{children:'app'});rootTheme.render();assert.equal(document.documentElement.dataset.theme,'dark');
  readsFail=true;const more=harness(api.More,{id:'tattoo',summary:'80% opacity',children:{type:'AdjustmentControl',props:{value:.8}}});
  let disclosure=more.render()[0];assert.equal(disclosure.props.open,false);assert.ok(text(disclosure).includes('80% opacity'));
  disclosure.props.onToggle({currentTarget:{open:true}});assert.equal(more.render()[0].props.open,true);
  more.render()[0].props.onToggle({currentTarget:{open:false}});assert.equal(more.render().find(n=>n.type==='AdjustmentControl').props.value,.8,'Closing disclosure preserves the actual adjustment child and value');
  more.unmount();const remounted=harness(api.More,{id:'tattoo',children:'controls'});assert.equal(remounted.render()[0].props.open,false);readsFail=false;
  rootTheme.unmount();remounted.unmount();

  const railCalls=[];const rail=harness(api.Rail,{active:'studio',onNavigate:id=>railCalls.push(id),onHome:()=>railCalls.push('home'),onExplore:()=>railCalls.push('explore'),studioAvailable:false});
  assert.equal(rail.button('Studio').props.disabled,true);
  for(const label of ['Projects','Artwork','Renders','Clients','Explore','Account'])rail.button(label).props.onClick();
  assert.deepEqual(railCalls,['projects','artwork','renders','artist','explore','account']);
  rail.unmount();

  // Creation waits for storage, cannot duplicate on double click, and keeps input on failure.
  let created=[],opened=[], resolveCreate, failCreate=false;
  globalThis.__focusStore={load:async()=>[],add:async scene=>{created.push(scene);if(failCreate)throw Error('Storage unavailable');await new Promise(resolve=>resolveCreate=resolve);},remove:async()=>{},update:async()=>{}};
  const dashboard=harness(api.Dashboard,{session,onSignOut:()=>{},onSelectScene:scene=>opened.push(scene)});
  dashboard.render();await dashboard.settle();assert.ok(!dashboard.render().some(n=>n.type==='FocusDialog'),'Templates do not crowd the project overview');
  dashboard.button('New project').props.onClick();assert.ok(dashboard.render().some(n=>n.type==='FocusDialog'));
  dashboard.render().find(n=>n.type==='input'&&n.props.placeholder?.startsWith('e.g.')).props.onChange({target:{value:'Rose sleeve'}});
  const create=dashboard.button('Create project');create.props.onClick();create.props.onClick();await dashboard.settle();assert.equal(created.length,1);assert.equal(opened.length,0);
  assert.equal(created[0].name,'Rose sleeve');assert.equal(created[0].studio.color,'#91857b');assert.equal(created[0].camera.fov,36);assert.ok(created[0].camera.position[0] > created[0].camera.target[0], 'Full-body introduction opens at an angle even before previews load');assert.ok(created[0].lights.every(light => light.color !== '#aaffee'), 'Introduction uses neutral fill');
  resolveCreate();await dashboard.settle();assert.equal(opened.length,1);dashboard.unmount();

  created=[];opened=[];failCreate=true;
  const library=harness(api.Dashboard,{session,onSignOut:()=>{},onSelectScene:scene=>opened.push(scene)});library.render();await library.settle();
  library.render().find(n=>n.type===api.Rail).props.onNavigate('artwork');
  library.render().find(n=>n.type==='TattooLibrary').props.onChoose('data:image/png;base64,sample');
  library.button('Create project').props.onClick();await library.settle();assert.ok(text(library.tree).includes('Storage unavailable'));assert.equal(opened.length,0);assert.ok(library.render().some(n=>n.type==='FocusDialog'));
  failCreate=false;library.button('Create project').props.onClick();await library.settle();assert.equal(created.at(-1).decalImage,'data:image/png;base64,sample','Retry keeps chosen artwork');resolveCreate();await library.settle();assert.equal(opened.length,1);library.unmount();

  // Search real saved names, recover from no matches, and navigate renders as a page.
  globalThis.__focusStore.load=async()=>[
    {id:'rose',name:'Beta rose study',createdAt:1,updatedAt:1},
    {id:'moth',name:'Lunar moth',createdAt:2,updatedAt:2}
  ];
  const searchDashboard=harness(api.Dashboard,{session,onSignOut:()=>{},onSelectScene:()=>{}});
  searchDashboard.render();await searchDashboard.settle();
  const searchInput=()=>searchDashboard.render().find(n=>n.type==='input'&&n.props['aria-label']==='Search projects');
  searchInput().props.onChange({target:{value:' ROSE beta '}});
  searchDashboard.render();assert.ok(text(searchDashboard.tree).includes('1 of 2 projects'));
  assert.ok(!text(searchDashboard.tree).includes('Lunar moth'));
  searchInput().props.onChange({target:{value:'unmatched'}});searchDashboard.render();
  assert.ok(text(searchDashboard.tree).includes('No matching projects'));
  searchDashboard.button('Show all projects').props.onClick();searchDashboard.render();
  assert.ok(text(searchDashboard.tree).includes('Lunar moth'));
  searchDashboard.render().find(n=>n.type===api.Rail).props.onNavigate('renders');
  assert.ok(searchDashboard.render().some(n=>n.type==='RenderHistoryPage'));
  assert.ok(!searchDashboard.render().some(n=>n.type==='FocusDialog'));
  searchDashboard.render().find(n=>n.type==='RenderHistoryPage').props.onOpenStudio();
  searchDashboard.button('Start from a template').props.onClick();
  assert.equal(searchDashboard.render().find(n=>n.type==='input'&&n.props.placeholder?.startsWith('e.g.')).props.value,'Rose placement study');
  searchDashboard.unmount();

  // Private beta routing: old sample URLs and guessed app URLs cannot expose an editor.
  let authenticated=0;
  const auth={ready:true,session:null,accessError:null,setSession:()=>authenticated++,clearAccessError:()=>{},signOut:async()=>{}};
  globalThis.__focusAuth=auth;
  for(const search of ['', '?demo=1', '?app=1', '?studio=1']) {
    auth.session=null;window.location={href:`http://local/${search}`,search};
    const app=harness(api.App);app.render();await app.settle();
    assert.equal(app.tree.type,'LandingPage',`${search || '/'} requires approved access`);
    assert.equal(app.tree.props.onTryDemo,undefined,'Marketing cannot open a public editor');
    assert.ok(!app.render().some(n=>n.type==='Lazy0'));assert.equal(authenticated,0);app.unmount();
  }
  // Existing invite acceptance and operator paths remain available, not the workspace.
  auth.session=null;window.location={href:'http://local/?view=artists',search:'?view=artists'};
  const discover=harness(api.App);discover.render();await discover.settle();
  assert.ok(discover.render().some(n=>n.type==='Lazy1'),'Public discovery is available without studio access');
  assert.ok(!discover.render().some(n=>n.type==='Lazy0'),'Public discovery must not expose the editor');
  discover.render().find(n=>n.type==='Lazy1').props.onStudio();await discover.settle();
  assert.equal(discover.tree.type,'LoginPage','Artist login from discovery still requires approval');discover.unmount();
  for(const [search,expected] of [['?invite=ABC123','InvitePage'], ['?admin=1','BetaAdminPage']]) {
    window.location={href:`http://local/${search}`,search};const gate=harness(api.App);gate.render();await gate.settle();assert.equal(gate.tree.type,expected);assert.ok(!gate.render().some(n=>n.type==='Lazy0'));gate.unmount();
  }
  // Moodboards require an approved session, and do not load the editor.
  window.location={href:'http://local/?view=moodboard',search:'?view=moodboard'};
  const boardGate=harness(api.App);boardGate.render();await boardGate.settle();assert.equal(boardGate.tree.type,'LoginPage');
  assert.ok(!boardGate.render().some(n=>n.type==='Lazy2'));boardGate.unmount();
  auth.session=session;const boards=harness(api.App);boards.render();await boards.settle();
  assert.ok(boards.render().some(n=>n.type==='Lazy2'));assert.ok(!boards.render().some(n=>n.type==='Lazy0'));
  auth.session=null;await boards.settle();assert.equal(boards.tree.type,'LoginPage','Session loss closes private moodboards');boards.unmount();
  // Direct client spaces preserve approved access and the intended destination after login.
  window.location={href:'http://local/?view=client',search:'?view=client'};
  auth.session=null; const clientGate=harness(api.App);clientGate.render();await clientGate.settle();
  assert.equal(clientGate.tree.type,'LoginPage'); assert.ok(!clientGate.render().some(n=>n.type==='Lazy0'));
  clientGate.tree.props.onAuthenticated(session);auth.session=session;await clientGate.settle();
  assert.equal(clientGate.render().find(n=>n.type==='Lazy0').props.initialSection,'client');
  auth.session=null;await clientGate.settle();assert.equal(clientGate.tree.type,'LoginPage');clientGate.unmount();
  // Client links enter review through their own callback, never through the editing callback.
  let reviewCalls=[];const hub=harness(api.Dashboard,{session,onSignOut:()=>{},onSelectScene:()=>assert.fail('Must not open editing'),initialSection:'client',initialClientProject:'booking-one',initialVersionId:'version-one',onReviewScene:(...args)=>reviewCalls.push(args)});
  hub.render();await hub.settle();const clientUI=hub.render().find(n=>n.type==='client/ClientProjectSpace');
  assert.ok(clientUI); assert.equal(clientUI.props.initialVersionId,'version-one');
  clientUI.props.onDirtyChange(true);window.confirm=()=>false;
  hub.render().find(n=>n.type===api.Rail).props.onNavigate('artist');
  assert.ok(hub.render().some(n=>n.type==='client/ClientProjectSpace'),'Declining navigation keeps the client draft mounted');
  window.confirm=()=>true;clientUI.props.onDirtyChange(false);
  clientUI.props.onReview({id:'shared-scene'},'booking-one','client');
  assert.deepEqual(reviewCalls,[[{id:'shared-scene'},'booking-one','client']]);
  clientUI.props.onReview({id:'design-version:booking-one:version-one'},'booking-one','client','version-one');
  assert.deepEqual(reviewCalls.at(-1),[{id:'design-version:booking-one:version-one'},'booking-one','client','version-one']);
  clientUI.props.onDesk('booking-one');assert.equal(hub.render().find(n=>n.type==='artist/ArtistPanel').props.initialBookingId,'booking-one');hub.unmount();
  // An approved session opens the full workspace; session loss closes it again.
  auth.session=session;window.location={href:'http://local/',search:''};
  const member=harness(api.App);member.render();await member.settle();assert.ok(member.render().some(n=>n.type==='Lazy0'));
  auth.session=null;await member.settle();assert.equal(member.tree.type,'LandingPage','Revoked/signed-out session cannot retain the studio');member.unmount();
  // A rejected OAuth session returns to sign-in with its existing access reason.
  auth.accessError='You are on the waitlist';const pending=harness(api.App);pending.render();await pending.settle();assert.equal(pending.tree.type,'LoginPage');assert.equal(pending.tree.props.notice,auth.accessError);pending.unmount();auth.accessError=null;

  // A local waitlist entry must not turn a failed remote delivery into success.
  let deliveries=0, deliveryFails=true;
  globalThis.__focusRequests={endpoint:true,record:async()=>({already:true,status:'waitlisted'}),deliver:async()=>{deliveries++;if(deliveryFails)throw Error('offline');}};
  const form=harness(api.RequestAccessForm,{source:'test',buttonLabel:'Request invite'});
  form.render().find(n=>n.type==='input').props.onChange({target:{value:'artist@example.invalid'}});
  const savedError=console.error;console.error=()=>{};
  try { await form.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}}); } finally { console.error=savedError; }
  assert.equal(deliveries,1);
  assert.ok(text(form.render().find(n=>n.type==='p')).includes('Please try again'));
  deliveryFails=false;await form.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(deliveries,2,'An already-local request retries actual delivery');assert.ok(text(form.render().find(n=>n.type==='p')).includes('on the list'));form.unmount();
  globalThis.__focusRequests.endpoint=false;
  const localForm=harness(api.RequestAccessForm,{source:'test',buttonLabel:'Request invite'});localForm.render().find(n=>n.type==='input').props.onChange({target:{value:'artist@example.invalid'}});
  await localForm.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.ok(text(localForm.render().find(n=>n.type==='p')).includes('No email was sent'));assert.equal(deliveries,2);localForm.unmount();
  globalThis.__focusMode='supabase';globalThis.__focusRequests.endpoint=true;
  const hostedForm=harness(api.RequestAccessForm,{source:'test',buttonLabel:'Request invite'});await hostedForm.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(deliveries,2,'Hosted waitlist does not submit to a second endpoint');hostedForm.unmount();delete globalThis.__focusMode;

  // A misconfigured deployment cannot say it received a request in localStorage.
  globalThis.__focusMode='unconfigured';globalThis.__focusRequests.endpoint=false;
  let recordedUnconfigured=0;const previousRecord=globalThis.__focusRequests.record;globalThis.__focusRequests.record=async()=>{recordedUnconfigured++;return {already:false,status:'waitlisted'};};
  const unavailable=harness(api.RequestAccessForm,{source:'test',buttonLabel:'Request invite'});await unavailable.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  unavailable.render();assert.equal(recordedUnconfigured,0);assert.ok(text(unavailable.tree).includes('temporarily unavailable'));unavailable.unmount();globalThis.__focusRequests.record=previousRecord;delete globalThis.__focusMode;

  // Marketing may load the requested hero visualizer, but never the working studio.
  const landingBuild=await build({entryPoints:['src/LandingPage.tsx'],outdir:'/tmp/focus-landing-audit',bundle:true,write:false,metafile:true,format:'esm',platform:'browser',logLevel:'silent'});
  for(const name of Object.keys(landingBuild.metafile.inputs))assert.doesNotMatch(name,/src\/(PublicDemo|Workspace|ModelWithUVTattoo)/,`Public marketing must not include the working editor: ${name}`);
  assert.doesNotMatch(await fs.readFile('src/App.tsx','utf8'),/import\(['"]\.\/PublicDemo['"]\)/,'The old sample editor is absent from the app entry graph');
  const css=await fs.readFile('src/focus-studio.css','utf8');assert.ok(css.includes('[hidden] { display: none !important; }'),'Hidden advanced/tab panels must win against flex rules');
  console.log('Focus UI passed: dark beta theme, storage failure, persistent disclosure/value retention, rail navigation, async/double-click project creation, library-to-project/retry, private routing and legacy URLs, invite/admin gate preservation, rejected/lost sessions, waitlist delivery failure/retry and an isolated marketing dependency graph.');
} finally {
  for(const [key,value] of savedGlobals){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  for(const key of ['__focusHooks','__focusLazy','__focusStore','__focusAuth','__focusRequests','__focusMode'])delete globalThis[key];
}
