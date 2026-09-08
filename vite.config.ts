import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      // Test output must never trigger dev HMR.
      ignored: ['**/test-results/**', '**/playwright-report/**'],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: 'bun' }),
    viteReact(),
  ],
})
