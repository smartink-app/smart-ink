import { useCallback, useEffect, useState } from 'react';
import { flushFeedback, pendingFeedback } from './delivery';
export default function DeliveryStatus({owner}:{owner:string}) {
  const [count,setCount]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const retry=useCallback(async()=>{setBusy(true);try{await flushFeedback(owner);setError('');setCount(pendingFeedback(owner).length);}catch(e){setError(String(e));}finally{setBusy(false);}},[owner]);
  useEffect(()=>{
    const check=()=>{try{setCount(pendingFeedback(owner).length);}catch(e){setError(String(e));}};
    check(); void retry(); const timer=window.setInterval(check,2000);
    const online=()=>{void retry();};window.addEventListener('online',online);
    return()=>{clearInterval(timer);window.removeEventListener('online',online);};
  },[owner,retry]);
  if(!count && !error) return null;
  return <div className="beta-banner" role="status">{count} feedback submissions waiting for confirmation. {error && 'Delivery is unavailable; your queued submissions remain on this device.'} <button disabled={busy} onClick={()=>void retry()}>{busy?'Sending…':'Retry delivery'}</button></div>;
}
