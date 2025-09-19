import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Tách React + React DOM
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          // Tách Firebase modules
          if (id.includes('node_modules/firebase')) {
            return 'firebase';
          }
          // Tách UI library
          if (id.includes('node_modules/lucide-react')) {
            return 'ui';
          }
          // Tách các thư viện khác (tùy ý)
          if (id.includes('node_modules')) {
            return 'lib';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['lucide-react']
  },
  server: {
    hmr: {
      overlay: false
    }
  }
});
