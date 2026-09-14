---
project_id: "2026-09-14-1040-machine-weight-input"
phase: research
created: "2026-09-14"
---
# 情報収集レポート: マシン選択肢統一と重量記録欄の新設

## 結論サマリー
- マシンマスタ（`Exercise`）は「マシン名×強度レベル」の組み合わせで1レコード=1選択肢になっており、`ExercisePicker.tsx` のプルダウンはこの `Exercise` 一覧をそのまま `<option>` 化しているだけ。1マシン1エントリ化には **Exerciseモデル自体の再設計（統合）** が必要で、単なるUI側のフィルタリングでは解決しない。
- カロリー計算（`src/lib/calorie.ts`）は `Exercise.metValue` を引数に取るだけで強度カテゴリ自体は参照していない。`WorkoutLog.metValueSnapshot` に計算時点のMET値がコピー保存される設計のため、**マスタのMET値を将来変更しても過去記録のカロリーは変わらない**（後方互換の仕組みは既にある）。
- 重さ記録欄は既存の命名規則（`bodyWeightKgOverride` 等、単位をサフィックスに持つ `xxxKg` パターン）に倣うのが自然。UnitはEnumではなく文字列リテラル型（`MuscleGroup`/`IntensityCategory` と同じパターン：Prisma上は`String`、TS側で `as const` 配列 + `Record` ラベル）が既存コードと一貫する。
- 本番DBはTurso(libSQL)、開発は `prisma/dev.db`（ただし実際のPrismaClientランタイムは開発時も`TURSO_DATABASE_URL`アダプタ経由で接続しており、`file:./dev.db`という`DATABASE_URL`は`prisma migrate dev`のスキーマ適用にしか使われていない）。**デプロイフロー（`.github/workflows/deploy.yml`）には`prisma migrate deploy`のステップが存在せず**、前回プロジェクトでは手動で `npx prisma migrate deploy` をVPS上または手元からTursoに対して実行していた。今回のスキーマ変更でも同様に手動マイグレーション適用が必要になる可能性が高い。
- Exerciseを「統合」すると、削除されるマシンレコード（強度違いの重複）を参照している既存の `WorkoutLog.exerciseId` (FK, `onDelete: Restrict`) がある場合、単純delete はFK制約違反になる。**既存データの移行方針（どのレコードを正とし、他をどう扱うか）を設計フェーズで確定させる必要がある。**

## 確認済み事実
- `Exercise` モデルは `intensityCategory`（String、実質的に `"LIGHT" | "MODERATE" | "VIGOROUS" | "HIGH_INTENSITY"` の4値）と `metValue`（Float）を持つ（出典: `prisma/schema.prisma:25-44`）。
- `WorkoutLog` モデルは `exerciseId`（FK, `onDelete: Restrict`）、`metValueSnapshot`（Float）、`caloriesBurned`（Float）、`bodyWeightKgOverride`（Float?）を持つ。重量記録用のフィールドは現状存在しない（出典: `prisma/schema.prisma:60-78`）。
- `WorkoutLog.secondsPerSetOverride`（Int?）はスキーマとマイグレーションSQLには存在するが、`workoutLogInputSchema`（`src/lib/validation.ts`）にも `WorkoutLogDTO`（`src/types/index.ts`）にも `addWorkoutLog`/`updateWorkoutLog`（`src/app/actions/workouts.ts`）にも一切登場せず、実質未使用の死んだフィールドになっている（出典: `prisma/schema.prisma:69`, `src/lib/validation.ts`, `src/types/index.ts`, `src/app/actions/workouts.ts`）。新フィールド追加の前例として「スキーマに追加したが未配線」という状態があり得ることの参考になる。
- `prisma/seed.ts` は筋トレマシン10種×強度3段階（LIGHT/MODERATE/VIGOROUS、Compendium of Physical Activities準拠のMET値 3.0/5.5/6.0）で30件、有酸素マシン6種（各1MET値、`INTENSITY_LABELS`の4値目`HIGH_INTENSITY`を含む個別命名。ワット数や速度がマシン名自体に埋め込まれ、機械的な×3展開ではない）で6件、合計36件を生成する（出典: `prisma/seed.ts:15-81`）。**「1マシン×3強度レベルで36件」という前提は筋トレマシンのみに厳密に当てはまり、有酸素6件は「マシン名×強度」の機械的組み合わせではなく個別に定義された名称・MET値である**点に注意（例:「エアロバイク（30〜50W）」と「エアロバイク（90〜100W）」は別名称の別マシンとして既に1エントリ化されている）。
- `Exercise.id` は seed 内で `seed-${machine.name}-${level.intensityCategory}`（筋トレ）または `seed-cardio-${cardio.name}`（有酸素）という決定的IDで `upsert` されている（出典: `prisma/seed.ts:49, 66`）。
- `ExercisePicker.tsx` はプルダウンの `<option>` 表示名を `${ex.name}（${部位}/${強度}/MET ${値}）` として組み立てており、名前ではなく `Exercise` レコード単位で選択肢を生成している（出典: `src/components/ExercisePicker.tsx:20-25`）。マシン名の重複統合はコンポーネント側ロジックでは不可能で、データモデル側の統合が必須。
- `WorkoutLogForm.tsx` は `exerciseId, setCount, repsPerSet, durationMinutes, secondsPerSet(補助のみ), bodyWeightKgOverride` を状態に持つ。重量入力欄は存在しない（出典: `src/components/WorkoutLogForm.tsx`）。
- カロリー計算式は `kcal = MET × 体重(kg) × 時間(h) × CALORIE_CORRECTION_FACTOR(1.05)`。入力は `metValue, weightKg, durationMinutes` のみで重量（バーベル重量等）は関与しない（出典: `src/lib/calorie.ts:1-29`）。ユーザー要望「重さの値はカロリー計算に使わない」と完全に整合し、既存関数のシグネチャ変更は不要。
- `addWorkoutLog`/`updateWorkoutLog`（`src/app/actions/workouts.ts`）が唯一のカロリー計算・保存箇所（コメントに「アプリ内で唯一のカロリー計算箇所」と明記）。`exercise.metValue` をその場で読み、`metValueSnapshot` として `WorkoutLog` に複製保存する。これにより**マスタのMET値を後から変更・統合しても、既存の `WorkoutLog` の `caloriesBurned`/`metValueSnapshot` は不変**（出典: `src/app/actions/workouts.ts:52-69, 113-138`）。
- `updateWorkoutLog` はログ編集時にマスタの最新MET値で再計算し `metValueSnapshot` も更新する仕様（コメントに明記）。統合後にマシンを編集すると新しい代表MET値で再計算される点は仕様上想定内の挙動（出典: `src/app/actions/workouts.ts:113-126`）。
- `exerciseInputSchema`（Zod）は `intensityCategory: z.enum(INTENSITY_CATEGORIES)` を必須項目としている（出典: `src/lib/validation.ts:16-22`）。マイマシン作成フォーム（`ExerciseForm.tsx`）も強度選択セレクトを持つ（出典: `src/components/ExerciseForm.tsx:88-102`）。強度カテゴリ自体をなくす場合、この作成フォーム・スキーマも影響を受ける。
- `Exercise.isCustom=true` のユーザー独自マシンも同じテーブルに存在し、`createdByUserId` で所有者管理される（出典: `prisma/schema.prisma:25-44`、`src/app/actions/exercises.ts:20-45`）。統合方針はマスタ（`isCustom=false`）だけでなくカスタムマシンの扱い（そのまま残すのが自然、統合対象外）も整理が必要。
- 命名規則の参考パターン: `defaultWeightKg`（User）, `bodyWeightKgOverride`（WorkoutLog）, `weightKg`（WeightLog）— いずれも「対象+Kg」というサフィックス命名。単位が可変（KG/ポンド）のフィールドの前例はまだ存在しない（出典: `prisma/schema.prisma` 全体）。
- `MuscleGroup`/`IntensityCategory` は Prisma上は生の `String` カラムで、TypeScript側で `as const` 配列とZodの `z.enum(...)` で型安全性を担保するパターン（Prisma組み込みの `enum` 型は不使用）。SQLiteはネイティブenumを持たないためこの方式を採っていると推測される（出典: `prisma/schema.prisma:28-31` のコメント、`src/types/index.ts:3-20`）。
- データベース接続: `src/lib/prisma.ts` は開発・本番を問わず常に `PrismaLibSql` アダプタを `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` で初期化しており、`schema.prisma` の `datasource db { url = env("DATABASE_URL") }`（`file:./dev.db`）は `prisma migrate dev` がマイグレーションSQLを生成・適用する対象としてのみ機能する（実行時クエリはすべてTurso側）。前回プロジェクトの作業ログにこの二重構造の経緯が明記されている（出典: `.project/engineering/2026-09-12-1539-gym-tracker/work-log.md:208-227`）。
- 本番デプロイ（`.github/workflows/deploy.yml`）は `git reset --hard` → `npm install`（`postinstall`で`prisma generate`のみ実行）→ `npm run build`（`next build`のみ）→ `pm2 restart` で、**`prisma migrate deploy` のステップが含まれていない**（出典: `MuscleBoost/.github/workflows/deploy.yml`）。前回の初回マイグレーションは `.project/engineering/.../work-log.md:215` に記載の通り、手動で `npx prisma migrate deploy` をTursoに対して実行して適用した記録がある。
- 既存テスト: `tests/unit/calorie.test.ts` はカロリー計算ロジックの単体テスト（マシン選択とは無関係、変更不要な想定）。`tests/e2e/workout-flow.spec.ts` はマシン名を `page.getByLabel("マシン")` のセレクトから `hasText: "チェストプレス（軽度）"` のように**強度サフィックス付きの文字列で選択**しており、統合後は `（軽度）` 等のサフィックスが消えるため **このE2Eテストの選択ロジック・アサーション文言は要修正**（出典: `tests/e2e/workout-flow.spec.ts:27-34, 76, 93, 110, 133, 148`）。カロリー期待値（MET3.0前提のアサーション、例:「110.3 kcal」）は「チェストプレス」統合後の代表METが3.0のままなら変更不要だが、中等度(5.5)等を代表値に選ぶ場合は**期待値の再計算が必要**。
- `tests/e2e/auth.spec.ts` はマシン選択に関する記述なし（未確認だが認証フローのみと推測、ファイル名から判断）。

## 推測・未確認
- `tests/e2e/auth.spec.ts` の中身は未読（認証系のみで本タスクに無関係と推測、要検証なら追加確認可）。
- 本番Turso DBに現在何件の `WorkoutLog` が存在するか、既存ユーザーが本番運用中かどうかは不明（コードからは判断できない）。ユーザー数・記録数によって「マスタ統合時の既存FK参照をどう扱うか」の緊急度が変わる。
- `AUTH_TRUST_HOST` 等の環境変数がVPS `.env` に設定済みという記録はあるが、今回のマイグレーション適用が自動化されているかどうか（CI経由か手動か）は前回ログからは「前回は手動だった」としか分からず、今回も同様に手動運用が続いているかは未確認。
- ポンド(lb)⇔KGの換算式・保存単位の方針（保存は常にKGに正規化し表示のみ切替 or 入力単位をそのまま保存し表示も入力単位ベース）は依頼文からは確定していない。既存の `bodyWeightKgOverride` はKG固定保存なので、これに倣うか、単位そのまま保存にするかは設計判断が必要（要検証・設計フェーズでの決定事項）。

## 既存コードベースの関連箇所
- `prisma/schema.prisma`: `Exercise`（マシンマスタ、intensityCategory/metValue保持）, `WorkoutLog`（記録本体、metValueSnapshot/caloriesBurned/重量欄なし）の定義。
- `prisma/seed.ts`: マシンマスタ36件（筋トレ10×3強度=30 + 有酸素6）のシード投入ロジック。マシン統合時はこのシードデータ自体の再設計が必要。
- `src/components/ExercisePicker.tsx`: プルダウンの実体。`Exercise[]` をそのまま `<option>` に展開。
- `src/components/WorkoutLogForm.tsx`: 記録作成フォーム。重量入力欄の追加先。`addWorkoutLog` 呼び出しのpayload組み立て箇所。
- `src/components/ExerciseForm.tsx` / `src/app/exercises/page.tsx`: マイマシン作成・一覧表示。強度カテゴリの扱いを変える場合、ここも影響を受ける。
- `src/app/actions/workouts.ts`: `addWorkoutLog`/`updateWorkoutLog`。カロリー計算・`metValueSnapshot`保存・WorkoutLog CRUDの中心。重量欄をpayloadに追加し`prisma.workoutLog.create/update`のdataに含める改修が必要になる想定箇所。
- `src/app/actions/exercises.ts`: マシンマスタのCRUD（`listExercises`, `createExercise`, `deleteCustomExercise`）。統合ロジック（重複除去・代表MET値選定）を実装するならこの層かseed側。
- `src/lib/calorie.ts`: カロリー計算の唯一の実装。変更不要（依頼要件通り）。
- `src/lib/validation.ts`: `exerciseInputSchema`（強度必須）, `workoutLogInputSchema`（重量欄なし、追加が必要）。
- `src/types/index.ts`: `IntensityCategory`, `ExerciseDTO`, `WorkoutLogDTO` 等の型定義。重量欄追加時はDTOにも反映が必要。
- `tests/e2e/workout-flow.spec.ts`: マシン名に強度サフィックスを前提にした選択・アサーションが複数箇所にあり、統合後は修正必須。
- `tests/unit/calorie.test.ts`: カロリー計算の単体テスト。仕様不変のため直接の修正は不要と推測。
- `.github/workflows/deploy.yml`: デプロイ手順に`prisma migrate deploy`が含まれない。スキーマ変更を伴う本改修では本番反映手順の確認・documentationが必要。
- `.project/engineering/2026-09-12-1539-gym-tracker/work-log.md`: 前回のTurso接続・マイグレーション適用の経緯・注意点が記載された一次資料。

## 採用候補と比較

### A. 強度レベルの扱い方針

| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| A1. 中等度(MODERATE)のMET値を代表値として1マシン1レコードに統合し、軽度・高強度レコードは削除（または`isCustom`同様のフラグで非表示化） | シンプル。プルダウン・シード・型定義がすっきりする。ユーザー要望（1マシン1選択肢）に最も忠実 | 既存`WorkoutLog.exerciseId`が軽度/高強度レコードを参照している場合、削除には既存データの`exerciseId`付け替えが必要（FK制約`onDelete: Restrict`のため単純delete不可）。カロリー計算の精度が「その日の強度」を反映できなくなる（軽い日も激しい日も同じMET値になる） | ★★★☆☆（データ移行の手間はあるが最も要望に忠実） |
| A2. `intensityCategory`フィールド自体はスキーマに残しつつ、UI（プルダウン・シード）だけ1マシン1エントリに絞る（例: マシン名でgroupByし、各グループの代表1件だけをプルダウンに出す） | スキーマ変更・マイグレーション不要。既存`WorkoutLog`のFK参照も無傷。ロールバックが容易 | 「同じマシン名なのに複数の`Exercise`レコードが裏に残る」という技術的負債が温存される。将来のマシン追加時に開発者が混乱しやすい。またどのレコードを「代表」として残すかのロジックが常に必要になり続ける | ★★☆☆☆（暫定対応としてはあり得るが根本解決にならない） |
| A3. マシンを完全に1レコードに統合し、intensityCategoryを廃止。ただし過去のMET値ベースの記録精度を保つため、統合時に既存の軽度/高強度`Exercise`を参照している`WorkoutLog`は`metValueSnapshot`済みなので実害なし、と割り切って`exerciseId`を代表レコードへ一括re-point後に旧レコードを削除 | 長期的に最もクリーン。プルダウン・シード・フォーム・型すべてがシンプルになる。`metValueSnapshot`のおかげでカロリー履歴は不変であることを活かせる | 移行スクリプト（`exerciseId`一括更新のマイグレーションデータ処理）が必要。「軽度で登録したのに一覧では統合後マシン名になる」という表示上の違和感が過去ログに出る可能性（ただし`exerciseName`は`exercise.name`から都度引くので、統合後は自動的に新名称になる） | ★★★★☆（根本解決。移行スクリプトの設計工数はあるが1回限り） |
| A4. マシンマスタを完全に再構築（統合済み1マシン1レコードの新セット）し、旧36件は`isCustom`に近い「非表示（アーカイブ）」フラグを立てて残す。新規記録は新マスタからのみ選択可、既存`WorkoutLog`のFKは旧レコードのまま維持 | 既存データに一切手を入れない最も安全な方式。過去ログの`exerciseName`表示も従来通り強度サフィックス付きで残り、履歴の文脈が保たれる | スキーマに「表示可否」フラグ（例: `isArchived`）の追加が必要（今の`isCustom`とは別軸）。マスタテーブルに"生きている36+新規N件"が混在し続け、`listExercises`のフィルタ条件が複雑化 | ★★★☆☆（安全重視だが将来的な複雑性が増す） |

### B. 重量記録欄のスキーマ設計

| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| B1. `WorkoutLog`に`weightValue Float?` + `weightUnit String?`（`"KG" | "LB"`、`MuscleGroup`と同じ`as const`+Zod enumパターン）を追加 | 依頼文で例示された案そのもの。既存の`MuscleGroup`/`IntensityCategory`の実装パターンと完全に一致し学習コストが低い。値なし（未入力）も`Float?`で自然に表現できる | 単位混在時の集計・グラフ化がしにくい（将来「総重量」を出す機能を作る場合、都度換算が必要）。カラム名が`weightValue`だと`bodyWeightKgOverride`等の既存"Kg固定"命名規則から見ると単位が名前に出ておらず一貫性がやや弱い | ★★★★☆（要望への忠実さと実装コストのバランスが良い） |
| B2. 常にKGに正規化して`weightKg Float?`のみ保存し、表示時にユーザー設定の単位で換算表示（入力欄では単位選択もするが、送信前にKGへ変換） | 既存の`weightKg`/`defaultWeightKg`命名規則に完全準拠。DBは単位が統一されており将来の集計が容易 | 「ユーザーが入力した通りの値（例:135lb）」が保存されないため、丸め誤差で表示時に微妙にズレる可能性（135lb→61.235kg→表示時に135.00...lbに戻らないケースがある）。依頼文の「記録用（保存・表示）のみ」という要望に対し、入力値をそのまま再現できないのは「記録」の趣旨と若干ズレる | ★★★☆☆（集計重視なら良いが、今回は「記録用のみ」なので入力値保持を優先すべき） |
| B3. B1同様だが、フィールド名を`weightKgValue`+`weightUnit`ではなく`weightAmount`+`weightUnit`、または単位別に`weightKg Float?`と`weightLb Float?`を両方持つ | （2カラム案）片方は常にnull、もう片方に値。命名は単位明示で分かりやすい | 2カラム案はNULL処理・バリデーションが複雑（どちらか一方のみ必須、という制約をアプリ層で担保する必要）。DB上not-null制約で表現できず品質担保しづらい | ★★☆☆☆（B1のほうがシンプル） |

**総合推奨**: 強度レベルは **A3**（完全統合＋既存WorkoutLogのexerciseId re-point、metValueSnapshotの不変性を活かす）を軸に、移行リスクを許容できない場合の代替として **A4**（アーカイブ方式）を設計フェーズで比較検討。重量記録欄は **B1**（`weightValue Float?` + `weightUnit`のString型、`MuscleGroup`と同一パターン）を推奨。

## 制約・前提・リスク
- FK制約: `WorkoutLog.exerciseId` は `onDelete: Restrict`（`prisma/migrations/20260912065446_init/migration.sql`）。強度違いレコードを削除する統合方式（A1/A3）を採る場合、削除前に必ず該当`WorkoutLog`の`exerciseId`を代表レコードへ更新するデータマイグレーション（SQLスクリプトまたはPrisma経由のバッチ処理）が必要。影響度: 高（既存ユーザーの記録がある場合、対応漏れで本番マイグレーションが失敗する）。
- デプロイパイプライン未対応: `.github/workflows/deploy.yml`に`prisma migrate deploy`のステップがない。スキーマ変更を含む本改修をpushしても本番Turso DBには自動反映されない。影響度: 高（実装フェーズで「マイグレーションをどう本番適用するか」の手順を明記しないと、コードだけ更新されDBが追従せず本番エラーになる）。
- 開発/本番のDB二重構造: `prisma migrate dev`は`DATABASE_URL`（ローカルSQLiteファイル）に対して実行されるが、実際のアプリケーションランタイムは常に`TURSO_DATABASE_URL`アダプタ経由。ローカルでマイグレーションを作成した後、ローカルのTurso相当DB（開発者ごとのTurso dev DBやlibsqlローカルファイル）にも別途`migrate deploy`が必要になり得る。影響度: 中（前回プロジェクトでも同じ構造で運用されており、known issueとして work-log に記録済み）。
- 強度カテゴリ廃止/統合によるカロリー計算の意味変化: `intensityCategory`を無くし単一METに統合すると、「今日は軽めにやった」等のユーザーの実際の負荷差がカロリー計算に反映されなくなる。既存の「MET値ベースのカロリー計算ロジックは変更しない」という制約とは矛盾しないが、機能的な後退（体験の劣化）と捉えられる可能性がある。影響度: 中（ユーザー要望なので許容されるはずだが、設計者は明示的にトレードオフとして記載すべき）。
- Zodスキーマの`intensityCategory`必須項目: `exerciseInputSchema`（マイマシン作成用）は現在`intensityCategory`必須。マスタ側で強度概念を廃止する場合、ユーザーが作るカスタムマシンの入力フォームからも強度選択欄を外すかどうかの判断が必要（依頼はマスタのプルダウン統一が主眼だが、一貫性のためカスタムマシン作成フォームも合わせて見直すべきか設計判断が必要）。影響度: 中。
- E2Eテストの前提崩れ: `tests/e2e/workout-flow.spec.ts`は「チェストプレス（軽度）」という強度サフィックス付き名称でマシンを選択し、MET3.0前提のkcal期待値をハードコードしている。統合後は名称もMET値も変わり得るため、実装時にテストの選択ロジックと期待値の両方を更新する必要がある。影響度: 中（実装漏れがあるとCI/E2Eが恒久的に赤くなる）。
- 単位変換の丸め: ポンド⇔KG換算をどこで（保存時 or 表示時）行うか、丸め桁数の方針が未定。依頼は「カロリー計算に使わない・記録用のみ」なので厳密な精度要件はないと推測されるが、表示の一貫性（同じ値が単位を切り替えると微妙に変わって見える）はUXリスクとして残る。影響度: 低〜中。
- シードの冪等性: `seed.ts`は決定的ID（`seed-${machine.name}-${level.intensityCategory}`）で`upsert`している。マシン統合後にシードスクリプトを書き換える際、既存の`seed-*`IDをどう扱うか（新IDへの完全置き換え or 同一IDを流用してレコード自体を更新）で、既存FK参照の生死が変わる。設計フェーズで「新シードは新IDにするか、既存中等度IDをそのまま代表IDとして流用するか」を明確にすべき（後者ならFK re-pointの手間が大幅に減る可能性がある）。影響度: 高。

## 設計者への申し送り
- 強度統合の代表値には、既存の`seed-${machine.name}-MODERATE`のIDをそのまま「1マシン1レコード」の代表として温存し、LIGHT/VIGOROUS版のみ削除+`exerciseId`をMODERATE版へ再point、という順序で設計するとFK付け替えの範囲が最小化できる（新規カロリー計算ロジック不要、`metValueSnapshot`があるので過去のkcal表示は無傷）。
- 有酸素マシン6件は元々1マシン1エントリに近い設計（ワット数・速度が名称に含まれる個別命名）なので、「1マシン=1エントリ」の統合対象は実質的に筋トレマシン10種のみである点を設計書に明記すると要件範囲の誤解を防げる。
- 重量記録欄はDTO（`WorkoutLogDTO`）・Zodスキーマ（`workoutLogInputSchema`）・Server Action（`addWorkoutLog`/`updateWorkoutLog`のcreate/update data）・フォーム（`WorkoutLogForm.tsx`）・表示（`WorkoutLogItem.tsx`）の5箇所すべてに配線が必要。既存の`bodyWeightKgOverride`が同様の「オプショナル数値＋任意入力」のフィールドなので、実装時のテンプレートとして参照すると手戻りが少ない。
- 本番反映時は「コードpush→GitHub Actions自動デプロイ」だけでは不十分。設計書には「VPS上またはローカルから`npx prisma migrate deploy`をTursoに対して手動実行する」手順を明記し、実行タイミング（コードデプロイの前 or 後）と、既存`WorkoutLog`のexerciseId付け替えバッチ処理の実行タイミングをセットで指示する必要がある。
- マイマシン作成フォーム（`ExerciseForm.tsx`）の強度選択欄をどうするかは依頼スコープ外に見えるが、マスタ側で強度を廃止するなら一貫性のため設計フェーズで明示的に「対象外（現状維持）」か「同様に廃止」かを決定しておくべき（放置すると仕様の一貫性が崩れる）。
- `secondsPerSetOverride`はスキーマにあるが未使用の死んだフィールドであることが分かった。今回のタスクとは無関係だが、同じPRでスキーマを触るならクリーンアップの要否をPM/設計者判断で検討してもよい（ただしスコープ外なら触らない方が安全）。
