---
project_id: "2026-09-15-2347-heatmap-monday-3months"
phase: design
sub: requirements
created: "2026-09-15"
---
# 要件定義書: トレーニングカレンダーの月曜始まり週整列＋表示期間「当月＋過去2ヶ月」化

参照:
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-15-2347-heatmap-monday-3months.md`（事実関係の一次情報はすべてこちらを正とする）
- 依頼原文（ユーザー確認済み）: `C:\project\MuscleBoost\.project\pm\requests\2026-09-15-2347-heatmap-monday-3months.md`

## Why（背景・課題）

- 現状の`WorkoutHeatmap.tsx`（`src/components/WorkoutHeatmap.tsx:18-23`）は、`heatmap.days`（直近371日、単純な日数カウントバック）を機械的に7日ずつのチャンクに区切って縦1列=1週として描画している。このチャンク分割は暦週（月曜始まり）とは無関係であり、**先頭行が何曜日になるかは「今日の曜日」に依存して毎日変動する**（例: 今日が火曜なら先頭行は水曜始まりになる等）。ユーザーはこれを見て「月曜始まりで固定されていない」ことに気づき、修正を依頼した。
- 表示期間も直近1年（371日）と長大で、ユーザーが実際に見たいのは「直近の頑張り」である「当月＋過去2ヶ月＝3ヶ月分」で十分という要望が確定している。
- 情報収集の結果、月曜始まり週境界の計算（`getJstWeekRangeUtc`）・暦月境界の計算（`getJstMonthRangeUtc`、`subtractJstMonths`）は既に`src/lib/date.ts`・`src/lib/achievements.ts`に実装済みであり、新規のTZ依存ロジックを書く必要がない。またストリーク計算（`currentStreak`/`longestStreak`）は表示ウィンドウから完全に独立しているため、本変更で壊れるリスクがない。変更範囲は「表示グリッドの生成方法」とその周辺（定数・型コメント・UI文言・テスト）に限定できる。

## What（実現すること）

1. `/workouts`のカレンダーヒートマップの行を、常に「月曜始まりの暦週（月〜日の7行）」に整列させる。今日の曜日に関わらず、グリッドの各列（週）は必ず月曜が1行目、日曜が7行目になる。
2. 表示期間を、直近1年（371日固定）から「当月＋過去2ヶ月＝合計3ヶ月分」に変更する。月によって暦日数が異なるため、表示日数は固定値ではなく**可変長**になる。
3. 既存のストリーク（`currentStreak`/`longestStreak`）・達成バッジ（`buildAchievementBadges`）は、本変更の影響を受けず現状通り動作する（表示ウィンドウとは独立した全期間ベースの計算のため、変更対象外）。

## How（実現方針の概要。詳細は基本設計書・詳細設計書で確定）

- 表示グリッドの開始日は、「2ヶ月前の月の1日」を`subtractJstMonths(now, 2)` → `getJstMonthRangeUtc(...).monthStartUtc`で求め、その日が属する暦週の月曜まで`getJstWeekRangeUtc(...).weekStartUtc`で切り下げて算出する（暦月ベース、下記「確定事項A」参照）。
- `buildWorkoutHeatmap`の`windowDays`引数はそのまま残し、デフォルト値のみ「固定371」から「`now`から動的算出する新関数の戻り値」に変更する。関数のシグネチャ・呼び出し元（`src/app/actions/achievements.ts:47`）は変更不要。
- `HEATMAP_WINDOW_DAYS`定数（固定371）は撤廃し、動的算出用の新規エクスポート関数`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`に置き換える。
- `WorkoutHeatmap.tsx`側の「7日ずつチャンク分割して縦に並べる」ロジック自体は変更不要（`heatmap.days[0]`が月曜であることさえ保証されれば、既存の`slice(i, i+7)`が自動的に月〜日の7行に整列するため）。曜日ラベル（月〜日）を新規表示し、UI文言・コメントの「371日」「直近1年間」表記を修正する。

## 確定事項（情報収集レポートで「設計フェーズで要確認」とされた項目への回答）

### A. 「当月＋過去2ヶ月」の期間算出方式（暦月ベース vs 日数ベース）

**暦月ベース（情報収集レポートの候補B-1）を採用する。** 理由:
- ユーザーの確定済み発言「当月も含めて過去2か月、合計3か月分」（`.project/pm/requests/2026-09-15-2347-heatmap-monday-3months.md:14`）は暦月の言葉遣いであり、日数ベース（候補B-2/B-3、例: 固定90日）よりも意図に忠実。
- 既存関数`subtractJstMonths`・`getJstMonthRangeUtc`（`buildTrendSeries`の月別集計で使用実績あり）をそのまま流用でき、新規ロジックの追加が最小。
- 算出式（確定）:
  1. `subtractJstMonths(now, 2)` で「2ヶ月前の月」を表す基準日を求める。
  2. `getJstMonthRangeUtc(基準日).monthStartUtc` で、その月の1日 JST 0:00 を求める（＝表示したい期間の最も過去側の暦月の1日）。
  3. `getJstWeekRangeUtc(1日).weekStartUtc` で、その1日が属する暦週の月曜 JST 0:00 まで切り下げる（下記「確定事項B」参照）。
  4. 表示終了日は常に「今日」（`now`が属するJST暦日）とする。未来日のセルは生成しない（GitHub本家のような未来日の特別な色分けは行わない。`dayMap`に未来日のキーが存在しないため`level: 0`として自然に空白表示される。これは情報収集レポートの推測通りの仕様とし、本プロジェクトのスコープ外とする）。

### B. 月曜切り下げによる表示日数のはみ出し

**許容する（仕様として確定）。** 「2ヶ月前の月の1日」が月曜でない場合、その週の月曜まで切り下げるため、実際のカレンダー日数は「3ヶ月ちょうど」の暦日数（89〜92日程度）より**最大6日分**過去にはみ出る（前月の日付が数日分余分に見える）。これは「月曜始まりの週で7行に揃える」要件と「3ヶ月分表示する」要件を同時に満たすための不可避なトレードオフであり、ユーザーへの追加確認は行わず、設計判断として確定する。UI側で「はみ出た前月分のセルを薄く表示する」等の特別な区別は行わない（本プロジェクトのスコープ外。必要になれば別プロジェクトで対応）。

### C. 曜日ラベル・月ラベルのUI追加

- **曜日ラベル（月火水木金土日）: 追加する（確定要件に含める）。** 本変更の目的は「月曜始まりに整列していることをユーザーが視認できるようにする」ことであるため、整列结果を裏付けるラベルなしでは変更の効果が画面上で確認できない。グリッド左側に月〜日の7行ラベルを固定表示する。
- **月ラベル（列の上に「9月」等を表示）: 追加しない（本プロジェクトのスコープ外、将来課題とする）。** 列（週）がどの月に属するかを判定するには月境界とグリッド列のマッピングという追加ロジックが必要になり、ユーザーの確定要件（月曜整列＋3ヶ月表示）には含まれていない。過剰実装を避け、スコープを最小に保つ。

### D. `HEATMAP_WINDOW_DAYS`定数・`windowDays`引数の扱い

- `HEATMAP_WINDOW_DAYS = 371`定数は削除する（固定日数という前提自体が成立しなくなるため）。
- `buildWorkoutHeatmap(sessions, now, windowDays = ...)`のシグネチャ（引数の数・型・呼び出し元）は変更しない。デフォルト値のみ、新規エクスポート関数`computeHeatmapWindowDays(now: Date): number`の呼び出し結果に置き換える（TypeScriptのデフォルト引数式は同一シグネチャ内の先行パラメータ`now`を参照できるため実現可能）。これにより、既存のテストパターン（`now`を固定して決定的な結果を検証する）を維持しつつ、テストコードから`windowDays`を明示的に上書きすることも引き続き可能。

### E. UI文言（ヒートマップ下部の日数表記）

- 現状の「直近1年間の記録日数: {totalActiveDays}日」を「**直近3ヶ月間の記録日数**: {totalActiveDays}日」に変更する。厳密には月曜切り下げにより実際の表示期間が3ヶ月をわずかに超える場合があるが（確定事項B参照）、ユーザー自身が「3か月分」という言葉で要望しており、UI文言としての分かりやすさを優先し、日数の厳密な内訳は表示しない。

## ユーザー要件

- UR-1: ユーザーが`/workouts`のトレーニングカレンダーを見ると、今日の曜日に関わらず、常に「月曜始まり・月〜日の7行」で整列したグリッドが表示される。
- UR-2: グリッド左側に曜日ラベル（月・火・水・木・金・土・日）が表示され、各行がどの曜日かひと目で分かる。
- UR-3: 表示期間が「当月＋過去2ヶ月＝合計3ヶ月分」相当になり、直近1年分の表示に比べて横幅が大幅に短縮される。
- UR-4: 現在のストリーク・最長ストリークの表示は、本変更の前後で挙動が変わらない（今日未記録でも前日までの連続が維持される仕様を含む）。
- UR-5: 記録が0件の新規ユーザーでも、エラーにならず全セル未記録（level0）のグリッドが表示される。

## システム要件

- SR-1（グリッド開始日算出関数の新規追加）: `src/lib/achievements.ts`に`computeHeatmapWindowStartUtc(now: Date): Date`を追加する。「2ヶ月前の月の1日が属する週の月曜 JST 0:00」をUTCの`Date`として返す（確定事項A参照）。
- SR-2（グリッド日数算出関数の新規追加）: `src/lib/achievements.ts`に`computeHeatmapWindowDays(now: Date): number`を追加する。`computeHeatmapWindowStartUtc(now)`から`now`が属するJST暦日までの経過日数+1（今日を含む）を返す。
- SR-3（`HEATMAP_WINDOW_DAYS`定数の削除）: `src/lib/achievements.ts`から`export const HEATMAP_WINDOW_DAYS = 371;`とその直前のコメントを削除する。
- SR-4（`buildWorkoutHeatmap`のデフォルト値変更）: `buildWorkoutHeatmap`の第3引数`windowDays`のデフォルト値を`HEATMAP_WINDOW_DAYS`から`computeHeatmapWindowDays(now)`に変更する。関数本体のロジック（`days`配列生成・ストリーク計算・`totalActiveDays`計算）は変更しない。
- SR-5（型定義コメントの修正）: `src/types/index.ts`の`WorkoutHeatmapDTO`のJSDocコメント3箇所（「371日」表記）を、可変長の表示期間であることが分かる表現に修正する。型の構造（フィールド名・型）自体は変更しない。
- SR-6（UIコンポーネントの修正）: `src/components/WorkoutHeatmap.tsx`に、月〜日の曜日ラベル列を追加する。グリッド生成ロジック（`slice(i, i+7)`によるチャンク分割）自体は変更しない。フッター文言「直近1年間の記録日数」を「直近3ヶ月間の記録日数」に修正する。冒頭コメントの「371日を7日ずつの列に区切る（暦週の月曜始まりへの厳密な整列は行わない設計判断...）」を、月曜整列済みであることを説明する内容に修正する。
- SR-7（既存テストの修正）: `tests/unit/achievements.test.ts:35`の`expect(result.days).toHaveLength(371)`を、新しい期間算出方式に基づく具体的な期待値に置き換える。
- SR-8（新規境界値テストの追加）: `tests/unit/achievements.test.ts`に、月またぎ（2ヶ月前の月の1日が月曜でないケース）・年またぎ（1月基準で2ヶ月前が前年11月になるケース）を検証する新規テストを追加する。

## 非機能要件

- NFR-1（タイムゾーン一貫性）: 新規追加する`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`は、既存の`getJstDayRangeUtc`/`getJstWeekRangeUtc`/`getJstMonthRangeUtc`と同じJST固定+9時間オフセット方式のみを用いて算出し、`Intl`のタイムゾーン機能・`TZ`環境変数・`Date.getDay()`等のサーバーのローカルタイムゾーンに依存するAPIを一切使用しない。
- NFR-2（既存ロジックの非破壊）: `currentStreak`/`longestStreak`/`totalActiveDays`の算出ロジック、`buildTrendSeries`/`buildMuscleGroupBalance`/`buildPersonalBests`/`buildAchievementBadges`の全関数、`prisma/schema.prisma`、`src/app/actions/achievements.ts`の呼び出しコードは一切変更しない。
- NFR-3（後方互換性）: `buildWorkoutHeatmap`の引数の数・型・呼び出し順は変更しない（既存の呼び出し元`src/app/actions/achievements.ts:47`は無修正で動作する）。
- NFR-4（テスト容易性）: `computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`は`now: Date`のみを入力とする純粋関数とし、DBに依存しない単体テストで境界値（月またぎ・年またぎ）を検証できる構造にする。
- NFR-5（レスポンシブ）: 曜日ラベル列を追加してもスマートフォン幅（375px程度）でレイアウトが崩れない。ヒートマップ本体（週の列部分）のみ横スクロール可能とし、曜日ラベル列は固定表示（横スクロールに追従しない）とする。

## 受け入れ条件（Acceptance Criteria）

- AC-1: `/workouts`を開くと、トレーニングカレンダーの各列（週）が必ず「月曜(1行目)〜日曜(7行目、または直近の週は今日の曜日まで)」の順で表示される。今日の曜日をまたいで日をおいて確認しても、先頭行が常に月曜のままである（曜日によって先頭行がずれない）。
- AC-2: グリッド左側に「月・火・水・木・金・土・日」の7行の曜日ラベルが表示される。
- AC-3: 表示されるグリッドの最初のセル（最も古い日）は、実行時点の「2ヶ月前の月の1日が属する週の月曜日」の日付と一致し、最後のセル（最も新しい日）は「今日」の日付と一致する。
- AC-4: 現在のストリーク・最長ストリークの表示値が、本変更の前後で（同一データに対して）変化しない。
- AC-5: フッターの文言が「直近3ヶ月間の記録日数: N日」と表示される（「直近1年間」という表記は残っていない）。
- AC-6: 記録が0件の新規ユーザーで`/workouts`を開いても例外が発生せず、全セルが未記録（`level: 0`）のグリッドが表示される。
- AC-7: `tests/unit/achievements.test.ts`の全テスト（`toHaveLength(371)`を含む既存テストの更新版＋新規の月またぎ・年またぎテスト）が成功する。
- AC-8: `npm run build`（型チェック含む）がエラーなく成功する。
- AC-9: `npm run test`（Vitest）が全て成功する。
