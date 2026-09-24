import { describe, it, expect, beforeEach } from "vitest";
import {
  loadRecent,
  saveRecent,
  MAX_RECENT,
} from "./recent-sessions";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("recent-sessions", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("returns empty array when nothing stored", () => {
    expect(loadRecent(storage)).toEqual([]);
  });

  it("returns empty array on corrupt JSON", () => {
    storage.setItem("partagi-recent-sessions", "{not-json");
    expect(loadRecent(storage)).toEqual([]);
  });

  it("filters non-string entries", () => {
    storage.setItem(
      "partagi-recent-sessions",
      JSON.stringify(["ABC", 1, null, "DEF"]),
    );
    expect(loadRecent(storage)).toEqual(["ABC", "DEF"]);
  });

  it("saves uppercase and dedupes, moving to front", () => {
    saveRecent("AAAA1111BBBB", storage);
    saveRecent("CCCC2222DDDD", storage);
    saveRecent("aaaa1111bbbb", storage);
    expect(loadRecent(storage)).toEqual([
      "AAAA1111BBBB",
      "CCCC2222DDDD",
    ]);
  });

  it("caps list at MAX_RECENT", () => {
    for (let i = 0; i < 8; i++) {
      saveRecent(`CODE0000000${i}`.slice(0, 12), storage);
    }
    const recent = loadRecent(storage);
    expect(recent).toHaveLength(MAX_RECENT);
  });

  it("ignores empty/whitespace codes", () => {
    saveRecent("   ", storage);
    expect(loadRecent(storage)).toEqual([]);
  });
});
