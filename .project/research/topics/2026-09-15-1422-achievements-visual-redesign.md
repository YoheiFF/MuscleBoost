---
project_id: "2026-09-15-1422-achievements-visual-redesign"
phase: research
created: "2026-09-15"
---
# 情報収集レポート: 実績画面（/workouts）へのビジュアル要素4種（カレンダーヒートマップ／推移トレンドグラフ／部位別バランス／自己ベスト＆達成バッジ）追加

## 結論サマリー
- 【確認済み】現状の集計はすべて`src/app/actions/workouts.ts`内で「対象期間のWorkoutSession（+logs）をPrismaで取得し、JS側のreduceでその場集計」する方式（保存済み集計値のキャッシュなし）。今回の4要素はいずれも新規の集計関数（日別集計、部位別集計、種目別最大値、ストリーク計算）をこの方式の延長で追加実装する必要があり、既存クエリの流用だけでは不足する。
- 【確認済み】日付境界（「同じ日」判定）は`src/lib/date.ts`の`getJstDayRangeUtc`（固定+9時間オフセット方式、TZ環境変数非依存）に一元化されており、新規集計（ヒートマップの日別バケット化・ストリーク計算）もこの関数を再利用/準拠させることが設計上の必須要件。`getPeriodRange`は単純な「現在時刻からNミリ秒前」窓であり暦日境界ではないため、月別/週別集計には別途JST暦日・暦週・暦月境界のユーティリティ追加が必要。
- 【確認済み】チャート描画ライブラリは現状ゼロ（package.jsonにグラフ系依存なし）。推奨は**Recharts**（トレンドのライン/エリアチャート、部位別バランスのレーダー/ドーナツの3種を1ライブラリでカバーでき、依存追加を最小化できる）。ただしRechartsはブラウザAPI（ResizeObserver等）に依存するため利用箇所は必ず`"use client"`コンポーネントに閉じ込め、データ取得（Server Action）とレンダリング（Client Component）を分離する必要がある。
- 【確認済み・推奨】カレンダーヒートマップ（GitHubコントリビューション風）はチャートライブラリを使わず、CSS Grid + Tailwindの色レベル分けで自前実装するのが最適（インタラクション最小・Server Componentのまま実装可能・依存追加不要）。既存プロジェクトの「凝ったUIライブラリを入れず素朴なTailwindで組む」慣習（`StatsSummaryCard`等）とも整合する。
- 【未確認・要検討】「自己ベスト」を種目単位（Exercise.id）で見るか種目名単位で見るかは要件次第。カスタム種目（`Exercise.isCustom`, ユーザー固有）とマスタ種目が混在するため、種目統合・削除時の自己ベスト表示の扱いは設計フェーズで確認が必要。

## 確認済み事実

### 実績画面・既存集計ロジック
- `src/app/workouts/page.tsx:7-12`: `getDashboardStats(7)` / `getDashboardStats(30)` / `listWorkoutSessions()` を`Promise.all`で並列取得し、`StatsSummaryCard`2枚＋セッション履歴テキストリストを表示するのみ。グラフ・バッジ等のビジュアル要素は皆無。
- `src/app/actions/workouts.ts:335-358` `getDashboardStats(periodDays: 7 | 30)`: `getPeriodRange(periodDays)`で「現在時刻から`periodDays*24h`前〜現在」のWorkoutSession（`logs`をinclude）を取得し、`totalCalories`/`sessionCount`/`logCount`をJS側で`reduce`集計。**日別・部位別のブレークダウンは行っていない**。
- `src/app/actions/workouts.ts:281-295` `listWorkoutSessions()`: 全期間の`WorkoutSession`（`logs`をinclude）を`performedAt desc`で取得し、セッションごとの`logCount`/`totalCalories`をJSで算出。ヒートマップの「日別トレーニング有無」の元データとしてはこの全件取得＋`performedAt`日付丸めで代用可能だが、件数が増えると非効率（後述）。
- `src/lib/volume.ts:30-41` `calculateVolumeKg()`: 1ログ分のボリューム(kg)を計算する純粋関数。DBには保存されず、都度計算（`getWorkoutSession`, `WorkoutSessionLogs`で使用）。トレンドグラフの「週別/月別ボリューム推移」を出すには、この関数をログ単位で適用した後に日付でグループ化する新規集計が必要。
- `src/components/StatsSummaryCard.tsx`: Server Componentとして親から渡された`DashboardStatsDTO`をそのまま描画するだけのシンプルな表示専用コンポーネント。ロジックを持たない。今回追加するグラフ系コンポーネントもこの「データはServer Action/親で取得、コンポーネントは表示に専念」という分離を踏襲するのが自然。

### スキーマ（今回の4要素に関連する構造）
- `prisma/schema.prisma:39-56` `WorkoutSession`: `id, userId, performedAt(DateTime), memo, createdAt, updatedAt`のみ。インデックスは`@@index([userId, performedAt])`（出典: `prisma/schema.prisma:57`）。ヒートマップ・ストリーク計算はこの`performedAt`＋`userId`のインデックスを使った範囲検索で実現可能。
- `prisma/schema.prisma:58-79` `WorkoutLog`: `exerciseId, setCount, repsPerSet, durationMinutes, weightValue, weightUnit, metValueSnapshot, caloriesBurned`等を保持。インデックスは`@@index([workoutSessionId])`, `@@index([exerciseId])`。**「種目ごとの最大重量」を出すには`weightValue`（＋`weightUnit`換算）を`exerciseId`でグループ化し`MAX`する必要があるが、`weightValue`列に直接インデックスは無い**（`exerciseId`にはある）。「最大ボリューム」は保存列ではなく`calculateVolumeKg()`の計算結果のため、DB側の`MAX()`集計では出せず、アプリ側で全ログを読み出してから計算する必要がある。
- `prisma/schema.prisma:16-37` `Exercise`: `muscleGroup`は文字列（`"CHEST"|"BACK"|"LEGS"|"SHOULDERS"|"ARMS"|"ABS"|"FULL_BODY"|"CARDIO"`、`src/types/index.ts:3-11`の`MUSCLE_GROUPS`/`MUSCLE_GROUP_LABELS`で定義）。部位別バランス集計は`WorkoutLog`から`exercise.muscleGroup`経由で参照する必要があり、`WorkoutLog`自体には`muscleGroup`の非正規化列は無い（`WorkoutLogDTO.muscleGroup`はServer Action側で`exercise.muscleGroup`を都度詰めているだけ。出典: `src/app/actions/workouts.ts:97,148`、`src/types/index.ts:44-48`のコメント）。
- `WorkoutLog.secondsPerSetOverride`（`prisma/schema.prisma:69`）と`bodyWeightKgOverride`（`prisma/schema.prisma:73`）はコードコメントにより明示的に**廃止済み・未使用列**（アプリケーションコードから一切参照禁止）。今回の新規集計でも触れてはいけない。

### タイムゾーン・日付境界の既存パターン
- `src/lib/date.ts:10-15` コメントで明言: 「同じ日」の判定はサーバー実行環境のTZ設定に依存させないため、`Intl`のタイムゾーン機能や`TZ`環境変数を使わず、`JST_OFFSET_MS = 9*60*60*1000`の固定オフセットで暦日境界を計算する方針。`getJstDayRangeUtc(date)`が単一の情報源（半開区間`[dayStartUtc, dayEndUtc)`を返す）。
- 直近の関連プロジェクト`.project/research/topics/2026-09-15-1023-same-day-session-continuity.md`で、本番VPSのシステムTZが未確認である旨・JST固定オフセット方式を採用した経緯が詳述されている（出典: 同ファイル47-48行, 71行）。この設計判断（TZ環境変数非依存・固定オフセット）は今回のヒートマップ/週別・月別集計でも踏襲すべき前提。
- `getPeriodRange(days)`（`src/lib/date.ts:4-8`）は「現在時刻からdays日前」という**単純な時間窓**であり、暦日・暦週・暦月の境界とは無関係。週別/月別トレンドグラフの「今週」「今月」の定義をJST暦週・暦月で行うなら、`getJstDayRangeUtc`と同じ設計方針（固定オフセット計算）で暦週・暦月境界を返す新規関数を`src/lib/date.ts`に追加する必要がある。

### UI/コンポーネントの慣習
- スタイリングはTailwind CSS v4（`@import "tailwindcss"`、`src/app/globals.css:1-12`）のみ。UIコンポーネントライブラリ（shadcn/ui, MUI等）は不使用。色はTailwindのデフォルトパレット（`gray-*`, `blue-600`, `red-600`, `amber-*`）をインラインクラスで直接指定。CSS変数はbackground/foregroundの2つのみで、ダークモード対応やデザイントークン体系は存在しない。
- コンポーネント粒度は小さく単機能（`StatsSummaryCard`, `WorkoutLogItem`, `CalorieDisclaimer`等、1コンポーネント=1画面要素）。Server Component（データ取得系ページ）とClient Component（`"use client"`、フォームや編集状態を持つもの、例: `WorkoutSessionLogs.tsx:4`, `WorkoutLogForm.tsx`）の分離は明確。データ取得はページ（Server Component）またはServer Actionが担い、Client Componentは受け取ったpropsの表示・操作に専念する。
- モーダルは`fixed inset-0 bg-black/30`パターンで自前実装（`WorkoutSessionLogs.tsx:117`）。特別なアニメーション・トランジションライブラリは使用していない。

### チャートライブラリ調査
- `package.json`の`dependencies`/`devDependencies`にグラフ・可視化系ライブラリは一切含まれない（確認済み、`package.json`全文を確認）。`node_modules/recharts`も存在しない（確認済み、ローカル環境で未インストール）。
- Recharts, visx, Chart.js, react-calendar-heatmap等いずれも新規追加が必要。

## 推測・未確認
- 【推測・要検証】ユーザーデータ量は小規模（seed投入は筋トレ10種+有酸素6種の計16マスタ種目、`prisma/seed.ts`）。個人〜小規模ジム利用が想定され、1ユーザーあたりの`WorkoutSession`は年間数百件規模と推測する。この前提であれば、当面はDBクエリでの集計最適化（`groupBy`, `aggregate`）を急ぐ必要はなく、アプリ側でのその場計算でも許容範囲と推測されるが、実際のユーザー数・利用期間の想定は未確認。
- 【推測】「自己ベスト」は種目（`exerciseId`）単位での最大重量・最大ボリュームを想定していると推測するが、カスタム種目（ユーザーごとに作成可能、`Exercise.isCustom`/`createdByUserId`）を編集・削除した場合に過去の自己ベスト表示がどう扱われるべきかは未確認（要件定義で確認推奨）。
- 【推測】「連続トレーニング日数（ストリーク）」の定義は「JST暦日ベースで、記録がある日が連続している日数」と推測するが、「1日に複数セッションでも1日としてカウントする」という前提は`2026-09-15-1023-same-day-session-continuity`プロジェクトの「1 JST暦日=1セッション」設計と整合的（find-or-createにより1暦日1`WorkoutSession`に正規化済みのため、ストリーク計算は「対象userIdの`WorkoutSession.performedAt`をJST暦日に丸めてユニークな日付集合を作り、そこから連続日数を数える」というシンプルな実装で足りると推測）。ただし同プロジェクト実装前に作成された既存データ（同一暦日に複数`WorkoutSession`が存在するケース）が残っている可能性があり、ストリーク計算側でも重複日付を丸め込む必要がある。
- 【未確認】達成バッジのマイルストーン基準値（例: 「7日連続」「30回セッション達成」等の閾値）はユーザー依頼文に具体的数値の指定が無く、設計フェーズで定義する必要がある。

## 既存コードベースの関連箇所
- `src/app/workouts/page.tsx`: 実績画面本体。4要素を追加する主戦場（Server Component）。
- `src/app/actions/workouts.ts`: `getDashboardStats`, `listWorkoutSessions`, `getWorkoutSession`を保持。新規集計関数（例: `getWorkoutHeatmapData`, `getTrendSeries`, `getMuscleGroupBalance`, `getPersonalBests`, `getStreakInfo`等）を同ファイルまたは新規`src/app/actions/achievements.ts`的なファイルに追加するのが自然。
- `src/lib/date.ts`: JST暦日境界の唯一の情報源。ヒートマップの日付バケット化・ストリーク計算・週別/月別トレンドの境界計算はすべてこのファイルの設計方針（固定+9時間オフセット、TZ非依存）に準拠した新規関数を追加して使うべき。
- `src/lib/volume.ts`, `src/lib/calorie.ts`: 1ログ単位の値計算ロジック。トレンド・自己ベスト集計はこれらの関数の出力を日付/種目でグループ化する形になる（関数自体の変更は不要）。
- `src/types/index.ts`: `MuscleGroup`, `MUSCLE_GROUP_LABELS`, DTO型定義。部位別バランスのラベル・色マッピングはここの`MUSCLE_GROUP_LABELS`をそのまま流用可能。新規DTO（`HeatmapDayDTO`, `TrendPointDTO`, `MuscleGroupBalanceDTO`, `PersonalBestDTO`, `StreakInfoDTO`等）をこのファイルに追加するのが既存慣習と整合。
- `src/components/StatsSummaryCard.tsx`: 表示専用コンポーネントの参考実装。新規グラフコンポーネントも「データはpropsで受け取り、コンポーネント内では計算しない」方針を踏襲すべき。
- `prisma/schema.prisma`: `WorkoutSession.performedAt`, `WorkoutLog.exerciseId/weightValue/weightUnit`が集計の起点。スキーマ変更（新規カラム追加）は今回の4要素いずれも不要と推測される（すべて既存データからの導出値）。
- `.project/research/topics/2026-09-15-1023-same-day-session-continuity.md`: 「1 JST暦日=1セッション」のfind-or-create設計の経緯。ストリーク計算の前提として必読。

## 採用候補と比較

### チャートライブラリ本体（トレンドグラフ・レーダー/ドーナツ用）
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| **Recharts**（MIT） | ライン/エリア/レーダー/パイ(ドーナツ)を1パッケージで網羅でき依存追加が1つで済む。SVGベースでTailwindとの併用がしやすく、APIがシンプルで学習コスト低い。React 19対応版あり。ドキュメント・実装例が豊富で、今回の3チャート種別（トレンド、レーダー、ドーナツ）すべてに公式コンポーネントが存在する | バンドルサイズは中程度（gzip後おおよそ90〜100KB程度、D3の一部モジュールを内包）。内部でResizeObserver等ブラウザAPIに依存するため必ずClient Componentに隔離が必要（RSCとの直接併用不可）。カスタマイズの自由度はvisxよりは低い | **高（本命）** |
| **visx**（Airbnb, MIT） | D3の各モジュールを個別importできるため理論上バンドルを絞れる。プリミティブなSVG構成要素の組み合わせで自由度が非常に高い | レーダーチャート等は自前で座標計算するコードを書く必要があり実装コストが高い（Rechartsのような「RadarChart」既成コンポーネントは無い）。学習コスト・実装工数が本プロジェクトの規模（小規模な個人開発アプリ、依存を増やさずシンプルに保つ既存方針）に対して過剰 | 中（トレンドグラフのみなら候補になりうるが、レーダー/ドーナツまで含めると工数増大） |
| **生SVG自前実装（ライブラリ無し）** | 依存ゼロ。バンドル増加なし。デザインの完全な自由度、Server Componentのまま実装可能な部分が多い | ライン/エリアの座標変換、レーダーの多角形座標計算、ドーナツの円弧(`stroke-dasharray`)計算などをすべて自前で書く必要があり、3種類のチャートを個別に実装するのは工数・保守コストが高い。エッジケース（0件データ、1点のみ等）のバグ混入リスクも増える | 低〜中（トレンド1種類だけに限定するなら現実的だが、3種類全部を賄うには非推奨） |
| Chart.js（+ react-chartjs-2） | 高機能・実績豊富 | Canvas描画のためTailwindとのスタイル統一（フォント・色のCSS変数連携）がSVG系よりやりづらく、レスポンシブ対応にラッパー追加が要る。今回の規模には過剰 | 低 |

**推奨**: トレンドグラフ（ライン/エリア）と部位別バランス（ドーナツ推奨、レーダーはデータ次元数=6〜8のmuscleGroup種別と相性は悪くないが視認性はドーナツの方が「頻度/割合」の直感的把握に優れる）は**Recharts**で実装。依存はrecharts 1パッケージのみの追加で済み、既存の「依存を増やさずシンプルに保つ」方針との乖離が最小。

### カレンダーヒートマップ実現方式
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| **自前SVG/CSS Grid実装（ライブラリ無し）** | 依存追加不要。7行×約53列のグリッドをTailwindの`grid`+`bg-{color}-{shade}`クラスの動的割当だけで実現可能。`title`属性でネイティブtooltip（JS不要）にでき、Server Componentのままレンダリング可能（インタラクション性を求めないなら`"use client"`すら不要） | 月ラベル・曜日ラベルの位置調整、スクロール可能領域（横に長くなる）のレイアウト調整は自前で作り込む必要がある | **高（本命）** |
| `react-calendar-heatmap`, `cal-heatmap`等の専用ライブラリ | GitHub風の見た目・ロジックが既製 | 保守が緩やかなライブラリが多く、Tailwind/React19/RSCとの相性検証が別途必要。今回程度の単純なグリッドに対して依存追加のコストが見合わない | 低 |

**推奨**: ヒートマップはライブラリ非採用、Tailwindの`grid-cols`とセルごとの色分岐（例: 0件=`bg-gray-100`、1件=`bg-emerald-200`、2件=`bg-emerald-400`、3件以上=`bg-emerald-600`等、`MUSCLE_GROUP_LABELS`同様に定数化）で自前実装する。ストリークは別途テキスト表示（「現在のストリーク: n日」）で補足する。

## 制約・前提・リスク
- 【制約・高】既存の集計はすべて「取得したlogsをJSでreduce」する非DB集計方式。日別ヒートマップ・週/月別トレンド・部位別バランス・自己ベストのいずれも、`weightValue`はKG/LB混在で保存されているため（`WorkoutLog.weightUnit`）、DB側の`SUM`/`MAX`だけでは正しい値にならず、**必ずアプリ層で`calculateVolumeKg`相当のkg換算を経てから集計する必要がある**。Prismaの`groupBy`/`aggregate`だけでは完結しない点は設計時に明記すべき。
- 【リスク・中】データ量増加時のパフォーマンス: 現状全アクション共通で「対象userIdの該当期間の`WorkoutSession`を`logs`ごと`findMany`」する設計。ヒートマップ（直近1年分=365日相当）や自己ベスト（全期間の全ログからexercise別MAXを取る)は、対象期間が長いほど転送データ量が増える。現状のユーザー数・データ規模（小規模想定、未確認）では許容範囲と推測されるが、将来的にはヒートマップ用に「日付＋合計値のみ」を返す軽量クエリ（`WorkoutSession`を`performedAt`のみ`select`し、`logs`は`_count`や`caloriesBurned`の`select`のみに絞る）に最適化する余地がある。自己ベストは全ログ走査が必須（`calculateVolumeKg`はDB非保存の導出値のため）だが、`exerciseId`にインデックスがあるため種目単位のフィルタ自体は効率的。
- 【リスク・中】タイムゾーン境界のバグ混入リスク: 新規追加する週別/月別集計・ストリーク計算で、既存の`getJstDayRangeUtc`を使わず素朴な`Date`比較や`toISOString().slice(0,10)`（UTC日付になってしまう）等で実装すると、深夜0時台〜朝9時台のJSTユーザー体感とズレる。既存の`tests/unit/date.test.ts`と同じ境界値テスト方針を新規関数にも適用すべき。
- 【リスク・中】Recharts採用に伴うRSC境界: Rechartsの各チャートコンポーネントはブラウザAPI依存のため、`"use client"`を付けたラッパーコンポーネント（例: `TrendChart.tsx`, `MuscleGroupChart.tsx`）を作り、データ取得はServer Component側（`page.tsx`やServer Action）で完結させてpropsとして渡す設計が必須。うっかりServer Component内で直接Rechartsをimportするとビルドエラーになる。
- 【リスク・低〜中】自己ベスト算出時のカスタム種目・種目名変更の扱い: `Exercise`はユーザーごとのカスタム種目作成が可能（`isCustom`, `createdByUserId`）。種目が削除された場合、関連する過去`WorkoutLog`は`exerciseId`で外部キー参照しているが、`Exercise`削除時の`onDelete`挙動はスキーマ上未指定（デフォルトのRestrict相当）であり、`WorkoutLog`削除時の動作は本調査では未検証。自己ベスト表示ロジックが種目削除済みレコードを想定通り扱えるか設計時に確認要。
- 【前提】スキーマ変更は不要と推測（4要素とも既存`WorkoutSession`/`WorkoutLog`/`Exercise`のデータから導出可能）。ただしバッジの「達成済みバッジ一覧を永続化して通知する」ような機能まで踏み込む場合は新規テーブル（例: `AchievementUnlock`）が必要になるが、依頼文の範囲は「表示」であり、都度計算での実現が可能と推測。

## 設計者への申し送り
- **要素1（カレンダーヒートマップ）**: Tailwind CSS Grid + 自前SVG/divセルで実装（ライブラリ不要）。データ取得は新規Server Action（例: `getWorkoutCalendarHeatmap(days: number)`）で「対象期間のJST暦日ごとのセッション有無・logCount・totalCalories」を返す形にし、`getJstDayRangeUtc`のロジック（固定+9hオフセット）を暦日バケット化に流用した新規ユーティリティを`src/lib/date.ts`に追加すること。ストリーク（連続日数）は同じ日付集合から算出し、「現在のストリーク」「最長ストリーク」の両方を返すDTO設計を推奨。
- **要素2（推移トレンドグラフ）**: Rechartsの`AreaChart`または`LineChart`を採用。「週別」「月別」の切り替えはJST暦週・暦月境界での新規集計関数が必要（既存`getPeriodRange`は流用不可、暦日境界ではないため）。カロリーとボリュームは単位が異なるため、2軸グラフか、タブ/トグルで表示を切り替えるUIかを設計判断すること。データ取得はServer Component/Server Actionで完結させ、Rechartsコンポーネントは必ず`"use client"`のラッパーに閉じ込める。
- **要素3（部位別トレーニングバランス）**: Rechartsの`PieChart`（`innerRadius`指定でドーナツ化）を推奨。`WorkoutLog`から`exercise.muscleGroup`を辿って集計する必要があるため、Prismaクエリでは`workoutLog.groupBy`が直接`exercise.muscleGroup`（別テーブルの列）を対象にできない点に注意（Prismaの`groupBy`はリレーション越しのフィールドを直接グループ化できないため、`include: { exercise: true }`で取得後にアプリ側で`muscleGroup`ごとに集計する必要がある）。頻度（ログ件数）とボリューム（kg換算合計）のどちらを主指標にするかは設計判断が必要（依頼文は「頻度/ボリューム」と両論併記）。色は`MUSCLE_GROUP_LABELS`のキー順に固定パレットを割り当て、既存のTailwindデフォルトカラーパレットとの整合を取ること。
- **要素4（自己ベスト＆達成バッジ）**: 新規ロジックとして (a) 種目別最大重量（`weightValue`をkg換算後に`exerciseId`単位でMAX）、(b) 種目別最大ボリューム（`calculateVolumeKg()`適用後に`exerciseId`単位でMAX）、(c) 連続トレーニング日数（要素1のストリーク計算を再利用）、(d) 累計セッション数、を算出するServer Action群が必要。これらはDB集計関数（`aggregate`/`groupBy`）だけでは完結せず、especially（b）はアプリ層での計算必須。バッジの「新記録検知」（今回の記録が過去の自己ベストを更新したか）を判定する場合、「直近の1件」と「その種目の過去最大値（直近の1件を除く）」を比較するロジックの設計が必要（`addWorkoutLog`実行直後の表示に使うのか、実績画面表示時に静的判定するだけかで実装箇所が変わる。依頼文は実績画面への表示なので、後者（表示時の静的集計）で十分と推測）。
- 全要素共通: 新規Server Actionはいずれも`getCurrentUserOrThrow()`によるユーザー所有権チェックを既存パターン通り先頭で行うこと（`src/app/actions/workouts.ts`の全関数が踏襲している必須パターン）。
- パフォーマンス: 初期実装は「対象userIdの全期間 or 直近1年分のWorkoutSession+logsをまとめて取得し、4要素分の集計をアプリ側で一括して行う」設計（1回のDBラウンドトリップで4要素分のデータを賄う）を推奨。将来的にデータ量が増えた場合は、ヒートマップ用に`select`で必要フィールドのみ絞る最適化を検討する余地があることを明記しておく。
