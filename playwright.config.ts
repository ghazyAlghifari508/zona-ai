import { defineConfig } from '@playwright/test'
import 'dotenv/config'

const baseURL = 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  use: { baseURL },
  workers: 2,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'tablet',
      use: { browserName: 'chromium', viewport: { width: 768, height: 800 } },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 },
        isMobile: true,
      },
    },
  ],
})
