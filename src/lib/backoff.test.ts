import { describe, it, expect } from "vitest";
import { nextBackoffDelay, BACKOFF_BASE_MS, BACKOFF_MAX_MS } from "./backoff";

describe("nextBackoffDelay", () => {
  it("grows by 1.5x by default", () => {
    expect(nextBackoffDelay(1000)).toBe(1500);
    expect(nextBackoffDelay(1500)).toBe(2250);
    expect(nextBackoffDelay(2250)).toBe(3375);
  });

  it("caps at max", () => {
    expect(nextBackoffDelay(4000)).toBe(BACKOFF_MAX_MS);
    expect(nextBackoffDelay(BACKOFF_MAX_MS)).toBe(BACKOFF_MAX_MS);
    expect(nextBackoffDelay(10_000)).toBe(BACKOFF_MAX_MS);
  });

  it("supports custom factor and max", () => {
    expect(nextBackoffDelay(1000, 10_000, 2)).toBe(2000);
    expect(nextBackoffDelay(6000, 8000, 2)).toBe(8000);
  });

  it("starts from base when reset externally", () => {
    expect(nextBackoffDelay(BACKOFF_BASE_MS)).toBe(1500);
  });
});
