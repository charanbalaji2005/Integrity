import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // /api requests go to VITE_API_URL (local backend) when set, else the hosted backend.
  const apiTarget = env.VITE_API_URL || (mode === 'production' ? 'https://assessment-integrity-backend-0w4b.onrender.com' : 'http://localhost:3000')

  return {
  define: {
    __BUNDLED_DEV__: false,
  },
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith('https'),
      },
    },
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
