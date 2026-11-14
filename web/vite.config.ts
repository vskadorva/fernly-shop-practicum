import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Cypress loads this file inside its config process (`process.title` is set
// before Vite starts). Component tests then start a second Vite server that
// inherits `server.port`. With both on 5173, the shop binds [::1] and Cypress
// binds 127.0.0.1. Chrome resolves localhost to IPv6 first, so the spec
// iframe fetches this file from the shop and gets index.html:
// "Failed to fetch dynamically imported module: .../component.tsx".
const isCypress = process.title === 'Cypress: Config Manager';

export default defineConfig({
  plugins: [react()],
  css: {
    modules: { generateScopedName: '[name]__[local]' },
  },
  server: {
    port: isCypress ? 5174 : 5173,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? 8100}`,
    },
  },
});
