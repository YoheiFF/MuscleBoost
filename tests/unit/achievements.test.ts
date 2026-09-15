// tests/unit/achievements.test.ts
import { describe, it, expect } from "vitest";
import {
  buildWorkoutHeatmap,
  buildTrendSeries,
  buildMuscleGroupBalance,
  buildPersonalBests,
  buildAchievementBadges,
  computeHeatmapWindowStartUtc,
  computeHeatmapWindowDays,
  type AchievementSessionInput,
} from "@/lib/achievements";
import { getJstDateKey } from "@/lib/date";

const NOW = new Date("2026-09-15T04:00:00.000Z"); // JST 2026-09-15 13:00（火曜日）

function session(performedAtIso: string, logs: AchievementSessionInput["logs"]): AchievementSessionInput {
  return { id: performedAtIso, performedAt: new Date(performedAtIso), logs };
}

function log(overrides: Partial<AchievementSessionInput["logs"][number]> = {}): AchievementSessionInput["logs"][number] {
  return {
    exerciseId: "ex-1",
    exerciseName: "チェストプレス",
    muscleGroup: "CHEST",
    setCount: 3,
    repsPerSet: 10,
    weightValue: 50,
    weightUnit: "KG",
    caloriesBurned: 100,
    ...overrides,
  };
}

describe("buildWorkoutHeatmap", () => {
  it("記録が0件の場合、当月+過去5ヶ月を月曜始まりで整列した表示期間で、全セルlevel0・ストリーク0・totalActiveDays0を返す（新規ユーザー）", () => {
    const result = buildWorkoutHeatmap([], NOW);
    // NOW=2026-09-15(火)。5ヶ月前の月=2026年4月、4/1(水)が属する週の月曜=2026-03-30。
    // 2026-03-30〜2026-09-15は170日間（実装コードで独立検証済み）。
    expect(result.days).toHaveLength(170);
    expect(result.days[0].date).toBe("2026-03-30");
    expect(result.days[result.days.length - 1].date).toBe("2026-09-15");
    expect(result.days.every((d) => d.level === 0)).toBe(true);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalActiveDays).toBe(0);
  });

  it("今日を含め3日連続で記録があれば、currentStreakは3になる", () => {
    const sessions = [
      session("2026-09-13T04:00:00.000Z", [log()]),
      session("2026-09-14T04:00:00.000Z", [log()]),
      session("2026-09-15T04:00:00.000Z", [log()]),
    ];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(3);
  });

  it("今日は未記録でも、前日までが連続していればcurrentStreakは途切れない", () => {
    const sessions = [
      session("2026-09-13T04:00:00.000Z", [log()]),
      session("2026-09-14T04:00:00.000Z", [log()]),
    ];
    const result = buildWorkoutHeatmap(sessions, NOW); // NOW = 2026-09-15（未記録）
    expect(result.currentStreak).toBe(2);
  });

  it("一昨日以前で途切れている場合、currentStreakは0になる", () => {
    const sessions = [session("2026-09-12T04:00:00.000Z", [log()])];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(0);
  });

  it("JST日付境界をまたぐ記録（UTC前日15:00=JST当日0:00）でも正しく暦日ごとに1日としてカウントされる", () => {
    // 2026-09-14T15:00:00.000Z = JST 2026-09-15 00:00:00.000（NOWと同じJST暦日）
    const sessions = [session("2026-09-14T15:00:00.000Z", [log()])];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(1);
  });

  it("過去の途切れたストリークが現在のストリークより長い場合でもlongestStreakに反映される", () => {
    const sessions = [
      session("2026-08-01T04:00:00.000Z", [log()]),
      session("2026-08-02T04:00:00.000Z", [log()]),
      session("2026-08-03T04:00:00.000Z", [log()]),
      session("2026-08-04T04:00:00.000Z", [log()]),
      session("2026-08-05T04:00:00.000Z", [log()]), // 過去5日連続
      session("2026-09-15T04:00:00.000Z", [log()]), // 現在1日
    ];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(5);
  });

  it("windowDaysを明示的に渡した場合は、そのdays配列長で表示グリッドが生成される（後方互換の確認）", () => {
    const result = buildWorkoutHeatmap([], NOW, 10);
    expect(result.days).toHaveLength(10);
    expect(result.days[result.days.length - 1].date).toBe("2026-09-15");
  });
});

describe("computeHeatmapWindowStartUtc / computeHeatmapWindowDays", () => {
  it("5ヶ月前の月の1日が月曜でない場合、その週の月曜まで切り下げる（月またぎ）", () => {
    const start = computeHeatmapWindowStartUtc(NOW); // NOW=2026-09-15、5ヶ月前=4月、4/1は水曜
    expect(getJstDateKey(start)).toBe("2026-03-30");
    expect(computeHeatmapWindowDays(NOW)).toBe(170);
  });

  it("5ヶ月前の月の1日がすでに月曜の場合は切り下げが発生しない", () => {
    // 2026-05-04(月)を基準にすると、5ヶ月前の月=2025年12月、12/1(月)は既に月曜
    const marNow = new Date("2026-05-04T04:00:00.000Z"); // JST 2026-05-04 13:00（月曜）
    const start = computeHeatmapWindowStartUtc(marNow);
    expect(getJstDateKey(start)).toBe("2025-12-01");
    expect(computeHeatmapWindowDays(marNow)).toBe(155);
  });

  it("年をまたぐ場合も正しく暦週アライメントされる", () => {
    const janNow = new Date("2026-01-15T04:00:00.000Z"); // JST 2026-01-15 13:00（木曜）
    const start = computeHeatmapWindowStartUtc(janNow); // 5ヶ月前=2025年8月、8/1は金曜→月曜切り下げで7/28
    expect(getJstDateKey(start)).toBe("2025-07-28");
    expect(computeHeatmapWindowDays(janNow)).toBe(172);
  });
});

describe("buildTrendSeries", () => {
  it("記録が0件の場合、週別12件・月別6件すべて0値のバケットを返す", () => {
    const result = buildTrendSeries([], NOW);
    expect(result.weekly).toHaveLength(12);
    expect(result.monthly).toHaveLength(6);
    expect(result.weekly.every((p) => p.sessionCount === 0 && p.totalCalories === 0)).toBe(true);
  });

  it("当該週内の記録が正しく集計される", () => {
    const sessions = [session("2026-09-15T04:00:00.000Z", [log({ caloriesBurned: 120 })])];
    const result = buildTrendSeries(sessions, NOW);
    const lastWeek = result.weekly[result.weekly.length - 1];
    expect(lastWeek.sessionCount).toBe(1);
    expect(lastWeek.totalCalories).toBe(120);
  });
});

describe("buildMuscleGroupBalance", () => {
  it("記録が0件の場合、空配列を返す", () => {
    expect(buildMuscleGroupBalance([], NOW)).toEqual([]);
  });

  it("記録が1件も無い部位は結果に含まれない", () => {
    const sessions = [session("2026-09-15T04:00:00.000Z", [log({ muscleGroup: "CHEST" })])];
    const result = buildMuscleGroupBalance(sessions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].muscleGroup).toBe("CHEST");
  });

  it("90日より前の記録は集計対象に含まれない", () => {
    const sessions = [session("2026-01-01T04:00:00.000Z", [log({ muscleGroup: "BACK" })])];
    const result = buildMuscleGroupBalance(sessions, NOW);
    expect(result).toHaveLength(0);
  });
});

describe("buildPersonalBests", () => {
  it("記録が0件の場合、空配列を返す", () => {
    expect(buildPersonalBests([], NOW)).toEqual([]);
  });

  it("KG/LB混在の記録がある種目で、kg換算後の正しい最大重量が算出される", () => {
    const sessions = [
      session("2026-08-01T04:00:00.000Z", [log({ weightValue: 60, weightUnit: "KG" })]), // 60kg
      session("2026-08-05T04:00:00.000Z", [log({ weightValue: 100, weightUnit: "LB" })]), // 約45.4kg（60kgより小さい）
    ];
    const result = buildPersonalBests(sessions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].maxWeightKg).toBe(60);
  });

  it("LB換算後の値がKG記録を上回る場合、LB側の記録がベストとして採用される", () => {
    const sessions = [
      session("2026-08-01T04:00:00.000Z", [log({ weightValue: 40, weightUnit: "KG" })]),
      session("2026-08-05T04:00:00.000Z", [log({ weightValue: 200, weightUnit: "LB" })]), // 約90.7kg
    ];
    const result = buildPersonalBests(sessions, NOW);
    expect(result[0].maxWeightKg).toBeCloseTo(90.7, 1);
  });

  it("重量が1件も入力されていない種目（有酸素等）は結果に含まれない", () => {
    const sessions = [
      session("2026-09-01T04:00:00.000Z", [
        log({ exerciseId: "ex-cardio", muscleGroup: "CARDIO", weightValue: null, weightUnit: null }),
      ]),
    ];
    expect(buildPersonalBests(sessions, NOW)).toHaveLength(0);
  });

  it("直近7日以内に達成した記録にはisRecentWeightPb=trueが付く", () => {
    const sessions = [session("2026-09-14T04:00:00.000Z", [log({ weightValue: 80, weightUnit: "KG" })])];
    const result = buildPersonalBests(sessions, NOW);
    expect(result[0].isRecentWeightPb).toBe(true);
  });

  it("8日以上前に達成した記録にはisRecentWeightPb=falseが付く", () => {
    const sessions = [session("2026-08-01T04:00:00.000Z", [log({ weightValue: 80, weightUnit: "KG" })])];
    const result = buildPersonalBests(sessions, NOW);
    expect(result[0].isRecentWeightPb).toBe(false);
  });
});

describe("buildAchievementBadges", () => {
  it("記録が0件の場合、全バッジがachieved:falseになる", () => {
    const heatmap = buildWorkoutHeatmap([], NOW);
    const result = buildAchievementBadges([], heatmap);
    expect(result.streakBadges.every((b) => b.achieved === false)).toBe(true);
    expect(result.sessionCountBadges.every((b) => b.achieved === false)).toBe(true);
  });

  it("最長ストリークが閾値以上のバッジのみachieved:trueになる", () => {
    const heatmap = { days: [], currentStreak: 3, longestStreak: 10, totalActiveDays: 10 };
    const result = buildAchievementBadges([], heatmap);
    const streak7 = result.streakBadges.find((b) => b.threshold === 7);
    const streak14 = result.streakBadges.find((b) => b.threshold === 14);
    expect(streak7?.achieved).toBe(true);
    expect(streak14?.achieved).toBe(false);
  });

  it("累計セッション数が閾値以上のバッジのみachieved:trueになる", () => {
    const sessions = Array.from({ length: 30 }, (_, i) => session(`2026-01-${String((i % 28) + 1).padStart(2, "0")}T04:00:00.000Z`, [log()]));
    const heatmap = buildWorkoutHeatmap(sessions, NOW);
    const result = buildAchievementBadges(sessions, heatmap);
    const sessions10 = result.sessionCountBadges.find((b) => b.threshold === 10);
    const sessions50 = result.sessionCountBadges.find((b) => b.threshold === 50);
    expect(sessions10?.achieved).toBe(true);
    expect(sessions50?.achieved).toBe(false);
  });
});
