// Unit tests for lib/registrations/age.ts (sub-task 3).
//
// Supports AC12 (spec.md §8: "idade calculada a partir de data_nascimento,
// não uma coluna armazenada") by pinning down the actual calendar-age
// calculation in isolation, with a fixed, injected reference date so results
// are fully deterministic and reproducible regardless of when the suite
// runs (per the sub-task's explicit instruction not to rely on an
// uncontrolled `new Date()` for the assertion).
//
// Interface decision (not fixed by spec.md/decisions.md, made here as part
// of writing the failing spec): `calculateAge(dataNascimento, now?)` takes
// an optional reference `Date` (defaulting to `new Date()` for real
// call-sites) precisely so it -- and anything that composes it -- can be
// tested deterministically without freezing global time.
import { describe, expect, it } from "vitest";
import { calculateAge } from "./age";

describe("calculateAge", () => {
  it("returns the naive year difference when the birthday already occurred this year relative to the reference date", () => {
    const referenceDate = new Date("2026-09-21T00:00:00Z");
    expect(calculateAge("2000-03-15", referenceDate)).toBe(26);
  });

  it("returns one less than the naive year difference when the birthday has not yet occurred this year relative to the reference date", () => {
    const referenceDate = new Date("2026-09-21T00:00:00Z");
    expect(calculateAge("2000-12-25", referenceDate)).toBe(25);
  });

  it("counts the birthday itself as having occurred when the reference date lands exactly on it", () => {
    const referenceDate = new Date("2026-09-21T00:00:00Z");
    expect(calculateAge("2000-09-21", referenceDate)).toBe(26);
  });

  it("computes correctly for a birth date many decades in the past", () => {
    const referenceDate = new Date("2026-09-21T00:00:00Z");
    expect(calculateAge("1930-01-01", referenceDate)).toBe(96);
  });

  it("computes correctly for someone born earlier this same year (age 0)", () => {
    const referenceDate = new Date("2026-09-21T00:00:00Z");
    expect(calculateAge("2026-01-05", referenceDate)).toBe(0);
  });

  it("defaults the reference date to the real current time when none is passed, for a birth date on January 1st (whose birthday has necessarily already passed this year, whatever day it is)", () => {
    // No `now` argument: exercises the function's default-parameter path
    // without asserting anything time-of-day-sensitive -- Jan 1st has
    // already occurred by construction, on any date `new Date()` could
    // return, so the expected age is exactly `currentYear - birthYear`.
    const expectedAge = new Date().getFullYear() - 2000;
    expect(calculateAge("2000-01-01")).toBe(expectedAge);
  });
});
