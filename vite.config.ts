import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Kayıt uçları eski sunucuyla ortak (bkz. scripts/api.mjs).
import { handleApi } from './scripts/api.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'xform-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          handleApi(req, res).then((handled) => handled || next(), next);
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Editör data/ dosyasını kendisi yazar; Vite'ın sayfayı yenilemesine gerek yok.
    watch: { ignored: ['**/data/**', '**/legacy/**', '**/content/**'] },
  },
  build: {
    rollupOptions: { input: { read: 'index.html', editor: 'editor.html' } },
  },
});
