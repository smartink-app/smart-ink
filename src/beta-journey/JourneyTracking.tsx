import {useEffect} from 'react';
import type {BetaSession} from '../auth/types';
import {recordJourney,retryJourneyExport} from './tracking';
export default function JourneyTracking({session}:{session:BetaSession}) {
  useEffect(()=>{
    const record=()=>{retryJourneyExport(session.userId||session.email,session.email);if(document.visibilityState==='hidden')return;void recordJourney(session.userId||session.email,session.email,'verified_signin');void recordJourney(session.userId||session.email,session.email,'visit');};
    record();window.addEventListener('online',record);
    return()=>window.removeEventListener('online',record);
  },[session.userId,session.email]);
  return null;
}
