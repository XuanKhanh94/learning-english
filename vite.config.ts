import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase-vendor'
            if (id.includes('antd')) return 'antd-vendor'
            if (id.includes('lucide-react')) return 'icons-vendor'
            return 'vendor'
          }

          // Component chunks
          if (id.includes('/components/Admin/')) return 'admin-components'
          if (id.includes('/components/Teacher/')) return 'teacher-components'
          if (id.includes('/components/Student/')) return 'student-components'
          if (id.includes('/components/Auth/')) return 'auth-components'
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    minify: 'esbuild', // tránh lỗi với terser, build nhanh hơn
  },
  server: {
    hmr: {
      overlay: false
    }
  }
})
