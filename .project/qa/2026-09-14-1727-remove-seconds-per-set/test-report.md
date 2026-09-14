---
project_id: "2026-09-14-1727-remove-seconds-per-set"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-14-1727-remove-seconds-per-set

## 総合判定

**pass。** 詳細設計書（`detailed-design.md`）記載の3ファイルの編集内容は、実装（work-log記載どおり）と1行単位で完全一致していることを実ファイル読み合わせで確認した。`estimateDurationMinutes` / `secondsPerSet` の識別子はコードベース全体（`src/`, `tests/`）から0件。型チェック・本番ビルド・単体テスト（Vitest 25件）はいずれも成功。

手順5「ローカルSQLite固定devサーバーでの実機ブラウザ確認」は、途中で以下2つの環境上のトラブルに遭遇し一時中断したが、いずれも解消し、最終的にQA自身の手で実機確認を完了した（詳細は「発見した問題」参照）。
1. ポート3000サーバーのDB接続先についての誤検知（QAの調査不足によるもの。PM指摘を受け独立に再調査し誤検知と判明・撤回）
2. QAが実行した`npm run build`によるdevサーバーの`.next`共有ディレクトリ汚染（PMが該当プロセスを全停止→`.next`ごと削除→`npm run dev:local`で再起動し解消）

devサーバー復旧後、QA自身がブラウザで`/workouts/new`からセッションを作成し、記録追加フォームを開いて以下を確認した。
- 「1セットあたり秒数（任意）」入力欄・「セット数×秒数から時間を計算」ボタンは**画面上に一切存在しない**（表示項目は「マシン / セット数 / レップ数 / 運動時間（分）/ 重さ（任意）/ 単位」のみ）
- 「運動時間（分）」欄に直接数値（20）を入力し、マシン（チェストプレス）・セット数（3）・レップ数（10）とあわせて送信したところ、**記録が正常に保存され**、記録一覧に「チェストプレス 3セット × 10レップ / 20分 159.8 kcal」と表示され、合計消費カロリーも159.8 kcalに更新された

なお、PM側でも同様の手順でブラウザ実機確認が行われ（`/workouts/new`→セッション作成→フォーム表示項目確認）、QAの確認結果と一致している。

## テスト観点別結果

| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | `WorkoutLogForm.tsx` L7 import削除 | 静的検証 | ✅ pass | `@/lib/calorie` からのimportがファイル内に存在しない |
| 2 | `WorkoutLogForm.tsx` `secondsPerSet` state削除 | 静的検証 | ✅ pass | `useState`宣言含め0件 |
| 3 | `WorkoutLogForm.tsx` `handleEstimateDuration`削除 | 静的検証 | ✅ pass | 関数・コメントとも削除済み、`handleSubmit`が直下に続く |
| 4 | `WorkoutLogForm.tsx` リセット処理内`setSecondsPerSet("")`削除 | 静的検証 | ✅ pass | L56-61のリセット処理に対象行なし |
| 5 | `WorkoutLogForm.tsx` JSXブロック削除（秒数入力欄・計算ボタン） | 静的検証 | ✅ pass | 「セット数・レップ数」グリッドの直後が「運動時間（分）」ブロックに直結、余剰divなし |
| 6 | `WorkoutLogForm.tsx` `durationMinutes`欄・`fieldErrors.durationMinutes`表示が無変更で残存 | 静的検証 | ✅ pass | L116-129、ロジック変更なし |
| 7 | `calorie.ts` `estimateDurationMinutes`関数削除 | 静的検証 | ✅ pass | JSDoc含め削除、ファイルは`calculateCalories`で終わる |
| 8 | `calorie.ts` `calculateCalories`等の無変更確認 | 静的検証 | ✅ pass | `CALORIE_CORRECTION_FACTOR`, `CalorieCalcInput`, `calculateCalories`とも設計書通り無変更 |
| 9 | `calorie.test.ts` import修正・`estimateDurationMinutes`ブロック削除 | 静的検証 | ✅ pass | import文・describeブロックとも設計書通り |
| 10 | `calorie.test.ts` `calculateCalories`ブロック無変更 | 静的検証 | ✅ pass | 9ケースとも変更なし |
| 11 | コードベース全体でのgrep確認（0件） | 静的検証 | ✅ pass | `grep -rn "estimateDurationMinutes\|secondsPerSet" src/ tests/` → 0件 |
| 12 | 型チェック（`tsc --noEmit`） | 自動テスト | ✅ pass | エラーなし |
| 13 | 本番ビルド（`npm run build`） | 自動テスト | ✅ pass | `✓ Compiled successfully`、11ルート生成成功 |
| 14 | 単体テスト（`npm run test` / Vitest） | 自動テスト | ✅ pass | 3 files / 25 tests 全件pass（calorie.test.ts 9件含む） |
| 15 | フォーム表示: 秒数入力欄・計算ボタンが画面に存在しないこと | 実機確認 | ✅ pass | devサーバー復旧後、QA自身がブラウザで`/workouts/new`→セッション作成→記録追加フォームを開き、表示項目が「マシン/セット数/レップ数/運動時間（分）/重さ（任意）/単位」のみであることを`read_page`（アクセシビリティツリー）と`get_page_text`で確認。「1セットあたり秒数」欄・計算ボタンは一切存在しない |
| 16 | 「運動時間（分）」欄が引き続き正常に機能する（記録を保存できる） | 実機確認 | ✅ pass | 「運動時間（分）」に20を直接入力し、チェストプレス/3セット/10レップとあわせて送信したところ記録が保存され、記録一覧に「チェストプレス 3セット × 10レップ / 20分 159.8 kcal」と表示、合計消費カロリーも159.8 kcalに更新されたことを確認 |

## 静的検証

- `src/components/WorkoutLogForm.tsx`（169行、全文確認）: 設計書の削除指示5箇所すべてが正確に反映されている。`durationMinutes`関連ロジック（state・入力欄・`fieldErrors.durationMinutes`表示・送信時の`Number(durationMinutes)`渡し・リセット処理）は一切変更されていない。
- `src/lib/calorie.ts`（29行、全文確認）: `estimateDurationMinutes`関数とJSDocが削除され、ファイルは`calculateCalories`関数で終わる。`CALORIE_CORRECTION_FACTOR`, `CalorieCalcInput`, `calculateCalories`は無変更。
- `tests/unit/calorie.test.ts`（46行、全文確認）: import文から`estimateDurationMinutes`が除去され、対応する`describe`ブロック（4テスト）が削除。`calculateCalories`の9テストは無変更。
- `grep -rn "estimateDurationMinutes\|secondsPerSet" src/ tests/` → **0件**（`src/`, `tests/`双方で該当識別子なし）。

## 自動テスト実行

| コマンド | 結果 |
|---|---|
| `npx tsc --noEmit` | ✅ pass（エラーなし） |
| `npm run build` | ✅ pass（`✓ Compiled successfully`、11ルート生成成功） |
| `npm run test`（Vitest） | ✅ pass（Test Files 3 passed (3) / Tests 25 passed (25)） |

e2eテスト（`tests/e2e/workout-flow.spec.ts`）は、本タスクの指示（手順4）に含まれていないため未実行。設計書には「変更不要・秒数UIを操作しないため影響なし」との記載があり、`WorkoutLogForm.tsx`の`durationMinutes`関連ロジックが無変更であることは静的検証・実機確認双方で確認済みのため、影響は限定的と判断する。ただし正式な回帰確認としては別途実行を推奨する。

## 発見した問題（経緯・原因分析。実装差分自体の不具合ではなく、いずれもQAプロセス起因の環境トラブル）

### 問題1（撤回済み）: ポート3000のサーバーのDB接続先についての誤検知
- 当初、ポート3000で待受していたプロセス（PID 14552, `start-server.js`）のプロセスツリーを`npx-cli.js`（PID 7556）までしか遡らず、「`scripts/dev-local.js`ラッパーを経由していない＝本番Turso DBに接続している可能性がある」と判断し、フォーム送信を伴う実機確認を一度中断した。
- PMからの指摘を受け、`Get-CimInstance Win32_Process`でさらに祖先を遡って独立に再調査した結果、以下の通り正規の`npm run dev:local`起動チェーンであることを確認した（全プロセスが同一タイムスタンプ 2026/09/14 17:30:14〜15 に生成されており、一連のspawnチェーンと整合）。
  ```
  node scripts/dev-local.js (PID 26024, 17:30:14)
   └─ cmd.exe "npx next dev" (PID 2344, 17:30:14)   ← dev-local.jsのspawn(shell:true)ラッパー
      └─ npx-cli.js next dev (PID 7556, 17:30:14)
         └─ next dev (PID 3100, 17:30:14)
            └─ start-server.js (PID 14552, 17:30:15) ← ポート3000 LISTEN
  ```
  `scripts/dev-local.js`のソース（`spawn("npx", ["next","dev"], {shell:true, env:{TURSO_DATABASE_URL: "file:.../prisma/dev.db", ...}})`）と完全に一致する形。DBはローカルSQLite（`prisma/dev.db`）に固定されており、本番Turso DBへの誤接続リスクはないことを確認した。当初の指摘は調査範囲不足による誤検知だった。

### 問題2（解消済み）: `npm run build` によるdevサーバーとの`.next`共有ディレクトリ汚染
- 本QA手順4で`npm run build`を実行した際、稼働中のdevサーバー（`next dev`）と同じ`.next`ディレクトリに本番ビルド成果物が書き込まれ、devサーバー側のアセット配信が壊れた（`main-app.js`等が503／CSS未適用／クライアントJS未hydrateでフォーム送信がネイティブGETにフォールバック）。QA側で`.next/static/chunks`等の部分削除による復旧を試みたが、以後`localhost:3000`へのアクセスが権限クラシファイアにより拒否されるようになり、復旧確認ができない状態で一時中断した。
- PMが該当プロセスツリー（PID 14552, 11308, 3100, 7556, 2344, 26024）を全停止し、`.next`ディレクトリを完全削除した上で`npm run dev:local`により再起動、`curl http://localhost:3000/login`が200を返すことを確認。その後QA自身が改めてブラウザで動作確認したところ、CSSが正常適用されクライアント操作（セッション作成・フォーム送信）も正常に機能することを確認した。**問題は解消済み。**
- 教訓: `npm run build`と`npm run dev`（または`dev:local`）は同一の`.next`ディレクトリを共有するため、同時実行すると互いに干渉する。今後の同種QAでは、devサーバー稼働中の`npm run build`実行を避けるか、実行後にdevサーバー側の動作確認・必要に応じた再起動を前提に手順を組むことを推奨する。

## PM への申し送り

- **完了とみなしてよいか: yes**
  - 実装（コード）は詳細設計書通りに完成しており、静的検証・型チェック・本番ビルド・単体テスト（25件）に加え、ブラウザでの実機確認（秒数欄・計算ボタンの非表示、運動時間欄での記録保存）もすべてpassした。
  - QA自身の調査不足によるDB安全性の誤検知（問題1）と、`npm run build`によるdevサーバー`.next`ディレクトリ汚染（問題2）が途中で発生したが、PMのご対応（プロセス全停止・`.next`完全削除・`npm run dev:local`再起動）により解消し、最終的にQA自身が実機確認を完了できた。ご対応に感謝する。
  - 今後の推奨事項: devサーバー稼働中に`npm run build`を実行すると`.next`ディレクトリの競合が起きるため、QA手順4（型チェック・ビルド・単体テスト）実行後はdevサーバーの動作確認を組み込むか、devサーバー停止中にビルドを実行する運用を検討されたい。
