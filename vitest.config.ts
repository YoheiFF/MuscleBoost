import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

// 設計書1.3節には明記が無いが、"@/lib/calorie" 形式のパスエイリアスをテストからも
// 解決できるようにするため追加した（tsconfig.jsonのpathsと同一のエイリアス設定）。
export default defineConfig({
  test: {
    environment: "node",
    // QA指摘対応: Playwright専用のE2E specファイル（tests/e2e/**）をVitestが誤って
    // 収集し test.describe() エラーで落ちるため、Vitestの既存デフォルト除外パターン
    // (configDefaults.exclude: node_modules, dist, .git 等) に加えて明示的に除外する。
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
