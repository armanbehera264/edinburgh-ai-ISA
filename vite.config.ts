import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { claudePlugin } from './server/claudePlugin.ts';

export default defineConfig(({ mode }) => {
  // Loaded server-side only (no VITE_ prefix), so the key is never bundled.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), claudePlugin(env.ANTHROPIC_API_KEY)],
    // Fixed port, and fail rather than drift onto another app's port.
    server: { host: '127.0.0.1', port: 5188, strictPort: true },
    preview: { host: '127.0.0.1', port: 5189, strictPort: true },
  };
});
