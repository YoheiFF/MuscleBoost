---
project_id: "2026-09-15-2347-heatmap-monday-3months"
phase: research
created: "2026-09-15"
---
# 情報収集レポート: トレーニングカレンダーヒートマップの月曜始まり週整列＋表示期間「当月＋過去2ヶ月」化

## 結論サマリー
- 【確認済み】月曜始まりの暦週境界を求める関数は**既に存在する**: `src/lib/date.ts:65-73` の `getJstWeekRangeUtc(date)`。JST安全な「月曜=0」変換式 `const daysSinceMonday = (dayOfWeek + 6) % 7;`（`dayOfWeek`は`getUTCDay()`、0=日〜6=土）を使っており、サーバーのローカルTZ設定に依存しない。ヒートマップの週アライメントはこの関数の`weekStartUtc`を再利用するだけで実現可能（新規のJST安全曜日計算式を書き起こす必要はない）。
- 【確認済み】`currentStreak`/`longestStreak`は表示ウィンドウ（`windowDays`）に**依存しない**。`buildWorkoutHeatmap`（`src/lib/achievements.ts:100-158`）は引数`sessions`（呼び出し元`getAchievementsData`が渡すのは常に全期間データ、`src/app/actions/achievements.ts:25-29`）から作る`dayMap`全体を元にストリークを計算しており（105-153行目）、`days`配列（表示用グリッド）だけが`windowDays`でスライスされる。したがって表示期間変更はストリーク計算ロジックに一切影響しない＝変更の影響範囲は「表示グリッドの生成方法」と「関連する定数・型コメント・UI文言・テスト」に限定される。
- 【確認済み】ユーザーへのヒアリングで仕様は既に確定済み（`.project/pm/requests/2026-09-15-2347-heatmap-monday-3months.md:13-14`）: 「月曜始まりの1週間（月〜日の7行）」＝行=曜日・列=週のGitHub風レイアウト、期間は「**当月も含めて過去2か月、合計3か月分**」。この文言（「当月」という月境界の言葉遣い）は暦月ベースの期間算出（後述の候補A）と自然に対応しており、日数ベース（候補B、例:90日）よりユーザーの意図に近いと推測される。
- 【確認済み】`HEATMAP_WINDOW_DAYS = 371`定数は現状「53週×7日固定」の前提で書かれており（`src/lib/achievements.ts:48-49`）、直接参照箇所は本体コード3箇所（`achievements.ts:49,103`、テスト`tests/unit/achievements.test.ts:35`）、コメント・ドキュメント多数（`types/index.ts:114,116,119`、`WorkoutHeatmap.tsx:18,47`、過去の設計書`detailed-design.md`等）。日数固定から月境界ベースの可変長ウィンドウに変えると、`windowDays`という「日数」を表す引数の意味自体が設計判断ポイントになる（後述）。
- 【未確認・要検討】表示開始日を月曜まで切り下げた結果、実際のカレンダー日数は「3ヶ月」の暦日数（89〜92日程度）より多くなる（例: 月初が水曜なら最大6日分余分に前月分が見える）。これは暦週整列の必然的なトレードオフであり、ユーザー確認済みの「月曜始まり7行」要件と「3ヶ月」要件を同時に満たすには不可避（後述の「制約・前提・リスク」参照）。

## 確認済み事実

### 既存の週境界計算（月曜始まり）
- `src/lib/date.ts:62-73` `getJstWeekRangeUtc(date)`:
  ```ts
  export function getJstWeekRangeUtc(date: Date): { weekStartUtc: Date; weekEndUtc: Date } {
    const { dayStartUtc } = getJstDayRangeUtc(date);
    const jstDayStart = new Date(dayStartUtc.getTime() + JST_OFFSET_MS);
    const dayOfWeek = jstDayStart.getUTCDay(); // 0=日, 1=月, ..., 6=土
    const daysSinceMonday = (dayOfWeek + 6) % 7; // 月曜=0, 火曜=1, ..., 日曜=6
    const weekStartUtc = new Date(dayStartUtc.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
    const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { weekStartUtc, weekEndUtc };
  }
  ```
  この関数は「JST暦日境界を固定+9時間オフセットで求める→`getUTCDay()`で曜日を読む」という、サーバーのTZ設定に依存しない安全な方式を既に採用している（`getUTCDay()`はDateオブジェクトのUTC値を読むだけなので、Node実行環境のTZ設定の影響を受けない）。`(dayOfWeek + 6) % 7`が「JS標準の0=日曜〜6=土曜」を「0=月曜〜6=日曜」に変換する式であり、これがまさに依頼の「月曜始まりの週番号・オフセット計算式」の答え。**新規に曜日変換式を書く必要はなく、この関数の`weekStartUtc`をヒートマップ側でも再利用すればよい。**
- 同関数は既に`buildTrendSeries`（週別トレンド集計、`achievements.ts:233-239`）で使われている実績があり、動作実績がある。

### `buildWorkoutHeatmap`の現状実装
- `src/lib/achievements.ts:100-158`。シグネチャ: `buildWorkoutHeatmap(sessions, now, windowDays = HEATMAP_WINDOW_DAYS)`。
- 日別グリッド生成（115-127行目）: `for (let i = windowDays - 1; i >= 0; i--) { key = getJstDateKey(addDays(now, -i)); ... }` — 「今日を含めてwindowDays日前から今日まで」を単純に日数カウントバックで生成。暦週境界とは無関係。
- `dayMap`（105-113行目）は`sessions`全件から作られる（windowDaysに関係なく全期間分）。
- `currentStreak`（129-136行目）: `dayMap`（全期間）を参照。`windowDays`は不使用。
- `longestStreak`（138-153行目）: `dayMap`の全キー（`dayIndexSet`、全期間）から連続run長を求める。**「371日の表示ウィンドウに限定しない、全期間」と関数コメント（94-97行目）に明記されている。** `windowDays`は不使用。
- `totalActiveDays`（155行目）: `days`配列（＝表示ウィンドウでスライス済み）のうちlogCount>0の件数。**これだけがwindowDaysに依存する。**
- 結論: `windowDays`（表示期間）を変更しても影響を受けるのは`days`配列と`totalActiveDays`のみ。`currentStreak`/`longestStreak`は無傷。

### `WorkoutHeatmap.tsx`の現状実装
- `src/components/WorkoutHeatmap.tsx:18-23`:
  ```ts
  // 371日を7日ずつの列に区切る（暦週の月曜始まりへの厳密な整列は行わない設計判断。
  // basic-design.mdの通り、実装簡易化のため単純に7日単位のチャンクとする）。
  const weeks: HeatmapDayDTO[][] = [];
  for (let i = 0; i < heatmap.days.length; i += 7) {
    weeks.push(heatmap.days.slice(i, i + 7));
  }
  ```
  「暦週整列をしない」ことは**過去の設計判断として明示的にコメントされている**（意図的な簡易化）。今回の依頼はこの設計判断を覆すもの。
- 列（`week`）は`flex flex-col`で縦に7セル並べる構造（36-44行目）＝1列=1週、上から下へ日が進む。列自体は`flex gap-[3px] overflow-x-auto`で横に並ぶ（34行目）＝左が古い週、右が新しい週。**この「1列7セル・古い→新しいの列順」という構造自体は変更不要**で、`heatmap.days`の並びを月曜始まりにアライメントすれば`slice(i, i+7)`のチャンク分割は自動的に「月〜日」の7行に揃う（`days[0]`が月曜であることさえ保証すればよい）。
- 曜日ラベル・月ラベルは現状描画されていない（47行目のフッターテキストのみ）。
- フッター文言 `直近1年間の記録日数: {heatmap.totalActiveDays}日`（47行目）は期間変更に伴い修正必須（「1年間」という文言が事実と乖離する）。

### 型定義
- `src/types/index.ts:105-120`:
  - `HeatmapDayDTO`（106-112行目）: `date`, `sessionCount`, `logCount`, `totalCalories`, `level`。期間変更で構造変更は不要。
  - `WorkoutHeatmapDTO`（115-120行目）: コメントに「直近371日分」という具体的日数が3箇所（114, 116, 119行目）にハードコードされている。期間が可変（月境界ベース）になると、コメント表現を「直近N日」から「当月＋過去2ヶ月」等に書き換える必要がある。

### 呼び出し元
- `src/app/actions/achievements.ts:47`: `buildWorkoutHeatmap(input, now)` — `windowDays`引数は渡しておらず、デフォルト値`HEATMAP_WINDOW_DAYS`（371）に依存している唯一の呼び出し箇所。ここを変更すれば全体に反映される（呼び出し元は1箇所のみ、`Grep`で確認済み）。
- `input`（全セッション、全期間）は`prisma.workoutSession.findMany({ where: { userId } })`で絞り込みなしに取得（25-29行目）。表示期間を絞ってもDBクエリ自体を変える必要はない（ヒートマップ・ストリーク・バッジいずれも全期間データを要求するため、既存の「1回の全件取得」方針は維持でよい。理由は`basic-design.md:76`にも明記あり）。

### 既存テスト
- `tests/unit/achievements.test.ts:33-40`: `expect(result.days).toHaveLength(371);` が**唯一**windowDaysの具体的日数（371）に依存するアサーション。他のストリーク系テスト（42-86行目）は`currentStreak`/`longestStreak`の値のみを検証しており、windowDaysの変更による影響を受けない（前述の通りロジックが独立しているため）。
- `NOW = new Date("2026-09-15T04:00:00.000Z")` = JST 2026-09-15 13:00（火曜日）がテスト全体の基準時刻（12行目）。今回の期間変更の新規テストを書く際も、この火曜日という条件で「月曜始まりに正しく整列するか（先頭が必ず月曜になるか）」を検証できる。

### 定数・依存関係の全文検索結果
- `HEATMAP_WINDOW_DAYS`/`371`を参照する本体コード: `src/lib/achievements.ts:48-49,95,103`、`src/types/index.ts:114,116,119`（コメントのみ）、`src/components/WorkoutHeatmap.tsx:18,47`（コメント＋UI文言）、`tests/unit/achievements.test.ts:35`。
- 他の集計関数（`buildTrendSeries`の週別12件/月別6件、`buildMuscleGroupBalance`の90日窓）は今回の変更と独立しており、`MUSCLE_BALANCE_WINDOW_DAYS = 90`（`achievements.ts:58`）等と混同しないよう注意（ヒートマップの新windowと日数がたまたま近くても無関係の定数）。

## 推測・未確認
- 【推測・要検証】「当月＋過去2ヶ月」の`windowDays`相当値は、今日が月末に近いか月初に近いかで変動する（例: 9/15基準なら7/1〜9/15=約77日、これを月曜まで切り下げると約80〜86日程度になる可能性）。固定長ではなくなるため、`buildWorkoutHeatmap`のテストで「日数」をハードコードする形の検証は今後書きづらくなる。「先頭セルの曜日は常に月曜」「最終日は今日と一致」といった**構造的な検証**に切り替える設計が必要と推測されるが、最終的なテスト方針は設計フェーズで決定すべき。
- 【推測】ヒートマップの表示終了日は「今日」で打ち切り、今週の残り（今日より未来の曜日）は単に「記録なし(level0)」として自然に空白表示されると推測する（`dayMap`に未来日のキーは存在しないため、level0と区別なく描画される）。GitHub本家のように「未来日は薄いグレーで区別する」等の特別扱いは現状の`computeHeatmapLevel`にはロジックが無く、今回のスコープ外と推測されるが、UI上「今週の土日が空白なのは未記録なのか未来なのか区別がつかない」というUX上の曖昧さが残る可能性がある（要件定義で確認推奨）。
- 【未確認】「過去2ヶ月」の起算が「今日を含む月から2ヶ月遡った月の1日」（例: 9月なら7/1〜9/末）なのか、「今日から遡って60日強のニュアンス」なのか、ユーザー確認ログ（`.project/pm/requests/...md:14`）の文言だけでは厳密な境界（月初か日数か）までは確定していない。「当月も含めて過去2か月、合計3か月分」という言い回しは暦月ベース（前述の候補A）を強く示唆するが、設計フェーズで最終確定すべき。

## 既存コードベースの関連箇所
- `src/lib/achievements.ts` `buildWorkoutHeatmap`（100-158行目）: 表示グリッド生成ロジックの変更対象本体。`HEATMAP_WINDOW_DAYS`定数（48-49行目）も変更対象。
- `src/lib/achievements.ts` `subtractJstMonths`（170-179行目）: 「nowからNヶ月前の月の1日」を求める既存プライベート関数。`buildTrendSeries`の月別集計で使用中だが、今回の「当月＋過去2ヶ月」の期間算出（候補A）にもそのまま転用できる可能性が高い（`subtractJstMonths(now, 2)`で2ヶ月前の1日が取れる）。
- `src/lib/date.ts` `getJstWeekRangeUtc`（65-73行目）: 月曜始まり週境界の唯一かつ既存の情報源。今回の月曜アライメントはこれを再利用する。
- `src/lib/date.ts` `getJstMonthRangeUtc`（79-90行目）: 「当月の1日」「Nヶ月前の1日」を求める際、`subtractJstMonths`と組み合わせて使う既存関数。
- `src/lib/date.ts` `addDays`（57-59行目）: 日数ベース候補（候補B）で「N日前」を求める際に使う既存関数。UTC ms単位加算でJST暦日境界とズレない設計（55行目コメント）。
- `src/components/WorkoutHeatmap.tsx`（1-50行目）: `slice(i, i+7)`チャンク分割ロジック（18-23行目）自体は`days[0]`が月曜である前提さえ満たされれば変更不要。フッター文言（47行目）は要修正。曜日ラベル・月ラベルは新規追加検討事項（必須ではない）。
- `src/types/index.ts` `HeatmapDayDTO`/`WorkoutHeatmapDTO`（105-120行目）: 「371日」というコメント文言の修正が必要（型構造自体の変更は不要）。
- `src/app/actions/achievements.ts:47`: `buildWorkoutHeatmap`の唯一の呼び出し元。ここで新しい期間算出結果（`windowDays`相当）を渡すか、あるいは関数シグネチャ自体を変える場合はこの呼び出しコードも合わせて変更。
- `tests/unit/achievements.test.ts:35`: `toHaveLength(371)`のハードコード箇所。期間算出方式が確定次第、この期待値・アサーション方法を見直す必要あり。

## 採用候補と比較

### A. 月曜始まり週アライメントの算出方式
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| A-1: `getJstWeekRangeUtc()`の`weekStartUtc`を再利用し、表示開始日を「期間開始日が属する週の月曜」に切り下げる | 既存関数の再利用のみで実装可能。JST安全性・TZ非依存の担保が既に検証済み関数に委譲される。コード変更量が最小。`buildTrendSeries`と同じ関数を使うことで週境界の定義がヒートマップとトレンドグラフで一貫する。 | 期間開始日を切り下げる分、実際の表示日数が「3ヶ月ちょうど」より最大6日程度増える（後述リスク参照）。 | 高（推奨） |
| A-2: 新規に専用の「月曜=0番」曜日計算関数を`achievements.ts`か`date.ts`に書き起こす | ヒートマップ専用にロジックを閉じ込められる。 | 既存の`getJstWeekRangeUtc`と実質同じ計算を重複実装することになり、二重管理・将来の齟齬リスクを生む。依頼文でも「既にあるか確認」と念押しされており、既存関数がある以上採用理由が薄い。 | 低（非推奨） |
| A-3: `Date.getDay()`をそのまま使う | 実装が最も単純に見える。 | `Date.getDay()`はサーバーのローカルタイムゾーンに依存する。本番VPS（さくらVPS、Ubuntu）のTZ設定が未確認である旨は過去の関連プロジェクト（`same-day-session-continuity`）でも指摘済みであり、`date.ts`全体の設計方針（TZ非依存・固定+9時間オフセット、`date.ts:10-15`のコメント）に明確に反する。 | 不採用 |

### B. 表示期間「当月＋過去2ヶ月＝3ヶ月分」の算出方式
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| B-1（暦月ベース）: 「2ヶ月前の月の1日」〜「今日」を範囲とし、開始日をさらに月曜まで切り下げる。`subtractJstMonths(now, 2)` → `getJstMonthRangeUtc(...).monthStartUtc` → `getJstWeekRangeUtc(...).weekStartUtc` | ユーザーの発言「当月も含めて過去2か月」（`.project/pm/requests/...md:14`）に文言が最も忠実。月が変わるたびに表示範囲の起点が自然に動く（毎月1日分の記録が突然消えたり増えたりしない、「今月・先月・先々月」という直感的な区切り）。`subtractJstMonths`/`getJstMonthRangeUtc`という既存関数をそのまま流用できる。 | 月によって暦日数が28〜31日と変動するため、`windowDays`（グリッド全体の日数）が月ごとに微妙に変わる（例: 2月を含む3ヶ月と7月を含む3ヶ月で数日の差）。テストで固定の日数を期待値にしづらい。 | 高（推奨） |
| B-2（日数ベース）: 「今日を含む週の日曜」を終端とし、そこから固定日数（例: 90日や92日）遡った日を開始日とし、月曜まで切り下げる | `windowDays`という既存の「日数」パラメータの意味をそのまま維持でき、シグネチャ変更が最小限。テストで日数を固定値として検証しやすい（例: 常に84〜91日等の範囲）。 | 「当月＋過去2ヶ月」というユーザーの発言（暦月の言葉遣い）と厳密には一致しない可能性がある（日数ベースの90日は月境界と無関係にズレていく）。月初・月末で「見えている月」の数が2ヶ月だったり4ヶ月だったりブレる。 | 中（B-1が使えない制約がある場合の代替） |
| B-3: `HEATMAP_WINDOW_DAYS`を単純に90や92に減らすだけで、週アライメント（候補A）は別途適用 | 最も変更が小さい（定数1行変更＋アライメント処理追加のみ）。 | B-2と同じデメリットに加え、「当月＋過去2ヶ月」という要件を「約90日」という近似でしか表現できず、月によっては要件を満たさない月（31日×3=93日等）が出る。 | 低（非推奨、B-2に包含される劣化版） |

**申し送り**: ユーザーの確定済み発言が暦月の言葉遣い（「当月」）である以上、**B-1（暦月ベース）を第一候補として設計を進めることを推奨**する。ただし実装が簡単な方を優先するならB-2でも要件文言との乖離は小さく、設計者の判断に委ねる。

## 制約・前提・リスク
- 【リスク・影響度: 中】月曜アライメントのため表示開始日を切り下げると、「3ヶ月」ちょうどより最大6日分過去にはみ出す（例: 2ヶ月前の1日が水曜なら、その週の月曜まで＝最大5日分余分に前月のデータが見える）。ユーザーには「3ヶ月分」と伝えているため、数日分の誤差が仕様上許容されるか設計フェーズで確認すべき。UI側で「前月分の一部セル」を薄く表示する等の対応は本依頼のスコープ外と推測されるが、少なくとも設計書にはこのトレードオフを明記すべき。
- 【リスク・影響度: 低】`HEATMAP_WINDOW_DAYS`定数が「固定371」から「月によって変動する値」に性格が変わるため、定数名・型（`number`定数→関数）を見直す必要がある。現状の呼び出し元（`achievements.ts:47`）はデフォルト引数に依存しているだけなので、シグネチャ変更（例: `windowDays`引数を廃止し内部で`now`から自動算出する）を選んでも呼び出し元への影響は1箇所で収まる。
- 【リスク・影響度: 低】`tests/unit/achievements.test.ts:35`の`toHaveLength(371)`は確実に修正が必要（期間算出方式確定後、動的に期待値を計算するか、構造検証（先頭が月曜・末尾が今日）に置き換える）。他のストリーク系テストは無修正で通る見込み（ロジックが`windowDays`非依存のため）。
- 【リスク・影響度: 低】`WorkoutHeatmap.tsx:47`の「直近1年間の記録日数」という文言はハードコードされた日本語であり、期間変更後に事実と乖離する。UIテキストの修正漏れに注意。
- 【前提】`buildWorkoutHeatmap`への入力`sessions`は常に全期間データ（`getAchievementsData`が絞り込みなしで全件取得、`achievements.ts:25-29`）であるため、表示期間をどう変えても**DBクエリ自体の変更は不要**。パフォーマンス上の追加コストもない（表示用に切り出す配列が短くなる方向の変更のため、むしろ計算量はわずかに減る）。
- 【前提】`currentStreak`/`longestStreak`/`buildAchievementBadges`（達成バッジ、`achievements.ts:426-452`）は`heatmap.currentStreak`/`heatmap.longestStreak`を参照するのみで表示ウィンドウと無関係（`achievements.ts:431`）。したがって今回の変更でバッジ表示・ストリーク表示が壊れるリスクは無い。
- 【制約】曜日ラベル（月火水木金土日）・月ラベルのUI追加はユーザー依頼の確定仕様（必須要件）には含まれていない（`.project/pm/requests/...md:17-19`の要点整理に記載なし）。「あると分かりやすい」という付加提案に留め、設計者の裁量判断とすべき。

## 設計者への申し送り
- 月曜アライメントの実装は「新規の曜日計算式を書く」のではなく、既存の`getJstWeekRangeUtc()`（`src/lib/date.ts:65-73`）の`weekStartUtc`を表示開始日の計算に再利用する方針で進めること（TZ安全性が担保済みのため）。
- 期間算出は「当月＋過去2ヶ月」という発言の言葉遣いに忠実な**候補B-1（暦月ベース: `subtractJstMonths` + `getJstMonthRangeUtc` + `getJstWeekRangeUtc`で月曜切り下げ）**を第一候補として検討すること。既存の`subtractJstMonths`（`achievements.ts:170-179`、現状private）を`buildTrendSeries`と共用するか、export化するかは設計判断。
- `currentStreak`/`longestStreak`/バッジ判定ロジックは表示ウィンドウ変更の影響を受けないため、変更対象から明確に除外してよい（テスト済みロジックへの手戻りリスクなし）。
- `HEATMAP_WINDOW_DAYS`定数・`windowDays`引数の扱い（固定日数の引数として残すか、`now`から自動算出する内部ロジックに置き換えるか）は、テスト容易性（`now`を固定してテストする既存パターン、ファイル冒頭コメント`achievements.ts:1-4`）を維持できる設計にすること。
- `tests/unit/achievements.test.ts:35`の`toHaveLength(371)`は必ず修正対象に含め、新しい期間算出方式に応じた新規テスト（「先頭セルが必ず月曜になる」「表示期間が当月+過去2ヶ月をカバーする」等の境界値テスト）を追加すること。
- `src/types/index.ts`と`src/components/WorkoutHeatmap.tsx:47`のコメント・UI文言中の「371日」「直近1年間」といった表現の修正漏れを防ぐこと（`Grep`で"371"を再検索して全箇所潰すのが確実）。
- 月曜切り下げにより「3ヶ月」より数日はみ出る点は仕様上許容されるか、設計フェーズで明示的に合意を取ること（要件定義書に一文残すことを推奨）。
- 曜日ラベル・月ラベルのUI追加は必須要件ではないため、スコープに含めるかは設計者・PM判断とする（含める場合は`WorkoutHeatmap.tsx`側のみの変更で完結し、`achievements.ts`側のロジックには影響しない）。
