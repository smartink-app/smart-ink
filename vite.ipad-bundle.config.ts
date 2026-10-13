import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

// Debug is an explicit local demo. Release keeps the existing invite/auth gate.
export default defineConfig(({ mode }) => mergeConfig(base, {
  define: mode === 'development' ? {
    'import.meta.env.DEV': 'true',
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify('demo'),
    'import.meta.env.VITE_RENDER_URL': JSON.stringify(''),
  } : {},
  build: { outDir: `native/ipad/Bundled/${mode === 'development' ? 'Debug' : 'Release'}/Web`, emptyOutDir: true },
}));
