import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev', port: 5173, reuseExistingServer: true, timeout: 60_000 },
    // production build served under /matharium/ like GitHub Pages (the service worker only exists in builds)
    {
      command: 'npx vite build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/matharium/',
      env: { BASE_PATH: '/matharium/' },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    { name: 'desktop', testIgnore: /(mobile|pwa)\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 } } },
    { name: 'mobile', testMatch: /mobile\.spec/, use: { ...devices['Pixel 7'] } },
    { name: 'pwa', testMatch: /pwa\.spec/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173/matharium/' } },
  ],
});
