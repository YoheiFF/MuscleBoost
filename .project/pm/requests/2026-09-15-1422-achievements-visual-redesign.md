---
project_id: "2026-09-15-1422-achievements-visual-redesign"
created: "2026-09-15"
---

# 依頼内容（原文）

過去の実績をおしゃれ且つ視覚的に見えるようにしたい。案をください。
→ PMが4つのビジュアル要素案を提示し、ユーザーが「全てを実装したい」と回答。

# 採用するビジュアル要素（4つ全て）

1. **カレンダーヒートマップ（継続可視化）**
   GitHubのコントリビューショングラフ風に、トレーニングした日を濃淡で色付け。連続日数（ストリーク）も分かるようにする。

2. **推移トレンドグラフ**
   週別・月別の消費カロリーやトレーニングボリュームの推移をライン/エリアチャートで表示。

3. **部位別トレーニングバランス**
   胸・背中・脚・肩・腕・腹などの部位別トレーニング頻度/ボリュームをドーナツまたはレーダーチャートで表示。

4. **自己ベスト＆達成バッジ**
   種目ごとの最大重量・最大ボリューム更新の検知とバッジ表示、連続トレーニング日数（ストリーク）、累計セッション数などのマイルストーンをゲーミフィケーション的に演出。

# 対象画面
`/workouts`（実績画面）が主な対象。必要に応じてトップ画面（`/`）にもサマリー要素を追加することを検討してよい（設計フェーズで判断）。

# 参考: 既存データソース
- `WorkoutSession`（performedAt, memo）
- `WorkoutLog`（exerciseId, setCount, repsPerSet, durationMinutes, weightValue, weightUnit, caloriesBurned）
- `Exercise`（muscleGroup, metValue）
- 既存の集計関数 `getDashboardStats(periodDays)` (src/app/actions/workouts.ts)
- 既存画面 `src/app/workouts/page.tsx`（実績画面、現状はテキストのみ）
