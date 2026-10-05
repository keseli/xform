// Tarayıcı senaryoları: npm run e2e. Vite sunucusu çalışmıyorsa Playwright başlatır.
// İlk kez: npx playwright install chromium
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Senaryolar uzun ve sıralı; aynı sunucuyu ve data/ klasörünü kullanır.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173/',
    browserName: 'chromium',
    viewport: { width: 1680, height: 1000 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
