---
project_id: "2026-09-14-1351-training-volume"
phase: research
created: "2026-09-14"
---
# 情報収集レポート: トレーニングボリューム算出機能

## 結論サマリー
- 「トレーニングボリューム（Volume Load / Tonnage）」の標準定義は **重さ × セット数 × レップ数** であり、依頼内容と一致する（Web検索で複数の一次情報が確認済み）。他に「Hard Sets（セット数のみ）」という代替指標も存在するが、今回の依頼は明示的に重さベースの計算式を指定しているため設計上の選択肢にはならない。
- 既存スキーマの実フィールド名は `setCount`（Int）・`repsPerSet`（Int）・`weightValue`（Float?）・`weightUnit`（String? = `"KG" | "LB"`）。依頼文中の `sets`/`reps` という仮称は実装には存在しないため、設計書では必ずこの正式名を使うこと。
- `weightValue`/`weightUnit` は常にペアで存在するか、両方 `null` のいずれか（Zodの`superRefine`で片方のみの入力を拒否済み）。したがって「重さ未入力」の判定は `weightValue === null` のみで安全に行える。
- 既存コードに **LB→KG換算処理は一切存在しない**（`weightUnit`は表示ラベル切替のみに使われ、値の変換はしていないことを設計書・実装コード双方で確認済み）。ボリューム集計をKG前提で行うには、新規に換算ロジックを実装する必要がある。
- カロリー計算（`src/lib/calorie.ts`）は「純粋関数を`lib`に置き、Server Action（`workouts.ts`）内で呼び出し結果をDTOに詰め、コンポーネント側では既に計算済みの値をreduceで合計する」という3層パターン。新指標もこのパターンに倣うのが最も既存コードとの一貫性が高い。カロリーはDBに保存(`caloriesBurned`列)されるが、ボリュームは既存フィールドから常に導出可能な値なので、DBに保存せず都度計算する設計（DTO or 表示層での算出）が自然（要設計判断）。

## 確認済み事実
- ［Volume Load / Training Volumeの標準式は「重さ×セット数×レップ数」であり、Tonnageとも呼ばれる同義語である］（出典: https://traincalc.com/calculators/workout-volume, https://www.strongerbyscience.com/the-new-approach-to-training-volume/）
- ［代替指標として「Hard Sets」＝セット数のみをカウントする方法も研究ベースの実務では使われるが、これは今回の依頼の式とは異なる別指標］（出典: https://rpetraining.com/training-volume-calculator, https://outlift.com/hypertrophy-training-volume/）
- ［`WorkoutLog`モデルの実フィールド: `setCount Int`, `repsPerSet Int`, `durationMinutes Float`, `bodyWeightKgOverride Float?`, `weightValue Float?`, `weightUnit String?`, `metValueSnapshot Float`, `caloriesBurned Float`］（出典: C:\project\MuscleBoost\prisma\schema.prisma）
- ［`weightValue`と`weightUnit`は常にペア（両方null または 両方値あり）。片方のみの入力はZodの`superRefine`で拒否される］（出典: C:\project\MuscleBoost\src\lib\validation.ts の`workoutLogInputSchema`、および schema.prisma のコメント「weightValueとweightUnitは常にペアで存在する」）
- ［`WeightUnit`の取り得る値は`"KG"`と`"LB"`のみ（`src/types/index.ts`の`WEIGHT_UNITS`）］（出典: C:\project\MuscleBoost\src\types\index.ts）
- ［`WorkoutSession` 1件に対し `WorkoutLog` は複数（`logs: WorkoutLog[]`の1対多）。セッション削除時は`onDelete: Cascade`でログも削除される］（出典: C:\project\MuscleBoost\prisma\schema.prisma）
- ［既存コードベースに単位換算（lb⇔kg）ロジックは一切存在しない。`weightUnit`は`WorkoutLogItem.tsx`での表示ラベル切替（`WEIGHT_UNIT_LABELS[log.weightUnit]`）にのみ使われ、値変換は行っていない。詳細設計書にも「`weightUnit`の`<select>`を切り替えても`weightValue`の数値は変換されない…自動換算は実装しない」と明記されている］（出典: C:\project\MuscleBoost\src\components\WorkoutLogItem.tsx、C:\project\MuscleBoost\.project\design\2026-09-14-1040-machine-weight-input\detailed-design.md 717行目）
- ［カロリー計算は`src/lib/calorie.ts`の`calculateCalories()`という純粋関数（引数の妥当性チェック→不正なら0を返す→四捨五入して小数第1位で返す）として独立実装されている。呼び出しは`src/app/actions/workouts.ts`の`addWorkoutLog`/`updateWorkoutLog`の2箇所のみで、計算結果をDBの`caloriesBurned`列に保存する］（出典: C:\project\MuscleBoost\src\lib\calorie.ts、C:\project\MuscleBoost\src\app\actions\workouts.ts）
- ［カロリー合計の集計パターンは3箇所に存在: (1) `listWorkoutSessions()`と`getWorkoutSession()`（`workouts.ts`）内でサーバー側`reduce`により`totalCalories`をDTOに含めて返す、(2) クライアントコンポーネント`WorkoutSessionLogs.tsx`（36行目）でも同じ`reduce`をクライアント側で再計算して表示、(3) `getDashboardStats()`で期間内の全セッション横断合計を計算。いずれも`Math.round(sum * 10) / 10`で小数第1位に丸める同一パターン］（出典: C:\project\MuscleBoost\src\app\actions\workouts.ts、C:\project\MuscleBoost\src\components\WorkoutSessionLogs.tsx）
- ［記録ごとの表示は`WorkoutLogItem.tsx`が担当。カロリーは`log.caloriesBurned`をそのまま表示（計算済み値をDBから読むだけ、コンポーネント内での再計算なし）。セット×レップ×時間×重さ(あれば)はテキスト連結で1行表示］（出典: C:\project\MuscleBoost\src\components\WorkoutLogItem.tsx）
- ［Vitestのカロリーテスト（`tests/unit/calorie.test.ts`）は正常系1件＋定数確認＋境界値（0、負数、NaN、Infinity）を関数単体でテストするパターン。DBやServer Actionを介さず`lib`関数を直接importしてテストしている］（出典: C:\project\MuscleBoost\tests\unit\calorie.test.ts）
- ［lb→kg換算係数の標準値は 1 lb = 0.45359237 kg（国際ポンドの定義値）］（一般的に確立された定義。Web検索の一次情報での再確認は今回省略したが、既存プロジェクトの他機能でも同係数が使われる可能性があるため設計時に検索推奨）
- ［前プロジェクト（2026-09-14-1040）の申し送りとして、開発DBと本番DBはTurso上の同一インスタンスであり、`prisma migrate dev`のCLI実行がローカルで完走しない既知の問題がある。マイグレーションSQLは手動作成が必要だった］（出典: C:\project\MuscleBoost\.project\engineering\2026-09-14-1040-machine-weight-input\work-log.md）

## 推測・未確認
- ［DBに`volumeKg`のような列を新設して保存するか、既存フィールドから都度計算するかは要件からは未確定。カロリーのように「スナップショットとして保存」する必然性は薄い（重さ・セット数・レップ数を変更するUPDATE経路がある場合、都度再計算の方が整合性リスクが低い）］（要検証: 設計者が保存 vs 都度計算のどちらかを決定する必要あり）
- ［`weightValue`がnullのログをボリューム集計にどう含めるかは要件文書に明記なし。単純に「0として無視する」か「その記録はボリューム欄自体を非表示にする」かの2択が考えられる。カロリー表示の`bodyWeightKgOverride`と同じ「値がある時だけ追記」パターンを踏襲するなら後者が自然］（要検証: 依頼者への確認 or 設計判断）
- ［LB入力ログをボリューム合計に含めるかどうかは依頼文からは確定していない（「集計はKG前提（ユーザー確認済み）」とあるのみ）。含める場合は換算が必要、除外する場合はUI上で「LB記録はボリューム対象外」等の注記が必要になる］（要検証: 依頼者に確認済みとあるが、「lb記録を換算して含める」のか「lb記録はそもそも対象外」なのかの区別が本文だけでは読み取れない）

## 既存コードベースの関連箇所
- `prisma/schema.prisma` の `WorkoutLog` モデル: ボリューム計算に必要な `setCount`/`repsPerSet`/`weightValue`/`weightUnit` を保持
- `src/types/index.ts` の `WorkoutLogDTO`: 新指標をDTOに追加する場合の追加位置候補（`caloriesBurned`と同様のパターン）
- `src/lib/calorie.ts`: 独立した計算ロジックの実装パターン見本（純粋関数、防御的な入力チェック、丸め処理）。新規に`src/lib/volume.ts`（仮）を作る際の参考実装
- `src/app/actions/workouts.ts`: `addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession`/`listWorkoutSessions`/`getDashboardStats` — カロリーと同様の場所に新指標のDTOマッピング・集計処理を追加できるか検討すべき箇所
- `src/components/WorkoutLogItem.tsx`: 記録ごとの表示。ボリュームの記録単位表示を追加する場合の変更箇所
- `src/components/WorkoutSessionLogs.tsx`（36行目・79行目付近）: セッション内合計（`totalCalories`）のクライアント側`reduce`集計・表示パターン。ボリューム合計もここに追加できる
- `src/app/workouts/page.tsx`: セッション一覧でのサマリー表示（`s.logCount`件 / `s.totalCalories` kcal）。ボリューム合計をここにも出すかは要件次第
- `tests/unit/calorie.test.ts`: 新指標の単体テストを追加する際の構成見本（正常系・境界値・NaN/Infinity対策）
- `.project/design/2026-09-14-1040-machine-weight-input/detailed-design.md`: `weightValue`/`weightUnit`のペア制約設計・単位変換非実装の方針の一次情報源

## 採用候補と比較
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| A. 都度計算（DB保存なし、DTO生成時に算出） | カロリーと違い体重や重さ・レップ・セットが変わっても再計算不要で常に最新値。マイグレーション不要でリスクが低い | セッション一覧・ダッシュボードなど複数箇所で同じ計算ロジックを都度呼ぶ必要がある（ただし共通関数化すれば問題小） | 高 |
| B. DBにスナップショット列として保存（`volumeKg`等） | カロリーと同じ保存パターンに揃えられ、将来集計クエリ（DB側SUM等）がしやすい | マイグレーションが必要（前プロジェクトでCLIが完走しない既知の問題あり、手動SQL作成の手間とリスクが再発）。KG前提の集計方針を後から変える場合に再計算・再マイグレーションが必要 | 中 |
| C. lb記録もkg換算して合算 | ユーザーが混在単位で記録していても合計が意味を持つ | 換算ロジックの新規実装・テストが必要。丸め誤差の扱いを新たに決める必要 | 要件次第（ユーザー確認済みとのことなので設計者が具体的な扱いを詰める） |
| D. lb記録はボリューム集計から除外（KGのみ集計） | 実装が最も単純、換算ロジック不要 | lb単位で記録しているユーザーの合計が過小評価される | 要件次第 |

## 制約・前提・リスク
- ［既存のカロリー計算ロジックへの影響禁止］: 依頼にある明示的な制約。`calculateCalories()`の呼び出し・引数・実装には一切手を入れず、新規の独立モジュール/関数として実装する必要がある。影響度: 高（誤って触れると回帰リスク）。
- ［DBスキーマ変更を伴う場合のマイグレーションリスク］: 前プロジェクトの work-log.md で判明した通り、ローカル`prisma/dev.db`と本番Tursoの`_prisma_migrations`履歴に既知のドリフトがあり、`npx prisma migrate dev`のCLI実行が完走しない。列追加が必要な設計（候補B）を選ぶ場合、前回同様マイグレーションSQLの手動作成が必要になる可能性が高い。影響度: 中〜高（設計次第で回避可能。候補Aを選べばこのリスクは消える）。
- ［dev/prod DB共有構成］: MuscleBoostはTursoを開発・本番で共有しているため、マイグレーションやシードの実行・検証時は本番データへの影響に注意が必要（前プロジェクトの申し送り事項）。影響度: 高（データ破壊リスク）。
- ［weightValue が null の記録の扱いが未確定］: 集計ロジックの分岐（0扱い／除外／表示自体をスキップ）を設計時に明確化しないと、実装者ごとにブレる可能性がある。影響度: 中。
- ［lb記録の扱いが未確定］: 「KG前提」が「lb記録は換算して含める」のか「lb記録はそもそも対象外」なのか本文だけでは一意に決まらない。誤った解釈で実装すると手戻りが発生する。影響度: 中。
- ［丸め処理の一貫性］: カロリーは小数第1位で`Math.round(x*10)/10`丸め。ボリュームも同様の丸め規則を明示的に決めないと、表示ごとに丸め誤差の見え方が変わる可能性がある。影響度: 低〜中。

## 設計者への申し送り
- 新指標の計算式は `weightValueKg × setCount × repsPerSet`（KG換算後の値を使用）とし、`src/lib/calorie.ts`と対になる形で `src/lib/volume.ts`（仮）に純粋関数として実装するのが既存パターンとの一貫性が最も高い。関数シグネチャはカロリーの`CalorieCalcInput`インターフェースに倣った入力オブジェクト形式を推奨。
- `weightValue`が`null`のログは「ボリューム計算対象外（0扱いではなく、その記録のボリューム表示自体を省略）」とし、`WorkoutLogItem.tsx`の`bodyWeightKgOverride`/`weightValue`表示と同じ「値がある時だけ追記」の条件分岐パターンを踏襲することを推奨。ただしセッション合計への算入方法（nullを0として加算 or 完全除外、結果的に同じ）は設計書で明記すること。
- lb単位記録の扱い（換算して合算するか、除外するか）はユーザーへの再確認、または要件定義フェーズで明文化してから設計に進むべき。換算する場合の係数は `1 lb = 0.45359237 kg` を`src/types/index.ts`か新規`lib`ファイルに定数として定義し、テストで境界値（0, null, 非常に大きい値、NaN/Infinity）を検証すること（`calorie.test.ts`と同じパターン）。
- DBへのスナップショット保存（候補B）は前プロジェクトのマイグレーション課題を再度踏むリスクがあるため、要件上「編集後も過去の記録時点の値を保持する必要がある」等の明確な理由がない限り、候補A（都度計算・DB変更なし）を第一候補として設計することを推奨。
- 表示箇所は記録ごと（`WorkoutLogItem.tsx`）とセッション合計（`WorkoutSessionLogs.tsx`）の最低2箇所。カロリーと同様にセッション一覧（`workouts/page.tsx`）やダッシュボード（`getDashboardStats`）にも合計を出すかは要件で明示的に確認すべき（依頼文には「記録ごと・セッション合計」としか書かれていないため、それ以外への波及はスコープ外と解釈するのが妥当）。
- テストは`tests/unit/calorie.test.ts`と同一パターン（正常系、0/null/負数/NaN/Infinityの境界値、lb換算がある場合は換算の正確性）で新規ファイルを作成することを推奨。
