import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

// Separate preview leaves :4320 and its running render service untouched.
// Proxy through the Mac so an iPad never requests its own 127.0.0.1.
export default mergeConfig(base, defineConfig({
  define: {
    'import.meta.env.VITE_RENDER_URL': JSON.stringify(''),
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify('demo'),
  },
  server: {
    host: '127.0.0.1', port: 4322, strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:4321',
      '/render-v2': { target: 'http://127.0.0.1:4321' },
      '/sync-live': 'http://127.0.0.1:4321',
      '/video-jobs': 'http://127.0.0.1:4321',
    },
  },
}));
