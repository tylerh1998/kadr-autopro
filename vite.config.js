import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/base44-proxy',
        changeOrigin: true,
        headers: {
          'Origin': 'https://hbcrwkmgsazqrvsrmxyr.supabase.co',
          'Referer': 'https://hbcrwkmgsazqrvsrmxyr.supabase.co'
        }
      }
    }
  },
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: true
    }),
    react(),
  ]
});