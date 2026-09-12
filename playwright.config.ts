import { defineConfig } from "@playwright/test";

// 設計書1.3節には明記が無いが、Playwright実行に必須の設定ファイルのため追加した。
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
