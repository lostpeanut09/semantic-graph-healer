import { describe, expect, it, vi } from "vitest";
import {
  coerceToMillis,
  coerceToStartOfDay,
  coerceToDateTime,
  normalizeStrictDateString,
  parseDateStrict,
} from "../../../src/core/utils/DateCoercer";

describe("DateCoercer", () => {
  describe("coerceToMillis", () => {
    it("returns number as is if reasonable", () => {
      const ms = new Date("2026-01-01").getTime();
      expect(coerceToMillis(ms)).toBe(ms);
    });

    it("multiplies seconds by 1000", () => {
      const secs = new Date("2026-01-01").getTime() / 1000;
      expect(coerceToMillis(secs)).toBe(secs * 1000);
    });

    it("returns getTime for Date objects", () => {
      const d = new Date("2026-01-01");
      expect(coerceToMillis(d)).toBe(d.getTime());
    });

    it("calls toMillis() for Luxon-like objects", () => {
      const obj = { toMillis: () => 123456789 };
      expect(coerceToMillis(obj)).toBe(123456789);
    });

    it("returns null for invalid values", () => {
      expect(coerceToMillis(null)).toBeNull();
      expect(coerceToMillis("2026-01-01")).toBeNull();
      expect(coerceToMillis(NaN)).toBeNull();
    });
  });

  describe("normalizeStrictDateString", () => {
    it("normalizes YYYYMMDD", () => {
      expect(normalizeStrictDateString("20260101")).toBe("2026-01-01");
    });

    it("normalizes YYYY-MM-DD", () => {
      expect(normalizeStrictDateString("2026-01-01")).toBe("2026-01-01");
    });

    it("returns null for invalid formats", () => {
      expect(normalizeStrictDateString("01-01-2026")).toBeNull();
      expect(normalizeStrictDateString("some text")).toBeNull();
    });
  });

  describe("parseDateStrict", () => {
    it("parses YYYY-MM-DD strings via fallback", () => {
      const result = parseDateStrict("2026-01-01", null, null) as Date;
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
    });

    it("uses dvApi.date if available", () => {
      const dvApi = { date: vi.fn(() => new Date("2026-02-02")) };
      const result = parseDateStrict("2026-01-01", null, dvApi) as Date;
      expect(dvApi.date).toHaveBeenCalledWith("2026-01-01");
      expect(result.getMonth()).toBe(1); // Feb
    });
  });
});
