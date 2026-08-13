import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['local.kensauto.ca'],
  },
  logLevel: 'error', // Suppress warnings, only show errors
  resolve: {
    // Was previously provided implicitly by @base44/vite-plugin (removed, Phase 15) -
    // matches jsconfig.json's "@/*": ["./src/*"] mapping, now made explicit here since
    // that file only affects the editor/type-checker, not the actual Vite/Rollup bundler.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    basicSsl(),
    react(),
  ]
});