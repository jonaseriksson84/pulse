import { describe, it, expect } from "vitest";
import { getWeekBounds, getPreviousWeek, getNextWeek, formatWeekKey } from "./week";

describe("getWeekBounds", () => {
  it("returns Monday-Sunday for a mid-week date", () => {
    const { start, end } = getWeekBounds(new Date("2026-04-08")); // Wednesday
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-06"); // Monday
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-12"); // Sunday
  });

  it("returns correct bounds when date is Monday", () => {
    const { start, end } = getWeekBounds(new Date("2026-04-06")); // Monday
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-12");
  });

  it("returns correct bounds when date is Sunday", () => {
    const { start, end } = getWeekBounds(new Date("2026-04-12")); // Sunday
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-12");
  });

  it("handles year boundary (week spanning Dec-Jan)", () => {
    // 2025-12-31 is a Wednesday
    const { start, end } = getWeekBounds(new Date("2025-12-31"));
    expect(start.toISOString().slice(0, 10)).toBe("2025-12-29"); // Monday
    expect(end.toISOString().slice(0, 10)).toBe("2026-01-04"); // Sunday
  });

  it("handles Jan 1 that falls on a Thursday", () => {
    // 2026-01-01 is a Thursday
    const { start, end } = getWeekBounds(new Date("2026-01-01"));
    expect(start.toISOString().slice(0, 10)).toBe("2025-12-29");
    expect(end.toISOString().slice(0, 10)).toBe("2026-01-04");
  });

  it("start time is 00:00:00 and end time is 23:59:59.999", () => {
    const { start, end } = getWeekBounds(new Date("2026-04-08"));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("getPreviousWeek", () => {
  it("returns bounds for the previous week", () => {
    const { start, end } = getPreviousWeek(new Date("2026-04-08"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-03-30");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("crosses year boundary backward", () => {
    const { start, end } = getPreviousWeek(new Date("2026-01-01"));
    expect(start.toISOString().slice(0, 10)).toBe("2025-12-22");
    expect(end.toISOString().slice(0, 10)).toBe("2025-12-28");
  });
});

describe("getNextWeek", () => {
  it("returns bounds for the next week", () => {
    const { start, end } = getNextWeek(new Date("2026-04-08"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-13");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-19");
  });

  it("crosses year boundary forward", () => {
    const { start, end } = getNextWeek(new Date("2025-12-29"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(end.toISOString().slice(0, 10)).toBe("2026-01-11");
  });
});

describe("formatWeekKey", () => {
  it("formats as YYYY-Www", () => {
    expect(formatWeekKey(new Date("2026-04-08"))).toBe("2026-04-06");
  });

  it("uses Monday date for the key", () => {
    // Sunday April 12 should still key to Monday April 6
    expect(formatWeekKey(new Date("2026-04-12"))).toBe("2026-04-06");
  });

  it("handles year boundary correctly", () => {
    expect(formatWeekKey(new Date("2026-01-01"))).toBe("2025-12-29");
  });
});
