// scripts/dev-local.js
// ローカルSQLite(prisma/dev.db)に固定して `next dev` を起動する。
// 本番Turso DB（.envのデフォルト）へ誤接続しないための専用エントリポイント。
// 参照: .project/qa/2026-09-14-1651-profile-weight-height/test-report.md「発見した問題」
const { spawn } = require("node:child_process");
const path = require("node:path");

const localDbPath = path.join(__dirname, "..", "prisma", "dev.db").replace(/\\/g, "/");

const child = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    TURSO_DATABASE_URL: `file:${localDbPath}`,
    TURSO_AUTH_TOKEN: "",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
