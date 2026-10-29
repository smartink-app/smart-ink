import { defineConfig, loadEnv } from 'vite'
import { googleFeedbackBridge } from './integrations/google-feedback/localBridge'
import react from '@vitejs/plugin-react'

// Keep this experiment's render traffic separate from the active beta server.
const shootRenderTarget = `http://127.0.0.1:${process.env.FOCUS_RENDER_PORT || 4341}`

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), googleFeedbackBridge({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)],
  build: {
    rollupOptions: {
      output: {
        // three.js changes far less often than the app; keeping it in its own
        // chunk lets browsers keep it cached across deploys.
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0', // Allow connections from any IP
    // Honor PORT so a second dev server (e.g. a tool-driven preview) can coexist.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/video-jobs': shootRenderTarget,
      '/health': shootRenderTarget,
      '/sync-live': shootRenderTarget,
      '/render-v2': {
        target: shootRenderTarget,
        configure(proxy) {
          // The upload has finished before Blender renders. Forward a browser
          // disconnect during that wait so the server can stop its process.
          proxy.on('proxyReq', (proxyReq, _req, res) => {
            res.on('close', () => {
              if (!res.writableEnded) proxyReq.destroy();
            });
          });
        },
      },
    },
  },
}))
