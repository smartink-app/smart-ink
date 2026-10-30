import assert from 'node:assert/strict';
import { build } from 'esbuild';
for (const dev of [true, false]) {
  const result = await build({entryPoints:['src/auth/localDebug.ts'],bundle:true,write:false,format:'esm',define:{'import.meta.env.DEV':String(dev)}});
  const {localDebugEnabled} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const hostname of ['localhost','127.0.0.1','[::1]','beta.smartink.app']) {
    for (const search of ['', '?debug=1', '?debug=0']) {
      globalThis.window={location:{hostname,search}};
      for (const mode of ['demo','supabase','unconfigured']) {
        assert.equal(localDebugEnabled(mode),dev && mode==='demo' && hostname!=='beta.smartink.app' && search==='?debug=1');
      }
    }
  }
  delete globalThis.window;
  assert.equal(localDebugEnabled('demo'),false);
}
console.log('Local debug: explicit opt-in, loopback only, development only, demo only.');
