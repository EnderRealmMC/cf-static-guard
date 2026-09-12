import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  base: '/admin/',
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
  server: {
    port: 5174,
    proxy: {
      '/admin': 'http://127.0.0.1:8787',
      '/auth': 'http://127.0.0.1:8787',
      '/ui-config': 'http://127.0.0.1:8787',
    },
  },
});
