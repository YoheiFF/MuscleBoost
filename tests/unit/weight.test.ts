// tests/unit/weight.test.ts
import { describe, it, expect } from "vitest";
import { resolveWeightKgForCalorie, DEFAULT_WEIGHT_REQUIRED_ERROR } from "@/lib/weight";

describe("resolveWeightKgForCalorie", () => {
  it("正常系: デフォルト体重が設定済み", () => {
    expect(resolveWeightKgForCalorie(70)).toEqual({ ok: true, weightKg: 70 });
  });

  it("異常系: デフォルト体重がnull", () => {
    expect(resolveWeightKgForCalorie(null)).toEqual({
      ok: false,
      error: DEFAULT_WEIGHT_REQUIRED_ERROR,
    });
  });

  it("異常系: デフォルト体重がundefined（ユーザーレコード自体が万一見つからない場合を想定）", () => {
    expect(resolveWeightKgForCalorie(undefined)).toEqual({
      ok: false,
      error: DEFAULT_WEIGHT_REQUIRED_ERROR,
    });
  });

  it("境界値: 非常に小さい正の値", () => {
    expect(resolveWeightKgForCalorie(0.1)).toEqual({ ok: true, weightKg: 0.1 });
  });
});
