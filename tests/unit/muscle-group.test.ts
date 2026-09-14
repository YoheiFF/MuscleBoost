// tests/unit/muscle-group.test.ts
import { describe, it, expect } from "vitest";
import { isCardioMuscleGroup, MUSCLE_GROUPS } from "@/types";

describe("isCardioMuscleGroup", () => {
  it("CARDIOの場合はtrueを返す", () => {
    expect(isCardioMuscleGroup("CARDIO")).toBe(true);
  });

  it("CARDIO以外の全muscleGroupに対してfalseを返す", () => {
    for (const mg of MUSCLE_GROUPS) {
      if (mg === "CARDIO") continue;
      expect(isCardioMuscleGroup(mg)).toBe(false);
    }
  });
});
