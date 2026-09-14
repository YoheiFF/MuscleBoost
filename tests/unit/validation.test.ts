// tests/unit/validation.test.ts
import { describe, it, expect } from "vitest";
import { workoutLogInputSchema } from "@/lib/validation";

const baseInput = {
  exerciseId: "ex-1",
  setCount: 3,
  repsPerSet: 10,
};

describe("workoutLogInputSchema（durationMinutesの任意化）", () => {
  it("正常系: durationMinutesを省略しても検証を通過する（筋トレ系フォームの送信を想定）", () => {
    const result = workoutLogInputSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("正常系: durationMinutesを指定した場合も従来通り検証を通過する（有酸素系フォームの送信を想定）", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, durationMinutes: 30 });
    expect(result.success).toBe(true);
  });

  it("異常系: durationMinutesが0以下の場合は指定時のみエラーになる", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, durationMinutes: 0 });
    expect(result.success).toBe(false);
  });

  it("異常系: durationMinutesが600を超える場合はエラーになる", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, durationMinutes: 601 });
    expect(result.success).toBe(false);
  });

  it("既存仕様への無回帰: weightValueのみ指定するとweightUnit必須エラーになる", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, weightValue: 50 });
    expect(result.success).toBe(false);
  });
});
