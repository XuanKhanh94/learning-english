import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Tách React + React DOM ra chunk riêng
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          // Tách lucide-react ra chunk riêng
          if (id.includes('node_modules/lucide-react')) {
            return 'ui';
          }
          // Các node_modules khác gom chung chunk 'lib'
          if (id.includes('node_modules')) {
            return 'lib';
          }
          // Các file khác để theo chunk mặc định
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['lucide-react'] // lucide-react sẽ được xử lý qua manualChunks
  },
  server: {
    hmr: {
      overlay: false
    }
  }
});
