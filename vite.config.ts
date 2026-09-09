import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      // Test output and agent workspace dirs must never trigger dev HMR.
      ignored: [
        '**/test-results/**',
        '**/playwright-report/**',
        '**/.superpowers/**',
        '**/.agents/**',
      ],
    },
  },
  optimizeDeps: {
    // Pre-bundle the TanStack Start client entry so Vite never needs to
    // re-optimize it mid-session (which causes "Failed to fetch dynamically
    // imported module" crashes in the browser).
    include: [
      '@tanstack/react-start/client',
      '@tanstack/react-router',
      'react',
      'react-dom',
    ],
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
