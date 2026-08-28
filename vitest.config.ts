import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    globals: false,
  },
})
