---
project_id: "2026-09-15-0020-optional-duration-strength"
phase: research
created: "2026-09-15"
---
# 情報収集レポート: 運動時間の任意化（有酸素系は必須維持・筋トレ系は固定想定値で算出）

## 結論サマリー
- 有酸素/筋トレの判定は `Exercise.muscleGroup === "CARDIO"` で確定できる（確認済み: シードデータ・型定義とも「CARDIO=有酸素、それ以外7種=筋トレ」で完全一致し、曖昧な種目は存在しない）。追加のフラグ列は不要。
- `durationMinutes` は現状 DB上 `Float`（NOT NULL）・Zodで`positive()`必須。筋トレ系を任意化するには (1) Zodスキーマの`superRefine`で`muscleGroup`に応じた条件付き必須化、(2) 筋トレ系選択時は`durationMinutes`未入力でもサーバー側で固定想定値から推定して`calculateCalories`に渡す、という2段の変更が必要。DBスキーマ（`durationMinutes Float`非null）は変更せず、推定値を計算してそのまま保存すれば列自体は無変更で済む。
- 想定時間の算出材料は`setCount`・`repsPerSet`が唯一使える（DBに既存で必須入力・非nullのため）。「1repあたりの想定秒数」「セット間休憩秒数」は業界の一般的目安はあるが、厚労省がこの用途向けに公式値を出している一次情報は見つからなかった（厚労省メッツ表はMET値の出典であり、レップ/休憩の秒数目安の出典ではない）。既存コード中の「厚生労働省の実務基準」コメントは`CALORIE_CORRECTION_FACTOR=1.05`のみを指しており、今回の秒数想定値とは無関係な別の数値なので混同注意。
- UIは`WorkoutLogForm.tsx`と`WorkoutSessionLogs.tsx`（編集モーダル）の2箇所に運動時間入力欄があり、いずれも選択中種目の`muscleGroup`に基づき必須/任意表示を切り替える改修が要る。両フォームとも`exercises: ExerciseDTO[]`を既に受け取っており`muscleGroup`は取得済みなので、追加のデータ取得は不要。
- 既存e2e（`tests/e2e/workout-flow.spec.ts`）は全ケースが筋トレ系（チェストプレス）で運動時間欄に明示的に入力しているため、欄を非表示にする実装にすると`page.getByLabel("運動時間（分）")`が失敗し得る。実装方針次第でテスト更新が必須になる点は設計・実装フェーズへの重要な申し送り。

## 確認済み事実
- `kcal = MET × 体重(kg) × 時間(h) × 1.05`。`durationMinutes`が0以下・NaN・Infinityの場合は0を返す防御ロジックあり（出典: `C:\project\MuscleBoost\src\lib\calorie.ts:17-29`）。
- `CALORIE_CORRECTION_FACTOR = 1.05`のコメント「厚生労働省の実務基準に基づく補正係数」（出典: `src/lib/calorie.ts:3-4`）。これは今回の「1repあたり秒数」等の想定値とは別物。
- `Exercise.muscleGroup`はString型（enumではなくDB上は自由文字列、アプリ側でリテラルユニオン運用）。コメントで許容値`"CHEST"|"BACK"|"LEGS"|"SHOULDERS"|"ARMS"|"ABS"|"FULL_BODY"|"CARDIO"`を明記（出典: `prisma/schema.prisma:27-44`）。
- `WorkoutLog`モデルは`setCount Int`・`repsPerSet Int`・`durationMinutes Float`がいずれも非null必須列（出典: `prisma/schema.prisma:60-86`）。マイグレーション変更なしで筋トレ系も「推定した数値」を`durationMinutes`に保存する運用にすれば列定義自体は変えずに済む。
- `secondsPerSetOverride Int?`という類似名の列が存在するが、既存調査で「バリデーション・DTO・Server Actionのいずれにも一切登場しない死んだフィールド」と複数回確認済み（出典: `prisma/schema.prisma:69`、`.project/research/topics/2026-09-14-1040-machine-weight-input.md:18`、`.project/research/topics/2026-09-14-1727-remove-seconds-per-set.md:24`）。今回のタスクでもスコープ外・触らないこと。
- `prisma/seed.ts`: 筋トレ系10種（`STRENGTH_MACHINES`、`muscleGroup`は`CHEST`/`BACK`/`LEGS`/`SHOULDERS`/`ABS`/`FULL_BODY`のいずれか、MET値は全種目共通5.5）と、有酸素系6種（`CARDIO_MACHINES`、`muscleGroup: "CARDIO"`固定、MET値は3.5〜8.3で種目ごとに異なる）が完全に分離して定義されている（出典: `prisma/seed.ts:18-43`）。境界事例（有酸素なのにCARDIO以外、または筋トレなのにCARDIO）はシードデータ上ゼロ件。
- 有酸素6種のMET値は厚労省メッツ表準拠、筋トレ10種のMET値はCompendium of Physical Activities準拠という出典コメントが`seed.ts`内にある（出典: `prisma/seed.ts:12-17, 34-43`）。
- `workoutLogInputSchema`（Zod）は`durationMinutes: z.number().positive().max(600)`で無条件必須。`muscleGroup`や`exerciseId`に応じた条件分岐は現状ない（出典: `src/lib/validation.ts:28-56`）。`superRefine`で`weightValue`/`weightUnit`のペア制約を実装済みの前例があり、同じ手法（`superRefine`＋`ctx.addIssue`）が今回の条件付き必須化にも転用できる。ただし現状の`workoutLogInputSchema`は`muscleGroup`を受け取っていない（`exerciseId`のみ）ため、Zodスキーマ内で判定するには別途`muscleGroup`をinputに含めて渡すか、Server Action側（`exercise`をDBから取得済みの時点）でバリデーションする設計が必要。
- `addWorkoutLog`/`updateWorkoutLog`はどちらも`exercise = await prisma.exercise.findUnique(...)`で種目マスタを取得済みの箇所があり、`exercise.muscleGroup`はServer Action内で常に参照可能（出典: `src/app/actions/workouts.ts:43-46, 128-133`）。Zod検証（`workoutLogInputSchema.safeParse`）は`exercise`取得より前に走るため、現状のままだと「筋トレ系はdurationMinutes省略可」をZod単体では判定できず、Zod側は`durationMinutes`を`optional()`にした上でexercise取得後にServer Action側で「CARDIOなのに未入力ならエラー」を追加检証する設計が必要になる。
- `calculateCalories`/`updateWorkoutLog`双方とも、計算後の`durationMinutes`（＝ユーザー入力値そのもの）を`prisma.workoutLog.create/update`の`data`にそのまま保存している（出典: `src/app/actions/workouts.ts:67-79, 147-159`）。筋トレ系で推定値を使う場合も同じ経路で「推定したdurationMinutes」を保存すれば、DTO・表示側（`WorkoutLogDTO.durationMinutes`は既存のまま非null number）を一切変更せずに済む。
- `WorkoutLogForm.tsx`は`exercises: ExerciseDTO[]`を受け取り`ExercisePicker`に渡している。選択中`exerciseId`から`exercises.find(...)`で`muscleGroup`を引ける（出典: `src/components/WorkoutLogForm.tsx:10-27, 82-90`）。運動時間入力欄は117-129行目の独立した`<div>`ブロック。
- `WorkoutSessionLogs.tsx`（編集モーダル）は`WorkoutLogForm`を再利用しておらず、独自にstate（`editDurationMinutes`等）を持つ別実装（出典: `src/components/WorkoutSessionLogs.tsx:20-64, 109-167`）。`exercises`は既にprops経由で受け取っている（124行目で`ExercisePicker`に渡している）ため、編集モーダル側でも同様に`muscleGroup`判定は可能。
- `ExerciseDTO`は既に`muscleGroup: MuscleGroup`を持つ（出典: `src/types/index.ts:20-28`）ので、DTO変更は不要。
- 既存単体テスト: `tests/unit/calorie.test.ts`（`calculateCalories`のみ、9ケース）、`tests/unit/volume.test.ts`（`calculateVolumeKg`、14ケース）、`tests/unit/weight.test.ts`（`resolveWeightKgForCalorie`）。いずれも今回の変更対象（推定時間算出ロジック）に直接該当するテストは存在せず、新規追加が必要（出典: `tests/unit/calorie.test.ts`全文、`tests/unit/volume.test.ts`全文）。
- 既存e2e `tests/e2e/workout-flow.spec.ts`は全6シナリオが「チェストプレス」（筋トレ系, muscleGroup=CHEST）を使い、いずれも`page.getByLabel("運動時間（分）").fill("30")`を明示実行し、カロリー期待値（202.1kcal等）もその30分入力を前提に計算されている（出典: `tests/e2e/workout-flow.spec.ts:76-79, 99-101, 113-115, 132-134, 138-140, 152-154, 172-174`)。今回「筋トレ系は運動時間欄を不要にする」実装にすると、欄の非表示/ラベル変更/必須表示解除のいずれの実装方法を取っても、このテスト群のセレクタや期待カロリー値の更新が必要になる可能性が高い。
- 過去プロジェクト`2026-09-14-1727-remove-seconds-per-set`で削除されたのは「1セットあたり秒数（任意）」というクライアント側のみのローカルstate・自動計算補助ボタン（DB非保存、`estimateDurationMinutes(setCount, secondsPerSet)`という純粋関数もセットで削除済み）であり、現在`src/lib/calorie.ts`にこの関数は存在しない（出典: `.project/pm/reports/2026-09-14-1727-remove-seconds-per-set.md`、実ファイル`src/lib/calorie.ts`全文で該当識別子なしを確認）。今回の「固定推定値による内部算出」はUI入力を伴わない点・削除された機能とは実装対象がゼロから異なる点に注意（設計時に旧関数を単純復活させるのではなく、新規に妥当性を検討した推定ロジックを設計すること）。
- トレーニングボリューム機能（`src/lib/volume.ts`の`calculateVolumeKg`）は`setCount`・`repsPerSet`・`weightValue`・`weightUnit`のみを使い、`durationMinutes`には一切依存しない独立関数（出典: `src/lib/volume.ts`全文）。今回のカロリー計算変更（`durationMinutes`の扱い変更）はボリューム計算に影響しない。

## 推測・未確認
- 「1repあたりの想定秒数」「セット間休憩の想定秒数」について、日本の厚労省が本用途向けに公式な数値を定めているという記述はWeb検索では見つからなかった（未確認・おそらく存在しない）。既存コード内の「厚生労働省の実務基準」コメントは`1.05`という別の係数の出典であり、レップ/休憩秒数とは無関係と判断する（要再確認: 設計者は厚労省側の一次資料PDFを直接あたるなら`健康づくりのための身体活動・運動ガイド2023`を参照する余地はあるが、本レポートの検索範囲ではメッツ表以外にレップ秒数の記載は確認できなかった）。
- 想定推定式の具体形（例: `推定分 = setCount × (repsPerSet × 秒/rep + 休憩秒) / 60`）は依頼文中で「例」として挙げられているのみで確定していない。数値（秒/rep、休憩秒）も未確定であり設計フェーズでの決定事項。
- カスタム種目（`isCustom: true`）でユーザーが`muscleGroup: "CARDIO"`を選んだ場合の扱いは、既存の判定ロジック（`muscleGroup === "CARDIO"`）にそのまま従えば一貫するはずだが、この点を明示的に検証したテストは存在しない（推測: 問題にはならないはずだが設計時に一言明記すべき）。

## 既存コードベースの関連箇所
- `src/lib/calorie.ts`: `calculateCalories()` — MET×体重×時間×1.05のカロリー計算。`durationMinutes`の由来（ユーザー入力か推定値か）を区別しない純粋関数。
- `src/lib/volume.ts`: `calculateVolumeKg()` — トレーニングボリューム算出。`durationMinutes`不使用、今回の変更と独立。
- `src/lib/validation.ts`: `workoutLogInputSchema` — `durationMinutes: z.number().positive().max(600)`が無条件必須。条件付き必須化のための改修対象。
- `src/app/actions/workouts.ts`: `addWorkoutLog`/`updateWorkoutLog` — Zod検証後に`exercise`をDBから取得しているため、`muscleGroup`に応じた「CARDIOなら必須・そうでなければ推定」の分岐ロジックをここに実装するのが自然な位置。
- `src/components/WorkoutLogForm.tsx`: 新規追加フォーム。運動時間入力欄（117-129行目）の必須/任意表示切替が必要。`exercises`から選択中`exerciseId`の`muscleGroup`を引く処理を追加する必要あり。
- `src/components/WorkoutSessionLogs.tsx`: 編集モーダル（109-167行目）。`WorkoutLogForm`とは別実装のため、同様の分岐ロジックを重複実装するか、共通化するかは設計判断が必要。
- `src/components/ExercisePicker.tsx`: 種目選択プルダウン。`muscleGroup`表示ラベルは既にオプション内に含まれる（`ex.name（部位/MET値）`）が、選択変更イベント自体は`exerciseId`のみを親へ通知する構造。親コンポーネント側で`exercises.find()`によるルックアップが必要。
- `prisma/schema.prisma` / `prisma/seed.ts`: DBスキーマ変更は不要と判断できる（`durationMinutes`列は非null Floatのまま、推定値を代入すれば足りる）。ただし設計フェーズで本当に列変更なしで完結するか改めて確認すること。
- `tests/unit/calorie.test.ts`, `tests/unit/volume.test.ts`: 新規の推定ロジック用テストファイル（例: `tests/unit/duration-estimate.test.ts`等）を追加する想定。既存2ファイルへの変更は基本的に不要と推測されるが、`calculateCalories`のシグネチャ自体を変えない限り無変更で済むはず。
- `tests/e2e/workout-flow.spec.ts`: 筋トレ系を使う全シナリオが運動時間欄への明示入力を前提にしている。UI変更内容次第で更新必須。

## 採用候補と比較
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| A. Server Action内で`exercise.muscleGroup`取得後に分岐（Zodの`durationMinutes`は`optional()`化し、CARDIOなら別途手動チェックでエラーを返す） | 既存の「exercise取得はServer Action内」という構造に忠実。Zodスキーマの複雑化を避けられる。UIとロジックの責務分離が明確 | Zod単体では完結しない検証となり、`fieldErrors`形式のエラー返却をZod以外の経路で手動生成する追加コードが要る（既存の`parsed.error.flatten().fieldErrors`パターンと形式を合わせる工夫が必要） | 推奨（既存アーキテクチャとの親和性が高い） |
| B. `workoutLogInputSchema`に`muscleGroup`を入力として含め、Zodの`superRefine`のみで完結させる | 検証ロジックが1箇所（Zod）に集約される。`weightValue`/`weightUnit`のペア検証と同じパターンを踏襲できる | クライアント（フォーム）が「選択中種目のmuscleGroup」をサーバーに送る必要があり、サーバーはDBの`exercise.muscleGroup`と二重管理になる（クライアント申告値とDB値の不一致リスク：改ざん耐性の観点で望ましくない） | 非推奨（信頼境界の観点でリスクあり） |
| C. 固定推定値の算出式: `分 = setCount × (repsPerSet × 秒/rep + 休憩秒) / 60` | setCount・repsPerSetは常に非null必須入力のため常に計算可能。ボリューム計算と同じ入力群を使う一貫性がある | 秒/rep・休憩秒の具体値に業界標準の一次情報（厚労省等）が存在しないため、値の妥当性根拠は「一般的なトレーニング指導目安」止まりになる（設計書に根拠と割り切りを明記する必要） | 推奨（依頼文の例示とも一致） |
| D. 固定推定値を「種目によらない一律の分数」（例: 一律5分）にする | 実装が最も単純 | セット数・レップ数を全く反映せず、依頼文の「セット数・レップ数から時間を推定」という趣旨（ユーザーとの確認応答にある「マシンの種類、重さ、回数、セット数にて算出は不可？」）に反する | 非推奨 |

## 制約・前提・リスク
- 判定基準の一貫性: `muscleGroup === "CARDIO"`のみで判定する場合、将来ユーザーがカスタム種目で「有酸素だが`muscleGroup`をCARDIO以外に設定する」ような誤登録をすると、筋トレ系として扱われ運動時間が任意になってしまう。影響度: 低（現状シードデータでは発生しないが、カスタム種目作成フォームの`muscleGroup`選択に依存する運用上のリスクとして申し送るべき）。
- 既存e2eテストの破壊: 筋トレ系（チェストプレス）で運動時間欄に明示入力する既存シナリオ6件が、UI変更（欄の非表示化や必須マーク変更）によりセレクタ不一致・期待カロリー不一致で失敗する可能性が高い。影響度: 高（テスト更新が実装スコープに事実上含まれる）。
- Zod検証とServer Action検証の二段構成による複雑化: `durationMinutes`を無条件必須のZodから外し、CARDIO判定はServer Action内の追加チェックに置くと、バリデーションロジックが2箇所に分散する。影響度: 中（設計書で責務分担を明記しないと実装時に食い違うリスク）。
- 後方互換性: 既存の`WorkoutLog`レコード（過去に保存された`durationMinutes`）は本改修の影響を受けない（読み取り時は保存済みの値をそのまま使うだけで再計算しない）。影響度: 低（回帰なし）。
- DBスキーマ変更なしという前提の妥当性: `durationMinutes Float`列は非nullのままで、筋トレ系も「推定した値」を保存する設計とすることでマイグレーション不要にできる。ただし、この設計だと後から「実際の入力値か推定値か」をDB上で区別できない（区別が今後必要になった場合は別途フラグ列の追加検討が要る）。影響度: 中（将来要件次第で手戻りの可能性）。
- 推定値の妥当性根拠の薄さ: 厚労省等の一次情報に「1repあたり秒数」「セット間休憩秒数」の公式基準が見当たらないため、設計書に採用値の出典（NSCA/ACSM等の一般的なトレーニング指導目安、または合理的な仮定である旨）を明記しないと、後から「なぜこの秒数か」の説明責任を果たせない。影響度: 中。

## 設計者への申し送り
- 有酸素/筋トレの判定は`exercise.muscleGroup === "CARDIO"`の1条件のみで確定してよい（シードデータ上、境界事例は存在しないことを確認済み）。追加のDBフラグ列は不要と判断してよい。
- Zodの`workoutLogInputSchema`から`durationMinutes`の`positive()`必須制約を外し`optional()`にした上で、CARDIO種目の場合の必須チェックは`addWorkoutLog`/`updateWorkoutLog`内（`exercise`取得後）に実装する設計を推奨する（候補A）。エラー時のレスポンス形式（`fieldErrors.durationMinutes`）を既存のZodエラー形式と揃えるための実装方法（手動で`ActionResult`の`fieldErrors`オブジェクトを組み立てる等）を詳細設計で明確に指定すること。
- 推定分数の算出式・定数（秒/rep、セット間休憩秒）は`src/lib/calorie.ts`に既存の`CALORIE_CORRECTION_FACTOR`と同様のコメント付き定数として追加する方針が既存コードスタイルと一貫する。関数名は過去に削除された`estimateDurationMinutes`と紛らわしいため、別名（例: `estimateDurationMinutesForStrength`等、用途が「筋トレ系専用の内部推定」であることが分かる名前）を検討し、旧削除機能との混同を避けること。
- UIの実装方針（運動時間欄を「非表示にする」か「任意ラベルに変えてグレーアウト表示に留める」か）を明確に決定すること。この決定次第で`tests/e2e/workout-flow.spec.ts`の更新要否・更新内容（セレクタ、期待カロリー値）が変わるため、設計書に既存e2eへの影響と要更新箇所を明記すること。
- `WorkoutLogForm.tsx`（新規追加用）と`WorkoutSessionLogs.tsx`（編集用、独自state実装）の2箇所に同じ「muscleGroup判定→運動時間欄の要否切替」ロジックが必要になる。共通化（カスタムフックや共通コンポーネント抽出）するか、既存の重複実装パターン（この2ファイルは既に重複が多い）を踏襲してそれぞれ個別実装するかを明示的に決定すること。
- 新規テスト（推定ロジックの単体テスト）は`tests/unit/`配下に新規ファイルを追加し、既存の`calorie.test.ts`・`volume.test.ts`と同じスタイル（正常系・0/負数/NaN/Infinity境界値）を踏襲すること。
