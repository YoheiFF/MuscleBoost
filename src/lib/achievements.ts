// src/lib/achievements.ts
// DB(Prisma)に一切依存しない、実績画面向けの純粋集計関数群。
// 現在時刻は必ず引数 now: Date として受け取り、関数内部で new Date() を呼び出さない
// （呼び出し側でDateを固定できるようにし、単体テストで決定的な結果を検証できるようにするため）。

import { calculateVolumeKg, LB_TO_KG_FACTOR } from "@/lib/volume";
import {
  JST_OFFSET_MS,
  getJstDateKey,
  addDays,
  getJstDayRangeUtc,
  getJstWeekRangeUtc,
  getJstMonthRangeUtc,
} from "@/lib/date";
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from "@/types";
import type {
  MuscleGroup,
  WeightUnit,
  HeatmapDayDTO,
  WorkoutHeatmapDTO,
  TrendPointDTO,
  TrendSeriesDTO,
  MuscleGroupBalanceDTO,
  PersonalBestDTO,
  AchievementBadgeDTO,
  AchievementBadgesDTO,
} from "@/types";

/** 集計対象ログ1件分の入力形。Prismaの行そのものではなく、
 *  Server Action側でWorkoutLog+Exerciseの結合結果から詰め替えたプレーンな形。 */
export interface AchievementLogInput {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  setCount: number;
  repsPerSet: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  caloriesBurned: number;
}

/** 集計対象セッション1件分の入力形。 */
export interface AchievementSessionInput {
  id: string;
  performedAt: Date;
  logs: AchievementLogInput[];
}

/** ヒートマップの色レベル境界（件数）。この件数以上でlevel2、level3になる */
export const HEATMAP_LEVEL_2_MIN_LOG_COUNT = 3;
export const HEATMAP_LEVEL_3_MIN_LOG_COUNT = 6;

export const TREND_WEEKLY_BUCKET_COUNT = 12;
export const TREND_MONTHLY_BUCKET_COUNT = 6;

/** 部位別バランスの集計対象期間（日） */
export const MUSCLE_BALANCE_WINDOW_DAYS = 90;

/** 自己ベストの「直近更新（NEW）」とみなす日数（当日を含む） */
export const RECENT_PB_WINDOW_DAYS = 7;

/** 連続日数バッジの閾値（日）。判定基準は「全期間の最長ストリーク」 */
export const STREAK_BADGE_THRESHOLDS = [3, 7, 14, 30, 60, 100] as const;
/** 累計セッション数バッジの閾値（回）。判定基準は「全期間のWorkoutSession件数」 */
export const SESSION_COUNT_BADGE_THRESHOLDS = [10, 30, 50, 100, 200, 365] as const;

/** "YYYY-MM-DD"のJST暦日キーを、連続比較可能な整数の日インデックスに変換する。
 *  日インデックスが1違えば暦日で1日違うことが保証される（ヒートマップのstreak計算、
 *  自己ベストの「直近N日以内」判定の両方で使う内部ヘルパー）。 */
function dateKeyToDayIndex(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000));
}

function computeHeatmapLevel(logCount: number): 0 | 1 | 2 | 3 {
  if (logCount <= 0) return 0;
  if (logCount < HEATMAP_LEVEL_2_MIN_LOG_COUNT) return 1;
  if (logCount < HEATMAP_LEVEL_3_MIN_LOG_COUNT) return 2;
  return 3;
}

/** nowが属する月からmonths ヶ月前の月の「1日」を表すDateを返す（getJstMonthRangeUtcに渡す基準日算出用）。
 *  日を1日に固定することで、月末日（31日等）が対象月に存在しないことによるズレを避ける。 */
function subtractJstMonths(date: Date, months: number): Date {
  const jstMs = date.getTime() + JST_OFFSET_MS;
  const jstDate = new Date(jstMs);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const targetMonthFirstAsUtcMs = Date.UTC(year, month - months, 1, 0, 0, 0, 0) - JST_OFFSET_MS;
  return new Date(targetMonthFirstAsUtcMs);
}

/**
 * ヒートマップ表示グリッドの開始日（月曜始まり週の月曜日 JST 0:00、UTCのDateとして返す）を算出する。
 * 「当月＋過去4ヶ月（合計5ヶ月分）」のうち最も過去側の暦月（4ヶ月前の月）の1日を、その週の月曜まで切り下げる。
 *
 * 処理ロジック:
 * 1. subtractJstMonths(now, 4)で「4ヶ月前の月」を表す基準日を求める。
 * 2. getJstMonthRangeUtc(基準日).monthStartUtcで、その月の1日 JST 0:00 を求める。
 * 3. getJstWeekRangeUtc(1日).weekStartUtcで、その1日が属する暦週の月曜 JST 0:00 まで切り下げる
 *    （1日が月曜でない月は、最大6日分前月にはみ出す。要件定義書「確定事項B」で許容と確定済み）。
 */
export function computeHeatmapWindowStartUtc(now: Date): Date {
  const fourMonthsAgoMonthStartUtc = getJstMonthRangeUtc(subtractJstMonths(now, 4)).monthStartUtc;
  return getJstWeekRangeUtc(fourMonthsAgoMonthStartUtc).weekStartUtc;
}

/**
 * ヒートマップ表示グリッドの日数（buildWorkoutHeatmapのdays配列長のデフォルト値）を算出する。
 * computeHeatmapWindowStartUtc(now)（月曜0:00 JST）から、nowが属するJST暦日の0:00までの
 * 経過日数に+1（今日自身の分）した値。月によって暦日数が異なるため固定値にはならず、
 * 常に7の倍数になるとも限らない（最終行＝直近の週は「今日」の曜日までしか埋まらないため）。
 */
export function computeHeatmapWindowDays(now: Date): number {
  const windowStartUtc = computeHeatmapWindowStartUtc(now);
  const { dayStartUtc: todayStartUtc } = getJstDayRangeUtc(now);
  const diffDays = Math.round((todayStartUtc.getTime() - windowStartUtc.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}

/**
 * 表示グリッド（windowDays日分。デフォルトは「当月＋過去4ヶ月」を月曜始まり週に整列させた
 * 可変長のウィンドウ）の日別ヒートマップデータ、現在のストリーク、最長ストリークを算出する。
 *
 * 処理ロジック:
 * 1. sessions（全期間）をJST暦日キー（getJstDateKey）でグルーピングし、
 *    日ごとのsessionCount/logCount/totalCaloriesを合算したMapを作る。
 * 2. 表示用グリッド(days)は、now を含む直近windowDays日分を「古い→新しい」の順で生成する。
 *    各日について、Mapに該当キーがあればその値を、無ければ0を使い、
 *    level(0-3)はcomputeHeatmapLevelで決定する。
 * 3. 現在のストリーク(currentStreak): 今日(getJstDateKey(now))にMap上の記録があれば
 *    今日を起点に、無ければ昨日を起点に、Map上に記録がある限り1日ずつ過去へ遡ってカウントする
 *    （「今日はまだジムに行っていないだけ」でストリークを0にしないための仕様）。
 * 4. 最長ストリーク(longestStreak): 1.のMapの全キー（表示ウィンドウ(windowDays)に限定しない、
 *    全期間）をdateKeyToDayIndexで整数化し、連続する整数の最長run長を求める。
 *    currentStreakは必ずこのrunの一部であるため、最終的にlongestStreak = max(longestStreak, currentStreak)とする。
 * 5. totalActiveDays: 2.のdays配列のうちlogCount>0の日数（表示ウィンドウ内のみ）。
 */
export function buildWorkoutHeatmap(
  sessions: AchievementSessionInput[],
  now: Date,
  windowDays: number = computeHeatmapWindowDays(now)
): WorkoutHeatmapDTO {
  const dayMap = new Map<string, { sessionCount: number; logCount: number; totalCalories: number }>();
  for (const s of sessions) {
    const key = getJstDateKey(s.performedAt);
    const entry = dayMap.get(key) ?? { sessionCount: 0, logCount: 0, totalCalories: 0 };
    entry.sessionCount += 1;
    entry.logCount += s.logs.length;
    entry.totalCalories += s.logs.reduce((sum, l) => sum + l.caloriesBurned, 0);
    dayMap.set(key, entry);
  }

  const days: HeatmapDayDTO[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const key = getJstDateKey(addDays(now, -i));
    const entry = dayMap.get(key);
    const logCount = entry?.logCount ?? 0;
    days.push({
      date: key,
      sessionCount: entry?.sessionCount ?? 0,
      logCount,
      totalCalories: entry ? Math.round(entry.totalCalories * 10) / 10 : 0,
      level: computeHeatmapLevel(logCount),
    });
  }

  let currentStreak = 0;
  {
    let offset = dayMap.has(getJstDateKey(now)) ? 0 : 1;
    while (dayMap.has(getJstDateKey(addDays(now, -offset)))) {
      currentStreak++;
      offset++;
    }
  }

  const dayIndexSet = new Set<number>();
  for (const key of dayMap.keys()) {
    dayIndexSet.add(dateKeyToDayIndex(key));
  }
  let longestStreak = 0;
  for (const idx of dayIndexSet) {
    if (dayIndexSet.has(idx - 1)) continue; // runの途中の要素はスキップ（runの先頭からのみ数える）
    let run = 1;
    let cur = idx;
    while (dayIndexSet.has(cur + 1)) {
      run++;
      cur++;
    }
    longestStreak = Math.max(longestStreak, run);
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  const totalActiveDays = days.filter((d) => d.logCount > 0).length;

  return { days, currentStreak, longestStreak, totalActiveDays };
}

function formatWeekLabel(weekStartUtc: Date): string {
  const jst = new Date(weekStartUtc.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}週`;
}

function formatMonthLabel(monthStartUtc: Date): string {
  const jst = new Date(monthStartUtc.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月`;
}

function aggregateBucket(
  sessions: AchievementSessionInput[],
  start: Date,
  end: Date,
  label: string,
  periodKey: string
): TrendPointDTO {
  let totalCalories = 0;
  let totalVolumeKg = 0;
  let sessionCount = 0;
  for (const s of sessions) {
    if (s.performedAt >= start && s.performedAt < end) {
      sessionCount++;
      for (const l of s.logs) {
        totalCalories += l.caloriesBurned;
        totalVolumeKg += calculateVolumeKg({
          setCount: l.setCount,
          repsPerSet: l.repsPerSet,
          weightValue: l.weightValue,
          weightUnit: l.weightUnit,
        });
      }
    }
  }
  return {
    periodKey,
    label,
    periodStart: start.toISOString(),
    totalCalories: Math.round(totalCalories * 10) / 10,
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    sessionCount,
  };
}

/**
 * 週別(weeklyCount件)・月別(monthlyCount件)の消費カロリー・ボリューム・セッション数の推移を算出する。
 *
 * 処理ロジック:
 * 1. 週別: offset = weeklyCount-1 ～ 0 の順に、nowからoffset*7日前を基準日としてgetJstWeekRangeUtcで
 *    週の範囲を求め、その範囲に入るsessionsを集計してTrendPointDTOを作る（古い→新しいの順で配列化）。
 * 2. 月別: offset = monthlyCount-1 ～ 0 の順に、nowからoffsetヶ月前(subtractJstMonths)を基準日として
 *    getJstMonthRangeUtcで月の範囲を求め、同様に集計する。
 * 3. periodKeyは週別=週開始日のgetJstDateKey、月別="YYYY-MM"とする（一意性の担保のみが目的で、
 *    ISO週番号計算は行わない）。labelは表示用の日本語ラベル（例: "9/8週", "2026年9月"）。
 */
export function buildTrendSeries(
  sessions: AchievementSessionInput[],
  now: Date,
  weeklyCount: number = TREND_WEEKLY_BUCKET_COUNT,
  monthlyCount: number = TREND_MONTHLY_BUCKET_COUNT
): TrendSeriesDTO {
  const weekly: TrendPointDTO[] = [];
  for (let offset = weeklyCount - 1; offset >= 0; offset--) {
    const base = addDays(now, -7 * offset);
    const { weekStartUtc, weekEndUtc } = getJstWeekRangeUtc(base);
    weekly.push(
      aggregateBucket(sessions, weekStartUtc, weekEndUtc, formatWeekLabel(weekStartUtc), getJstDateKey(weekStartUtc))
    );
  }

  const monthly: TrendPointDTO[] = [];
  for (let offset = monthlyCount - 1; offset >= 0; offset--) {
    const base = subtractJstMonths(now, offset);
    const { monthStartUtc, monthEndUtc } = getJstMonthRangeUtc(base);
    const jst = new Date(monthStartUtc.getTime() + JST_OFFSET_MS);
    const periodKey = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
    monthly.push(
      aggregateBucket(sessions, monthStartUtc, monthEndUtc, formatMonthLabel(monthStartUtc), periodKey)
    );
  }

  return { weekly, monthly };
}

/**
 * 直近windowDays日のmuscleGroup別トレーニングバランス（頻度・ボリューム・構成比）を算出する。
 *
 * 処理ロジック:
 * 1. MUSCLE_GROUPSの全キーについて{ logCount: 0, volumeKg: 0 }で初期化したMapを作る。
 * 2. performedAtが[now-windowDays日, now]の範囲に入るsessionsのlogsのみを対象に、
 *    muscleGroupごとにlogCount(+1件ずつ)とvolumeKg(calculateVolumeKg合計)を積算する。
 * 3. 全muscleGroup合計のtotalLogCount/totalVolumeKgを求め、各グループの構成比
 *    (logCountRatio, volumeRatio)を計算する（合計が0の場合は0とする、ゼロ除算回避）。
 * 4. logCountが0のグループは結果配列から除外する（ドーナツチャートに空スライスを描画しないため）。
 *    戻り値の順序はMUSCLE_GROUPS定数の宣言順を維持する。
 */
export function buildMuscleGroupBalance(
  sessions: AchievementSessionInput[],
  now: Date,
  windowDays: number = MUSCLE_BALANCE_WINDOW_DAYS
): MuscleGroupBalanceDTO[] {
  const windowStart = addDays(now, -windowDays);
  const stats = new Map<MuscleGroup, { logCount: number; volumeKg: number }>();
  for (const group of MUSCLE_GROUPS) {
    stats.set(group, { logCount: 0, volumeKg: 0 });
  }

  for (const s of sessions) {
    if (s.performedAt < windowStart || s.performedAt > now) continue;
    for (const l of s.logs) {
      const entry = stats.get(l.muscleGroup);
      if (!entry) continue; // 想定外のmuscleGroup値が来ても落ちないための防御的処理
      entry.logCount += 1;
      entry.volumeKg += calculateVolumeKg({
        setCount: l.setCount,
        repsPerSet: l.repsPerSet,
        weightValue: l.weightValue,
        weightUnit: l.weightUnit,
      });
    }
  }

  const totalLogCount = [...stats.values()].reduce((sum, v) => sum + v.logCount, 0);
  const totalVolumeKg = [...stats.values()].reduce((sum, v) => sum + v.volumeKg, 0);

  return MUSCLE_GROUPS.map((group) => {
    const entry = stats.get(group)!;
    return {
      muscleGroup: group,
      label: MUSCLE_GROUP_LABELS[group],
      logCount: entry.logCount,
      volumeKg: Math.round(entry.volumeKg * 10) / 10,
      logCountRatio: totalLogCount > 0 ? entry.logCount / totalLogCount : 0,
      volumeRatio: totalVolumeKg > 0 ? entry.volumeKg / totalVolumeKg : 0,
    };
  }).filter((g) => g.logCount > 0);
}

interface PersonalBestAccumulator {
  exerciseName: string;
  muscleGroup: MuscleGroup;
  maxWeightKg: number;
  maxWeightAt: Date | null;
  maxVolumeKg: number;
  maxVolumeAt: Date | null;
}

/**
 * 種目（exerciseId）ごとの自己ベスト（最大重量kg換算・最大ボリュームkg）と、
 * 直近RECENT_PB_WINDOW_DAYS日以内に更新されたかどうかを算出する。
 *
 * 処理ロジック:
 * 1. sessionsをperformedAt昇順にソートする（「最初にその値に到達した日時」をachievedAtとして
 *    記録するため、昇順で走査し「厳密に上回った時だけ」達成日を更新する）。
 * 2. exerciseIdごとにAccumulatorを持ち、各ログについて:
 *    a. weightValueが null でなく、weightUnitも null でなく、weightValue > 0 の場合のみ、
 *       LB_TO_KG_FACTORでkg換算した値(小数第1位に四捨五入)を求め、現在のmaxWeightKgより
 *       大きい場合のみ更新し、達成日時をそのセッションのperformedAtにする。
 *    b. calculateVolumeKgでそのログのボリュームを求め、現在のmaxVolumeKgより大きい場合のみ
 *       更新し、達成日時を記録する。
 * 3. 全種目を走査した後、以下の条件でPersonalBestDTOへ変換する:
 *    - maxWeightAtがnull（＝一度もweightValueが有効入力されたことがない）場合、
 *      maxWeightKg/maxWeightAchievedAtはnullとする。
 *    - maxVolumeAtがnullまたはmaxVolumeKgが0の場合、maxVolumeKg/maxVolumeAchievedAtはnullとする。
 *    - 上記2つが両方nullになる種目（有酸素専用・自重のみで一度もweightValueが入力されていない種目）は
 *      結果配列から除外する。
 * 4. isRecentWeightPb/isRecentVolumePbは、各achievedAtのgetJstDateKeyをdateKeyToDayIndexで
 *    整数化し、「dateKeyToDayIndex(getJstDateKey(now)) - (RECENT_PB_WINDOW_DAYS - 1)」以上であればtrueとする
 *    （＝直近7日以内、当日を含む）。
 * 5. 結果配列は「直近更新(isRecentWeightPb||isRecentVolumePb)のものを先頭」「次にmuscleGroupの
 *    MUSCLE_GROUPS宣言順」「次にexerciseNameの辞書順(ja)」でソートして返す。
 */
export function buildPersonalBests(sessions: AchievementSessionInput[], now: Date): PersonalBestDTO[] {
  const sorted = [...sessions].sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
  const map = new Map<string, PersonalBestAccumulator>();

  for (const s of sorted) {
    for (const l of s.logs) {
      const acc: PersonalBestAccumulator =
        map.get(l.exerciseId) ?? {
          exerciseName: l.exerciseName,
          muscleGroup: l.muscleGroup,
          maxWeightKg: 0,
          maxWeightAt: null,
          maxVolumeKg: 0,
          maxVolumeAt: null,
        };

      if (l.weightValue !== null && l.weightUnit !== null && l.weightValue > 0) {
        const weightKg = l.weightUnit === "LB" ? l.weightValue * LB_TO_KG_FACTOR : l.weightValue;
        const roundedWeightKg = Math.round(weightKg * 10) / 10;
        if (roundedWeightKg > acc.maxWeightKg) {
          acc.maxWeightKg = roundedWeightKg;
          acc.maxWeightAt = s.performedAt;
        }
      }

      const volumeKg = calculateVolumeKg({
        setCount: l.setCount,
        repsPerSet: l.repsPerSet,
        weightValue: l.weightValue,
        weightUnit: l.weightUnit,
      });
      if (volumeKg > acc.maxVolumeKg) {
        acc.maxVolumeKg = volumeKg;
        acc.maxVolumeAt = s.performedAt;
      }

      map.set(l.exerciseId, acc);
    }
  }

  const recentThreshold = dateKeyToDayIndex(getJstDateKey(now)) - (RECENT_PB_WINDOW_DAYS - 1);
  const result: PersonalBestDTO[] = [];

  for (const [exerciseId, acc] of map) {
    const hasWeightData = acc.maxWeightAt !== null;
    const hasVolumeData = acc.maxVolumeAt !== null && acc.maxVolumeKg > 0;
    if (!hasWeightData && !hasVolumeData) continue;

    const isRecentWeightPb =
      hasWeightData && dateKeyToDayIndex(getJstDateKey(acc.maxWeightAt as Date)) >= recentThreshold;
    const isRecentVolumePb =
      hasVolumeData && dateKeyToDayIndex(getJstDateKey(acc.maxVolumeAt as Date)) >= recentThreshold;

    result.push({
      exerciseId,
      exerciseName: acc.exerciseName,
      muscleGroup: acc.muscleGroup,
      maxWeightKg: hasWeightData ? acc.maxWeightKg : null,
      maxWeightAchievedAt: hasWeightData ? (acc.maxWeightAt as Date).toISOString() : null,
      maxVolumeKg: hasVolumeData ? acc.maxVolumeKg : null,
      maxVolumeAchievedAt: hasVolumeData ? (acc.maxVolumeAt as Date).toISOString() : null,
      isRecentWeightPb,
      isRecentVolumePb,
    });
  }

  result.sort((a, b) => {
    const aRecent = a.isRecentWeightPb || a.isRecentVolumePb;
    const bRecent = b.isRecentWeightPb || b.isRecentVolumePb;
    if (aRecent !== bRecent) return aRecent ? -1 : 1;
    if (a.muscleGroup !== b.muscleGroup) {
      return MUSCLE_GROUPS.indexOf(a.muscleGroup) - MUSCLE_GROUPS.indexOf(b.muscleGroup);
    }
    return a.exerciseName.localeCompare(b.exerciseName, "ja");
  });

  return result;
}

/**
 * 連続日数バッジ・累計セッション数バッジの達成状況を算出する。
 * heatmapはbuildWorkoutHeatmapの戻り値をそのまま渡す（currentStreak/longestStreakの再計算をしない）。
 */
export function buildAchievementBadges(
  sessions: AchievementSessionInput[],
  heatmap: WorkoutHeatmapDTO
): AchievementBadgesDTO {
  const totalSessionCount = sessions.length;
  const { currentStreak, longestStreak } = heatmap;

  const streakBadges: AchievementBadgeDTO[] = STREAK_BADGE_THRESHOLDS.map((threshold) => ({
    id: `streak-${threshold}`,
    category: "streak",
    label: `${threshold}日連続達成`,
    threshold,
    achieved: longestStreak >= threshold,
    achievedValue: longestStreak,
  }));

  const sessionCountBadges: AchievementBadgeDTO[] = SESSION_COUNT_BADGE_THRESHOLDS.map((threshold) => ({
    id: `sessions-${threshold}`,
    category: "sessionCount",
    label: `累計${threshold}回達成`,
    threshold,
    achieved: totalSessionCount >= threshold,
    achievedValue: totalSessionCount,
  }));

  return { streakBadges, sessionCountBadges, totalSessionCount, currentStreak, longestStreak };
}
