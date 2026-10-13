import { useEffect, useRef, useState } from 'react';
import { REVEAL_PRESETS, type RevealPreset } from './render/reveal';
import type { SnapshotShot } from './render/snapshot';
import { getRevealCapabilities, submitReveal, getRevealJob, cancelReveal, revealOutputUrl, type RevealCapabilities, type RevealJob } from './services/revealRenderService';
// A dispatched render survives closing/reopening the panel. Remember the result
// before touching React state, including when localStorage is unavailable.
const submittedIds = new Map<string, string>();
const pendingSubmissions = new Map<string, Promise<RevealJob | null>>();
const activeJob = (job: RevealJob | null) => !!job && ['preparing', 'rendering', 'encoding'].includes(job.status);
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
function rememberJob(key: string, id: string) {
  submittedIds.set(key, id);
  try { localStorage.setItem(key, id); } catch { /* In-memory recovery remains available this session. */ }
}
function rememberedJob(key: string) {
  const memory = submittedIds.get(key);
  if (memory) return memory;
  try { return localStorage.getItem(key); } catch { return null; }
}
interface PanelRun { key: string; active: boolean; ready: boolean; submitting: boolean; cancelling: boolean; revision: number; job: RevealJob | null }

export default function RevealPanel({sceneKey,buildShot,onPreview,previewing,hasTattoo}: {
  sceneKey:string;buildShot:()=>Promise<SnapshotShot>;onPreview:(preset:RevealPreset|null)=>void;previewing:boolean;hasTattoo:boolean;
}) {
  const storageKey=`smartink:reveal:${sceneKey}`;
  const [preset,setPreset]=useState<RevealPreset>('reveal');
  const [capability,setCapability]=useState<RevealCapabilities|null>(null);
  const [job,setJob]=useState<RevealJob|null>(null);
  const [preparing,setPreparing]=useState(false);
  const [restoring,setRestoring]=useState(true);
  const [restoreFailed,setRestoreFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  const [cancelling,setCancelling]=useState(false);
  const [error,setError]=useState('');
  const lifecycle=useRef<PanelRun|null>(null);
  const busy=preparing||activeJob(job);
  useEffect(()=>{
    const controller=new AbortController();
    const run:PanelRun={key:storageKey,active:true,ready:false,submitting:false,cancelling:false,revision:0,job:null};
    lifecycle.current=run;
    const current=()=>run.active&&lifecycle.current===run&&!controller.signal.aborted;
    setRestoring(true);setRestoreFailed(false);setCapability(null);setJob(null);setPreparing(false);setCancelling(false);setError('');
    const restore=async()=>{
      try {
        const value=await getRevealCapabilities(controller.signal);
        if(!current())return;
        setCapability(value);
        if(value.supported){
          // A previous panel may still be uploading. Wait for its job ID rather
          // than reading an older ID and accidentally allowing a second render.
          const pending=pendingSubmissions.get(storageKey);
          if(pending){
            try {await pending;} catch(e){if(current())setError(message(e,'Could not start the previous clip.'));}
            if(!current())return;
          }
          const id=rememberedJob(storageKey);
          if(id){
            try {
              const restored=await getRevealJob(id,controller.signal);
              if(!current())return;
              run.job=restored;setJob(restored);
            } catch(e){
              if(!current())return;
              if(message(e,'')==='Motion job not found.'){
                submittedIds.delete(storageKey);
                try{localStorage.removeItem(storageKey);}catch{/* Optional storage. */}
                setError('The previous clip is no longer on this renderer. You can create another.');
              }else throw e;
            }
          }
        }
        if(!current())return;
        run.ready=true;setRestoring(false);
      }catch(e){
        if(!current())return;
        setError(message(e,'Could not reconnect to the previous clip.'));
        setRestoring(false);setRestoreFailed(true);
      }
    };
    void restore();
    return()=>{run.active=false;controller.abort();};
  },[storageKey,retry]);
  const jobId=job?.id, jobStatus=job?.status;
  useEffect(()=>{
    const run=lifecycle.current;
    if(!run||run.key!==storageKey||!jobId||!activeJob(run.job))return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined, failures=0;
    const current=()=>run.active&&lifecycle.current===run&&!controller.signal.aborted&&run.job?.id===jobId;
    const poll=async()=>{
      if(!current())return;
      const revision=run.revision;
      try {
        const next=await getRevealJob(jobId,controller.signal);
        if(!current())return;
        // An older poll must not revert the result of a cancellation request.
        if(revision===run.revision&&!run.cancelling){run.job=next;setJob(next);setError('');}
        failures=0;
      }catch(e){
        if(!current())return;
        failures++;
        setError(`${message(e,'Connection lost.')} Retrying…`);
      }
      if(current()&&activeJob(run.job))timer=setTimeout(poll,Math.min(10000,1500*2**failures));
    };
    timer=setTimeout(poll,1000);
    return()=>{controller.abort();if(timer!==undefined)clearTimeout(timer);};
  },[jobId,jobStatus,storageKey]);
  const render=async()=>{
    const run=lifecycle.current;
    if(!run||run.key!==storageKey||!run.active||!run.ready||run.submitting||activeJob(run.job)||pendingSubmissions.has(storageKey)||previewing||!hasTattoo||!capability?.supported)return;
    // This lock is immediate, before React commits the disabled button.
    run.submitting=true;
    const current=()=>run.active&&lifecycle.current===run;
    setPreparing(true);setError('');onPreview(null);
    const submission=(async()=>{
      const shot=await buildShot();
      if(!current())return null; // Closing during preparation need not submit.
      // Once dispatched, deliberately do not attach the panel's abort signal:
      // the server may accept it even if the UI goes away during the upload.
      const next=await submitReveal(shot.contract,shot.inkBlob,preset);
      rememberJob(storageKey,next.id);
      return next;
    })();
    pendingSubmissions.set(storageKey,submission);
    try {
      const next=await submission;
      if(current()&&next){run.job=next;setJob(next);}
    }catch(e){if(current())setError(message(e,'Could not start the clip.'));}
    finally{
      if(pendingSubmissions.get(storageKey)===submission)pendingSubmissions.delete(storageKey);
      run.submitting=false;
      if(current())setPreparing(false);
    }
  };
  const cancel=async()=>{
    const run=lifecycle.current;
    if(!run||!run.active||run.key!==storageKey||!run.job||!activeJob(run.job)||run.cancelling)return;
    const id=run.job.id;
    run.cancelling=true;run.revision++;setCancelling(true);
    const current=()=>run.active&&lifecycle.current===run&&run.job?.id===id;
    try{const next=await cancelReveal(id);if(current()){run.job=next;setJob(next);setError('');}}
    catch(e){if(current())setError(message(e,'Cancellation could not be confirmed.'));}
    finally{run.cancelling=false;if(current())setCancelling(false);}
  };
  return <section className="reveal-panel" aria-label="Tattoo reveal video">
    <strong>A little movement. All about the ink.</strong>
    <p>A four-second camera move with your current model, lights and framing.</p>
    <div className="reveal-options">{REVEAL_PRESETS.map(p=><button type="button" className="snapshot-button" key={p.id} disabled={busy||previewing} aria-pressed={preset===p.id} onClick={()=>setPreset(p.id)}><strong>{p.name}</strong><small>{p.description}</small></button>)}</div>
    {!hasTattoo&&<p>Place a visible tattoo before creating a reveal.</p>}
    <div className="reveal-actions">
      <button type="button" className="snapshot-button" disabled={busy||!hasTattoo} onClick={()=>onPreview(previewing?null:preset)}>{previewing?'Stop preview':'Preview movement'}</button>
      <button type="button" className="snapshot-button snapshot-button--primary" disabled={busy||restoring||restoreFailed||previewing||!hasTattoo||!capability?.supported} onClick={()=>void render()}>Render video</button>
    </div>
    <p>{restoring?'Checking the renderer and previous clip…':capability?.supported?'MP4 · 4 seconds · 24 fps · up to 1280 px. Video is a local beta test; rendering takes longer than a photo.':capability?.message??'Checking video renderer…'}</p>
    {job&&<div role="status"><p>{job.message}</p>{activeJob(job)&&<><progress max={job.totalFrames} value={job.frame}/><p>{job.frame} / {job.totalFrames} frames. You can return later to this shot.</p><button type="button" className="snapshot-button" disabled={cancelling} onClick={()=>void cancel()}>{cancelling?'Cancelling…':'Cancel video'}</button></>}</div>}
    {preparing&&<p role="status">Preparing the tattoo and scene…</p>}
    {error&&<p role="alert">{error}</p>}
    {restoreFailed&&<button type="button" className="snapshot-button" onClick={()=>setRetry(value=>value+1)}>Retry connection</button>}
    {job?.status==='complete'&&<><video key={job.id} src={revealOutputUrl(job.id)} controls playsInline preload="metadata"/><a className="snapshot-button" href={revealOutputUrl(job.id)} download="smart-ink-reveal.mp4">Download video</a><p>This clip keeps the camera and model from when you started its render.</p></>}
  </section>;
}
