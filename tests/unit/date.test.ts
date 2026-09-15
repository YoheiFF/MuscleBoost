// tests/unit/date.test.ts
import { describe, it, expect } from "vitest";
import {
  getJstDayRangeUtc,
  JST_OFFSET_MS,
  getJstDateKey,
  addDays,
  getJstWeekRangeUtc,
  getJstMonthRangeUtc,
} from "@/lib/date";

describe("getJstDayRangeUtc", () => {
  it("JST_OFFSET_MSは9時間である", () => {
    expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });

  it("JST日中の時刻から、その日のJST 0:00〜翌日0:00（UTC換算）の範囲を返す", () => {
    // 2026-09-15T04:30:00Z(UTC) = 2026-09-15T13:30:00(JST) → 2026-09-15のJST暦日
    const input = new Date("2026-09-15T04:30:00.000Z");
    const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(input);
    expect(dayStartUtc.toISOString()).toBe("2026-09-14T15:00:00.000Z"); // JST 2026-09-15 00:00
    expect(dayEndUtc.toISOString()).toBe("2026-09-15T15:00:00.000Z"); // JST 2026-09-16 00:00
  });

  it("境界値: JST 0:00ちょうど（UTC前日15:00:00.000）は当日として扱われる", () => {
    const input = new Date("2026-09-15T15:00:00.000Z"); // = JST 2026-09-16T00:00:00.000
    const { dayStartUtc } = getJstDayRangeUtc(input);
    expect(dayStartUtc.toISOString()).toBe("2026-09-15T15:00:00.000Z");
  });

  it("境界値: JST 23:59:59.999（UTC同日14:59:59.999）は前日として扱われる", () => {
    const input = new Date("2026-09-15T14:59:59.999Z"); // = JST 2026-09-15T23:59:59.999
    const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(input);
    expect(dayStartUtc.toISOString()).toBe("2026-09-14T15:00:00.000Z"); // JST 2026-09-15 00:00
    expect(dayEndUtc.toISOString()).toBe("2026-09-15T15:00:00.000Z"); // JST 2026-09-16 00:00（含まない）
  });

  it("月境界（JST月末23:59:59→翌月1日0:00）でも正しく暦日が切り替わる", () => {
    const lastOfMonth = new Date("2026-09-30T14:59:59.999Z"); // JST 2026-09-30T23:59:59.999
    const firstOfNextMonth = new Date("2026-09-30T15:00:00.000Z"); // JST 2026-10-01T00:00:00.000
    const a = getJstDayRangeUtc(lastOfMonth);
    const b = getJstDayRangeUtc(firstOfNextMonth);
    expect(a.dayStartUtc.toISOString()).not.toBe(b.dayStartUtc.toISOString());
    expect(b.dayStartUtc.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("年境界（JST 12/31 23:59:59→翌年1/1 0:00）でも正しく暦日が切り替わる", () => {
    const lastOfYear = new Date("2026-12-31T14:59:59.999Z"); // JST 2026-12-31T23:59:59.999
    const firstOfNextYear = new Date("2026-12-31T15:00:00.000Z"); // JST 2027-01-01T00:00:00.000
    const a = getJstDayRangeUtc(lastOfYear);
    const b = getJstDayRangeUtc(firstOfNextYear);
    expect(a.dayStartUtc.toISOString()).not.toBe(b.dayStartUtc.toISOString());
  });

  it("dayEndUtcはdayStartUtcのちょうど24時間後である", () => {
    const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(new Date("2026-09-15T04:30:00.000Z"));
    expect(dayEndUtc.getTime() - dayStartUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("getJstDateKey", () => {
  it("JST日中の時刻から正しい暦日キーを返す", () => {
    expect(getJstDateKey(new Date("2026-09-15T04:30:00.000Z"))).toBe("2026-09-15");
  });
  it("境界値: JST 0:00ちょうど（UTC前日15:00:00.000）は当日のキーになる", () => {
    expect(getJstDateKey(new Date("2026-09-15T15:00:00.000Z"))).toBe("2026-09-16");
  });
  it("境界値: JST 23:59:59.999（UTC同日14:59:59.999）は当日のキーのままになる", () => {
    expect(getJstDateKey(new Date("2026-09-15T14:59:59.999Z"))).toBe("2026-09-15");
  });
});

describe("addDays", () => {
  it("正の日数を加算すると未来のDateを返す", () => {
    const base = new Date("2026-09-15T00:00:00.000Z");
    expect(addDays(base, 3).toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });
  it("負の日数を加算すると過去のDateを返す", () => {
    const base = new Date("2026-09-15T00:00:00.000Z");
    expect(addDays(base, -3).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("getJstWeekRangeUtc", () => {
  it("週の途中の日から、その週の月曜0:00(JST)〜翌週月曜0:00(JST)の範囲を返す", () => {
    // 2026-09-17はJSTで木曜日。その週の月曜日は2026-09-14。
    const { weekStartUtc, weekEndUtc } = getJstWeekRangeUtc(new Date("2026-09-17T04:00:00.000Z"));
    expect(weekStartUtc.toISOString()).toBe("2026-09-13T15:00:00.000Z"); // JST 2026-09-14 00:00
    expect(weekEndUtc.toISOString()).toBe("2026-09-20T15:00:00.000Z"); // JST 2026-09-21 00:00
  });
  it("月曜日ちょうどの日を渡すと、その日自身が週の開始になる", () => {
    // 2026-09-14はJSTで月曜日
    const { weekStartUtc } = getJstWeekRangeUtc(new Date("2026-09-14T01:00:00.000Z"));
    expect(weekStartUtc.toISOString()).toBe("2026-09-13T15:00:00.000Z"); // JST 2026-09-14 00:00
  });
  it("日曜日を渡すと、前の月曜日が週の開始になる", () => {
    // 2026-09-20はJSTで日曜日
    const { weekStartUtc } = getJstWeekRangeUtc(new Date("2026-09-20T01:00:00.000Z"));
    expect(weekStartUtc.toISOString()).toBe("2026-09-13T15:00:00.000Z"); // JST 2026-09-14 00:00
  });
});

describe("getJstMonthRangeUtc", () => {
  it("月の途中の日から、月初0:00(JST)〜翌月初0:00(JST)の範囲を返す", () => {
    const { monthStartUtc, monthEndUtc } = getJstMonthRangeUtc(new Date("2026-09-17T04:00:00.000Z"));
    expect(monthStartUtc.toISOString()).toBe("2026-08-31T15:00:00.000Z"); // JST 2026-09-01 00:00
    expect(monthEndUtc.toISOString()).toBe("2026-09-30T15:00:00.000Z"); // JST 2026-10-01 00:00
  });
  it("年境界（12月→翌年1月）でも正しく月が繰り上がる", () => {
    const { monthStartUtc, monthEndUtc } = getJstMonthRangeUtc(new Date("2026-12-25T04:00:00.000Z"));
    expect(monthStartUtc.toISOString()).toBe("2026-11-30T15:00:00.000Z"); // JST 2026-12-01 00:00
    expect(monthEndUtc.toISOString()).toBe("2026-12-31T15:00:00.000Z"); // JST 2027-01-01 00:00
  });
});
