import { defineConfig } from '@playwright/test'

const baseURL = 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
