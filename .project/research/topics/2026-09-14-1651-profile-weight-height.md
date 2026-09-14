---
project_id: "2026-09-14-1651-profile-weight-height"
phase: research
created: "2026-09-14"
---
# 情報収集レポート: プロフィール体重・身長管理への一元化

## 結論サマリー
- `bodyWeightKgOverride` はDB（1列）・Zod（1スキーマ）・Server Actions（2関数×2箇所ずつ）・型定義（1）・コンポーネント3つ・E2Eテスト4シナリオに及ぶ横断的な機能で、削除は「列を消す」だけでは終わらない全層の改修になる（確認済み）。
- カロリー計算のfallback順位は現在 `data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null`（`src/app/actions/workouts.ts` の `addWorkoutLog`/`updateWorkoutLog`）。上書きを廃止すれば `dbUser?.defaultWeightKg` のみを使い、未設定なら既存と同じエラー文言パターンで弾く実装にそのまま縮退できる（確認済み）。
- **重大な運用制約**: 開発DBと本番DBは同一のTurso（libSQL）インスタンスであり、`prisma.config.ts` の adapter は常にTursoを向く。ローカルで安全にマイグレーションCLIを流す手段がなく、前プロジェクト（`2026-09-14-1040-machine-weight-input`）ではSQLをNode.jsから直接ローカル`dev.db`に適用して検証し、本番適用はGitHub Actionsの`prisma migrate deploy`ステップ（前プロジェクトで追加、まだmainに未コミット/未デプロイ）に委ねる方針を確立している（確認済み、出典: `.project/engineering/2026-09-14-1040-machine-weight-input/work-log.md`、`.project/design/2026-09-14-1040-machine-weight-input/basic-design.md` §7）。同じ方針を本プロジェクトでも踏襲すべき。
- 前プロジェクトの変更（`weightValue`/`weightUnit`追加＋Exercise強度統合）は**まだ未コミット**（`git status`でM表示）かつ本番Tursoに未適用。本プロジェクトのマイグレーションはこれに積み重なる形になるため、マイグレーション適用順・コミット順の整理が設計フェーズで必要（要申し送り）。
- `bodyWeightKgOverride` 列は「削除（破壊的、SQLite上はテーブル再構築が必要）」と「Nullableのまま残し未使用化（安全・低コスト）」の二択。既存WorkoutLogデータにこの列の値が入っている行が存在する可能性が高い（前プロジェクトのE2Eテストシナリオがこの列に値を入れて動作確認しているため、本番にも同様のデータが入っている可能性がある）。
- 身長は `defaultWeightKg` と同一パターン（`User.heightCm Float? `、履歴管理なし）で十分。要件が「保存・表示のみ、計算には一切使用しない」と明記されており、`WeightLog`のような時系列履歴テーブルを新設する要求はない。

## 確認済み事実

### スキーマ（prisma/schema.prisma）
- `User` モデル: `defaultWeightKg Float?`（既存、Nullable）。身長列は現状存在しない。（出典: `prisma/schema.prisma` L11-23）
- `WorkoutLog` モデル: `bodyWeightKgOverride Float?`（Nullable）。同モデルには前プロジェクトで追加された `weightValue Float?` / `weightUnit String?`（表示専用、カロリー計算に不使用とコメント明記）も同居している。（出典: `prisma/schema.prisma` L58-80）
- `WeightLog` モデル: `userId`, `weightKg Float`（Not Null）, `recordedAt DateTime` の時系列体重履歴テーブルが既存。プロフィール画面の「体重履歴」セクションで使われている（カロリー計算には使われず、`defaultWeightKg`とは独立管理）。（出典: `prisma/schema.prisma` L82-91、`src/app/profile/page.tsx`）
- SQLiteのdatasource（`provider = "sqlite"`）。ただし実運用はTurso libSQL adapter経由。

### カロリー計算ロジック（src/lib/calorie.ts, src/app/actions/workouts.ts）
- `calculateCalories({metValue, weightKg, durationMinutes})` は純粋関数で、体重の由来（override/defaultどちらか）を一切意識しない。呼び出し側で解決済みの`weightKg`を渡す設計。（出典: `src/lib/calorie.ts` L17-29）
- fallback決定ロジックは `addWorkoutLog`・`updateWorkoutLog` の2箇所に**ほぼ同一コードが重複**して存在:
  ```
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
  if (weightKg === null) {
    return { ok: false, error: "体重を入力してください（プロフィールでデフォルト体重を設定するか、この記録で体重を入力してください）" }; // addWorkoutLog
    return { ok: false, error: "体重を入力してください" }; // updateWorkoutLogは文言が短い（既存でも不一致がある）
  }
  ```
  （出典: `src/app/actions/workouts.ts` L47-51, L119-123）
- 未設定時のエラーは既に「記録保存時にエラーとする」形で実装済み。上書き廃止後は `dbUser?.defaultWeightKg` のみを見ればよく、エラーメッセージは「プロフィールで体重を設定してください」等に統一すべき（両関数の文言差異は既存の不整合であり、この改修のついでに統一するのが自然）。

### フォーム・バリデーション
- `src/lib/validation.ts` の `workoutLogInputSchema` に `bodyWeightKgOverride: z.number().positive().max(400).optional()` あり（L34）。`profileUpdateSchema` に `defaultWeightKg: z.number().positive().max(400).optional()` あり（L59-62、身長追加時はここに`heightCm`を追加する形になる）。
- `src/components/WorkoutLogForm.tsx`: 「体重（kg・上書き、任意）」という独立した入力欄があり（L187-203）、`defaultWeightKg`をプレースホルダーとして表示する設計（`placeholder={defaultWeightKg ? String(defaultWeightKg) : "未設定"}`）。送信payloadに`bodyWeightKgOverride`を含む（L57）。フォームpropsに`defaultWeightKg: number | null`を受け取っている（L14, L21）が、これは表示専用でありフォーム自体はプロフィールへの動線を持たない。
- `src/components/WorkoutSessionLogs.tsx`: 編集フォーム側にも同様の`editBodyWeightKgOverride`状態と`updateWorkoutLog`呼び出しへのマッピングがある（L45, L58）。
- `src/components/WorkoutLogItem.tsx`: 表示側で `log.bodyWeightKgOverride ? ... : ""` の条件表示（L17）。

### Server Actions / DTO
- `src/types/index.ts` の `WorkoutLogDTO` に `bodyWeightKgOverride: number | null` フィールドあり（L37）。
- `addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession` の3箇所でDTOマッピングに`bodyWeightKgOverride`が含まれる（`src/app/actions/workouts.ts` L90, L171, L236）。
- `create`/`update` の Prisma データにも `bodyWeightKgOverride: data.bodyWeightKgOverride ?? null` が含まれる（L72, L153）。

### プロフィール（src/app/actions/profile.ts, src/components/ProfileForm.tsx, src/app/profile/page.tsx）
- `updateProfile(input)`: `profileUpdateSchema.safeParse` → `prisma.user.update({ data: parsed.data })` という薄いServer Action。`name`/`defaultWeightKg`ともoptional。身長追加時は同じパターンで`heightCm`を`profileUpdateSchema`と`data`に足すだけで拡張可能（設計変更コストが小さい）。（出典: `src/app/actions/profile.ts` L9-17）
- `ProfileForm.tsx` はコメントで「設計書1.3節には明記が無いが…追加した補助コンポーネント」と書かれており、既存の設計書に厳密に従わず実装側の裁量で作られた経緯がある（前例として、身長欄追加時も同様にフォーム側で自由度を持たせてよい）。
- `ProfilePage`は`dbUser`を`prisma.user.findUnique`で直接取得し、`ProfileForm`にpropsで渡すサーバーコンポーネント構成。
- `addWeightLog`/`listWeightLogs`（体重履歴）は`defaultWeightKg`とは完全に独立した別データフロー。身長の履歴管理は今回要件に含まれないため、これに倣う必要はない。

### WeightLogとの関係・身長を単純1カラムにする判断材料
- `WeightLog`は「体重の推移をグラフ化・記録する」ための独立エンティティであり、`User.defaultWeightKg`（カロリー計算用の「現在値」）とは別管理（保存の都度別データとして`weightLogInputSchema`経由で追記されるのみで、`defaultWeightKg`を自動更新する連携は無い）。
- 要件文言「プロフィールに身長（新規、例: heightCm）を追加し、保存・表示のみ行う（計算には一切使用しない）」は、`defaultWeightKg`と全く同じ性質（単一の現在値、Nullable、計算根拠として使われない点は身長の方がむしろ徹底している）。履歴化・グラフ化の要求は明記されていない。
- 結論: `WeightLog`のような別テーブルは不要。`User.heightCm Float?` の1カラム追加で要件を満たせる（設計候補として提示するが、判断は設計フェーズに委ねる）。

### マイグレーション制約（最重要、前プロジェクトより確認）
- `prisma.config.ts` の `adapter` は常に `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` を使う。`datasource db { url = env("DATABASE_URL") }`はスキーマ宣言上のみで実際の接続には使われない（出典: `prisma.config.ts` L15-19、`prisma/seed.ts` L6-9、work-log.md L11-12）。
- 開発DBと本番DBが**同一のTursoインスタンス**（出典: work-log.md L14、basic-design.md §7.1）。
- そのため `npx prisma migrate dev`/`deploy`、`npm run db:seed`、Playwright E2E（アプリ起動を伴う）をローカルで素の状態で実行すると本番Tursoに直接影響する。前プロジェクトはこれを避けるため、`prisma.config.ts`を一時的にローカルSQLite（`prisma/dev.db`）向けに書き換えて検証し、検証後に元に戻す、というアプローチを取った（出典: work-log.md L17-26）。
- `.github/workflows/deploy.yml`は前プロジェクトで「`npm install`後・`npm run build`前に`npx prisma migrate deploy`を追加」する変更が加えられたが、**この変更はまだコミットされておらず**（`git status`で`M .github/workflows/deploy.yml`）、本番へのデプロイフロー自動化はまだ有効化されていない（要確認: 現在の`main`ブランチの実デプロイフローは旧来のまま = マイグレーション適用ステップなし）。
- ローカル`prisma/dev.db`には本タスク以前からの`_prisma_migrations`追跡テーブルの不整合（ドリフト）があり、`prisma migrate dev`のCLIでのマイグレーション生成が完走しない既知の問題がある（出典: work-log.md L18）。前プロジェクトはSQLを手動作成し、SQLite標準のテーブル再構築パターンに倣った。

### マイグレーション技術詳細（SQLite/libSQL列削除パターン）
- 前プロジェクトで実際に生成されたSQL（`prisma/migrations/20260914020356_merge_exercise_intensity_and_workout_weight/migration.sql`）は、列削除を伴う`Exercise`テーブルの変更を「`new_Exercise`作成→`INSERT...SELECT`でコピー→`DROP TABLE`旧→`RENAME`」という**Prisma標準のテーブル再構築パターン**で実施している（`PRAGMA defer_foreign_keys=ON`/`foreign_keys=OFF`で囲む）。一方、列追加（`weightValue`/`weightUnit`）は単純な`ALTER TABLE ... ADD COLUMN`で済んでいる（出典: 同ファイル L61-87）。
- これは`WorkoutLog.bodyWeightKgOverride`を物理削除する場合も同じパターン（`WorkoutLog`版のテーブル再構築）が必要になることを示唆する。ただしSQLite 3.35以降（およびlibSQL）は`ALTER TABLE ... DROP COLUMN`をネイティブサポートしており、Prismaが生成する再構築パターンより単純な代替手段が技術的には存在する（Prisma CLIが再構築パターンを使うのは互換性重視のため。libSQL/Tursoでのネイティブ`DROP COLUMN`のサポート状況は本調査では未検証＝要確認）。

### 既存テスト（Vitest）
- `tests/unit/calorie.test.ts`: `calculateCalories`/`estimateDurationMinutes`のみを対象とし、`bodyWeightKgOverride`という名前や`defaultWeightKg`のfallbackロジック自体（Server Action側）はテストしていない（純粋関数`weightKg`を直接渡すテストのみ）。したがって本改修でこのファイルの変更は不要と推測される（要検証: fallbackロジックのテストが他ファイルにあるか未確認、`Glob`では`tests/unit/`配下に他の該当ファイルは見つからなかった）。
- `tests/unit/volume.test.ts`（前プロジェクトで新規追加、体重とは無関係のボリューム計算テスト）は本改修と無関係と推測される。

### 既存E2Eテスト（Playwright, tests/e2e/workout-flow.spec.ts）
- 体重上書き入力・プロフィール設定に直接関連する4シナリオを確認（出典: 同ファイル）:
  1. L66-86「デフォルト体重設定→MET5.5マシンで記録→カロリーが期待値通り計算される」: `/profile`で「デフォルト体重 (kg)」を70に設定してから記録、202.1kcalを検証。**これは廃止後も本来のシナリオ（デフォルト体重のみでの計算）としてそのまま活きる**。
  2. L88-103「体重を記録時に上書き→デフォルト体重ではなく上書き体重でカロリーが計算される」: `.getByLabel("体重（kg・上書き、任意）")`を使用。**この欄が廃止されるため、このテスト自体を削除するかシナリオ変更が必須**。
  3. L105-126「セット数のみ変更（時間は同じ）→カロリー表示が変化しない」: 上書き体重欄を70に設定して使っている。欄削除に伴い記述変更が必要（プロフィールのデフォルト体重に依存する形に書き換え）。
  4. L128-141「デフォルト体重未設定・上書きも無しで記録保存→エラーが表示され保存されない」: このシナリオ自体は廃止後も有効（エラー文言`"体重を入力してください"`は現状addWorkoutLog側の文言の部分一致で検出しているため、文言変更時はテストのExpect文言も追随要）。
  5. L143-161「削除: ログ削除後...」: 上書き体重欄を使用しているため、フォーム送信部分の書き換えが必要（プロフィール側で事前にデフォルト体重を設定する手順に変更）。
- E2Eは`bodyWeightKgOverride`という名前そのものは使っていない（ラベルテキスト「体重（kg・上書き、任意）」でアクセスしている）が、欄削除により最低3テスト（上記2,3,5）の書き換えが必要、1テスト（上記1）はほぼそのまま、1テスト（上記4）は文言確認のみ調整。
- 身長・プロフィール画面自体を対象にしたE2Eシナリオは現状皆無（`/profile`への遷移はテスト1でのみ、デフォルト体重設定のためだけに使われている）。身長入力のE2Eは新規追加が必要になる可能性がある（要件次第、設計フェーズ判断）。
- 前プロジェクトの申し送り通り、**このE2Eはこれまで一度もローカル実行できていない**（Turso本番相当DBへの接続が必須のため）。本プロジェクトでも同じ制約が継続する。

## 推測・未確認
- 本番Tursoの`WorkoutLog`テーブルに`bodyWeightKgOverride`が非NULLの実データ行がどの程度存在するかは未確認（コード上入力可能な欄であり、初期実装からある機能のため存在する可能性はある。列削除の破壊性評価に直結するため設計フェーズで確認方針を明示すべき）。
- Turso（libSQL）が`ALTER TABLE ... DROP COLUMN`をネイティブサポートしているか、Prisma CLIがSQLiteプロバイダに対して常にテーブル再構築パターンを生成するのか（バージョン依存の可能性）は未検証。
- `.github/workflows/deploy.yml`の`M`（未コミット差分、前プロジェクトの`migrate deploy`追加）が今回のコミット・デプロイにどう影響するかは、リポジトリの現在のコミット計画（前2プロジェクト分をまとめてpushするのか、個別にpushするのか）次第であり、ユーザー・PMへの確認事項として設計フェーズで扱うべき（本調査のスコープ外と判断し深掘りしていない）。
- `updateWorkoutLog`のエラーメッセージ「体重を入力してください」と`addWorkoutLog`の「体重を入力してください（プロフィールで...）」の文言差異が意図的か単なる実装漏れかは未確認（推測: 単なる不統一、本改修で統一するのが自然）。

## 既存コードベースの関連箇所
- `prisma/schema.prisma`: `User.defaultWeightKg`（既存）、`WorkoutLog.bodyWeightKgOverride`（削除/残置検討対象）、身長列の追加先。
- `src/lib/calorie.ts`: `calculateCalories()` 本体は無変更で済む（`weightKg`を受け取るだけの純粋関数）。
- `src/app/actions/workouts.ts`: `addWorkoutLog`・`updateWorkoutLog`内のweight解決ロジック（2箇所重複）とDTOマッピング（3箇所: create/update/getWorkoutSession）が改修対象。
- `src/lib/validation.ts`: `workoutLogInputSchema`から`bodyWeightKgOverride`除去、`profileUpdateSchema`に`heightCm`追加。
- `src/types/index.ts`: `WorkoutLogDTO.bodyWeightKgOverride`除去（または残置）、`ExerciseDTO`等は無関係。
- `src/components/WorkoutLogForm.tsx`: 体重上書き入力欄（L187-203）削除、`defaultWeightKg` propの用途再検討（未設定時の警告表示に転用する等は設計判断）。
- `src/components/WorkoutSessionLogs.tsx`: 編集フォーム内の同等欄・状態（L45, L58付近）削除。
- `src/components/WorkoutLogItem.tsx`: 表示テキストの条件分岐（L17）削除。
- `src/app/actions/profile.ts`: `updateProfile`の`profileUpdateSchema`変更に自動追随（コード自体の変更は最小、`data: parsed.data`をそのまま`prisma.user.update`に渡す設計のため）。
- `src/components/ProfileForm.tsx` / `src/app/profile/page.tsx`: 身長入力欄・表示の追加箇所。
- `tests/e2e/workout-flow.spec.ts`: 4テストの書き換え（詳細は上記）。
- `.project/design/2026-09-14-1040-machine-weight-input/basic-design.md` §7、`.project/engineering/2026-09-14-1040-machine-weight-input/work-log.md`: マイグレーション運用方針の一次情報源。

## 採用候補と比較

### A. `bodyWeightKgOverride`列の扱い
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| A1. 列を残しNullableのまま未使用化（コードから参照だけ削除） | 破壊的変更なし。マイグレーション不要（DDL変更ゼロ）。本番Turso上の既存データに一切触れないため前プロジェクトのようなSQL手動適用・検証プロセスが丸ごと不要でリスク最小。ロールバックも容易 | DB上に「使われない列」が残り続ける（スキーマの意図が読み取りづらくなる。コメントで明記すれば軽減可） | ★★★★★ |
| A2. `ALTER TABLE DROP COLUMN`で物理削除（libSQLがネイティブ対応していれば） | スキーマがクリーンになる | 対応状況が未検証。対応していても、開発=本番同一DBの制約下でのDDL適用検証が前プロジェクト同様に困難（Turso本番相当DBへの直接適用リスク）。既存データが失われる（復元不可）ため、実データ有無の事前確認が必須 | ★★☆☆☆ |
| A3. Prisma標準のテーブル再構築パターンで物理削除 | スキーマがクリーンになり、Prismaの生成物と乖離しない | A2と同じ検証リスクに加え、SQL量・作業コストが最大（前プロジェクトの`Exercise`再構築と同等の手間）。`WorkoutLog`は外部キー参照元でもある（他テーブルからの参照は無いが将来増える可能性） | ★★☆☆☆ |

推奨: A1（列はNullableのまま残し、アプリコードからのみ参照を除去）。理由は「開発DB=本番DBで安全にDDL検証する手段がない」という確立済みの制約下で、破壊的DDLを伴わない選択肢が最もリスクが低く、かつユーザー要件（「完全に廃止」）は主にアプリの振る舞い・UIレベルの話であり、DB列の物理削除までは明示要求されていない（「列を削除する場合の」という条件付きの依頼文言であり、設計フェーズでの選択余地がある）ため。

### B. 身長カラムの追加方式
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| B1. `User.heightCm Float?` を`ALTER TABLE ADD COLUMN`で追加 | 前プロジェクトの`weightValue`/`weightUnit`追加と全く同じパターンで実績あり。単純な追加列でリスク最小、既存データへの影響ゼロ | マイグレーション適用自体は必要（本番Turso含む） | ★★★★★ |
| B2. マイグレーション不要な代替（例: JSON的な既存カラムに詰め込む、設定テーブルを流用等） | 一見マイグレーション回避に見える | `User`テーブルに構造化されていない値を詰め込む代替は既存カラムが存在せず、実質的に新規カラム追加と同等かそれ以上の設計コストがかかる。今回のスキーマには汎用JSON列等の受け皿が存在しない | ★☆☆☆☆ |

推奨: B1。追加のみのマイグレーション（`ALTER TABLE ADD COLUMN`）は前プロジェクトで実績があり、削除を伴わないため技術的リスクは低い。ただし適用自体は依然としてTurso本番同一DB制約の対象であり、A1を採用した場合はB1のADD COLUMNのみのシンプルなマイグレーションで済む（DROP系の複雑な再構築SQLを回避できる相乗効果がある）。

## 制約・前提・リスク
- 開発DB=本番DB（Turso同一インスタンス）: 影響度「高」。ローカルでの通常のCLIマイグレーション適用・E2E実行が不可能。設計フェーズは前プロジェクト同様「一時的にadapterをローカルSQLiteへ向けて検証→復元」または「SQLを静的にレビューするのみで適用は別途本番反映時に実施」という運用を明記する必要がある。
- `.github/workflows/deploy.yml`への`migrate deploy`追加が未コミット: 影響度「中」。現状の`main`は旧来のデプロイフロー（マイグレーション適用ステップなし）のままであり、これが未反映のままだと今回のマイグレーションも自動適用されない。設計・PMフェーズで、前プロジェクト分と合わせたコミット・デプロイ計画の確認が必要。
- 未コミットの前プロジェクト2件（`machine-weight-input`, `training-volume`）の変更が作業ツリーに残存: 影響度「中」。本プロジェクトの改修はこれらの変更内容（`weightValue`/`weightUnit`列、`volume.ts`等）の上に積み重なる。コミット順序・粒度を設計フェーズ/PMで整理すべき。
- `bodyWeightKgOverride`削除が破壊的DDLになり得る: 影響度「高（データ損失リスク）」。物理削除を選ぶ場合、本番の既存データ有無の確認と、テーブル再構築SQLの静的検証が必須。
- E2Eテスト4シナリオの書き換えが必要、かつE2E自体がこれまで一度も実行できていない: 影響度「中」。テストコードの正しさを実行で担保できないため、詳細設計フェーズでのロジックレビューの精度がより重要になる。
- `addWorkoutLog`/`updateWorkoutLog`間のエラー文言不一致: 影響度「低」。今回の改修で統一するのが自然だが、要件外の変更として設計書に明記すべき。

## 設計者への申し送り
- `bodyWeightKgOverride`列は「Nullableのまま残し未使用化（A1）」を第一候補として基本設計に記載することを推奨する。物理削除（A2/A3）を選ぶ場合は、本番データの事前確認方法と、Turso本番同一DB制約下でのDDL検証手順（前プロジェクトのSQL直接適用パターンの再利用）を基本設計に明記すること。
- 身長カラムは`User.heightCm Float?`のシンプルな追加で足り、`WeightLog`のような履歴テーブルは不要と判断した（要件に履歴化の言及なし）。ただし将来の拡張余地として「なぜ履歴化しないか」を設計書に一言残すと後続プロジェクトの手戻りを防げる。
- `addWorkoutLog`/`updateWorkoutLog`のweight解決ロジックの重複コードは、今回`bodyWeightKgOverride`の分岐を消すタイミングで共通化（例: `resolveWeightKg(userId)`のような小関数への切り出し）を検討する価値がある（必須ではないが改修範囲が両関数に及ぶため一貫性の観点で有用）。
- `WorkoutLogForm.tsx`が受け取っている`defaultWeightKg` propは、上書き入力欄が消えた後も「未設定時にフォーム上で警告表示する」等の用途に転用できる可能性がある（削除して終わりではなく、UI上でプロフィール未設定時にどう案内するかは設計判断が必要）。
- E2Eテスト（`tests/e2e/workout-flow.spec.ts`）の4シナリオ書き換え方針を詳細設計に具体的に落とし込むこと。特にテスト2「体重を記録時に上書き」は代替シナリオが無くなるため削除するか、「プロフィールのデフォルト体重を変更すると次回記録から反映される」ようなシナリオへの置き換えを検討する。
- マイグレーション・デプロイの実適用（本番Tursoへの反映）は、前プロジェクトの申し送り同様、コード変更のみで留め、実行はQA/ユーザー確認後の別作業とする方針を踏襲すること。特に「開発中に誤って本番Tursoへ書き込む」事故を避けるため、`prisma.config.ts`や`.env`のTurso認証情報には触れない実装アプローチ（前プロジェクトの手法を参照）を詳細設計に明記すること。
