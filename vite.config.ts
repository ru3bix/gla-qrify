import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sw: 'public/sw.js'
      },
      output: {
        // Ensure service worker is output to the root
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'sw.js') {
            return 'sw.js';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  server: {
    // Configure dev server for PWA testing
    fs: {
      allow: ['..']
    }
  }
})