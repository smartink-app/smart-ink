import { useEffect } from 'react';
import { readTattooPng } from '../utils/tattooUpload';
import { rememberTattoo } from '../storage/tattooLibrary';
import { nativeArtworkFile, reportNativeStudio } from './nativeBridge';

/** Install only for an editable, authenticated project; navigation cancels imports. */
export function useNativeArtwork(enabled: boolean, projectId: string | undefined, choose: (source: string) => void): void {
  useEffect(() => {
    if (window.smartInkNativeHost !== true) return;
    reportNativeStudio(enabled && Boolean(projectId));
    if (!enabled || !projectId) return;
    const controller = new AbortController();
    let busy = false;
    const bridge = { async importArtwork(payload: unknown) {
      if (busy) throw new Error('An artwork import is already running.');
      busy = true;
      try {
        controller.signal.throwIfAborted();
        const file = nativeArtworkFile(payload);
        const source = await readTattooPng(file, controller.signal);
        controller.signal.throwIfAborted();
        await rememberTattoo(source, file.name);
        controller.signal.throwIfAborted();
        choose(source);
      } finally { busy = false; }
    } };
    window.smartInkNativeArtwork = bridge;
    return () => {
      controller.abort();
      if (window.smartInkNativeArtwork === bridge) delete window.smartInkNativeArtwork;
      reportNativeStudio(false);
    };
  }, [enabled, projectId, choose]);
}
