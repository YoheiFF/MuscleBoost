---
project_id: "2026-09-15-0953-header-greeting-fix"
phase: engineering
---
# 実装ログ - 2026-09-15-0953-header-greeting-fix

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| src/components/Header.tsx | 編集 | ✅ | 「{userName} さん」の`<span>`表示行を削除 |
| src/app/page.tsx | 編集 | ✅ | `async`化し、DBから最新の`User.name`を取得して見出しに組み込み |
| tests/e2e/auth.spec.ts | 編集 | ✅ | トップ画面見出しアサーションを新文言に更新 |

## ファイル別詳細

### src/components/Header.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.1
- 実装内容: 22〜32行目付近の`<nav>`内から `<span className="text-gray-500">{userName} さん</span>` の1行のみを削除した。`HeaderProps`、`userName ? (...) : (...)` の三項分岐、分割代入引数、他のナビリンク（記録／マシン／プロフィール）、ログアウトフォームは変更していない。
- 設計との差異: なし。編集後の期待形（§3.1「編集後の期待形」）と完全一致することを目視確認済み。

### src/app/page.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.2
- 実装内容:
  - `import { getCurrentUserOrThrow } from "@/lib/session-guard";` と `import { prisma } from "@/lib/prisma";` を追加。
  - `TopPage` を `async function` 化。
  - `getCurrentUserOrThrow()` でログインユーザーの `id` を取得し、`prisma.user.findUnique({ where: { id: user.id } })` でDBから最新の `User` レコードを取得。
  - `greeting` 変数を導入し、`dbUser?.name` が truthy なら `` `${dbUser.name}さん、今日は何をしますか？` ``、そうでなければ `"今日は何をしますか？"` にフォールバックするロジックを実装。
  - `<h1 className="text-xl font-bold">{greeting}</h1>` に変更。
  - 2枚の導線カード（`workouts/new`・`workouts`へのリンク）のJSXは一切変更していない。
  - `getCurrentUserOrThrow()` / `prisma.user.findUnique` の例外はいずれもtry/catchせず、Next.js標準のエラー境界に伝播する実装のまま（設計書§3.2「エラー処理」通り）。
- 設計との差異: なし。設計書§3.2「編集後の期待形」と完全一致することを目視確認済み。既存の`src/app/profile/page.tsx`と同一の`getCurrentUserOrThrow`+`prisma.user.findUnique`パターンを踏襲。

### tests/e2e/auth.spec.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.3
- 実装内容: 「新規登録→自動ログイン→トップ画面表示」テスト内の見出しアサーションを `page.getByRole("heading", { name: "今日は何をしますか？" })` から `page.getByRole("heading", { name: "テストユーザーさん、今日は何をしますか？" })` に変更（12行目で入力する表示名「テストユーザー」に対応する新文言）。他のテスト（再ログイン、重複登録、誤パスワード、短パスワード、未ログインリダイレクト）はトップ画面見出しやヘッダーの「さん」表記をアサートしていないため変更していない。
- 設計との差異: なし。

## 全体サマリー
- 影響範囲: 3 ファイル
- 設計通り完了: 3 ファイル
- 部分完了・要相談: 0 ファイル
- 検証結果:
  - `npm run build`（`next build`）を実行し、TypeScriptの型チェック・ESLintを含めて成功を確認（既存の`jose`/Edge Runtime関連の警告のみで、本変更に起因するエラー・警告はなし）。全11ルートの生成に成功。
  - Playwright E2E（`npm run test:e2e`）およびVitest単体テスト（`npm run test`）は、開発用DB（ローカルSQLite/Turso）の起動・接続が必要なため本フェーズでは実行していない。QAフェーズでの実行を推奨。
- 次フェーズ（QA）への申し送り:
  - 詳細設計書§6のテスト観点T-01〜T-13を実施すること。特に以下を優先:
    - T-04（プロフィールで名前変更後、再ログイン不要で`/`の見出しに反映されること）: 本実装のコア価値（JWTセッションではなくDB直読み方式を採用した理由）。
    - T-08〜T-10（名前の境界値・特殊文字）。
  - `npm run test:e2e` の実行環境（DB接続・`.env`設定）をQAフェーズで用意し、`auth.spec.ts`の更新後アサーションを含めて全件成功することを確認すること。
  - `npm run test`（Vitest）に本変更で新規に失敗するテストがないことを確認すること（本変更が影響する既存のユニットテストは見当たらないが、念のため）。
