import { describe, it, expect } from "vitest";
import {
  streamHostFromUrl,
  viewerUrlFromStream,
  wsUrlWithRoom,
} from "./urls";

describe("streamHostFromUrl", () => {
  it("strips ws scheme and port", () => {
    expect(streamHostFromUrl("ws://192.168.1.66:9001?room=ABC")).toBe(
      "192.168.1.66",
    );
  });

  it("strips wss scheme", () => {
    expect(streamHostFromUrl("wss://example.com:9001?room=ABC")).toBe(
      "example.com",
    );
  });

  it("handles hostname without port", () => {
    expect(streamHostFromUrl("ws://example.com?room=ABC")).toBe("example.com");
  });
});

describe("viewerUrlFromStream", () => {
  it("builds http viewer URL with room", () => {
    expect(viewerUrlFromStream("ws://10.0.0.5:9001?room=ABC", "ABC")).toBe(
      "http://10.0.0.5:9002/?room=ABC",
    );
  });

  it("encodes room code", () => {
    expect(viewerUrlFromStream("ws://h:9001?room=x", "a b")).toBe(
      "http://h:9002/?room=a%20b",
    );
  });
});

describe("wsUrlWithRoom", () => {
  it("appends room with ? when no query", () => {
    expect(wsUrlWithRoom("ws://h:9001", "ABC")).toBe("ws://h:9001?room=ABC");
  });

  it("appends with & when query exists", () => {
    expect(wsUrlWithRoom("ws://h:9001?foo=1", "ABC")).toBe(
      "ws://h:9001?foo=1&room=ABC",
    );
  });
});
