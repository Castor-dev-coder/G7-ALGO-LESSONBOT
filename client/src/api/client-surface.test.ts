/**
 * The API client surface must not change as part of the landing-page work: the
 * chat depends on every one of these. This suite imports the REAL module (no
 * mocks) and asserts the shape is intact.
 */
import { describe, expect, it } from "vitest";
import { api, friendlyError, joinUrl, parseSseChunk, streamChat } from "./client";

describe("api client surface", () => {
  it("still exposes every endpoint the chat uses", () => {
    for (const method of ["health", "topics", "topic", "chat", "solve", "generateQuiz", "gradeQuiz"] as const) {
      expect(typeof api[method], `api.${method}`).toBe("function");
    }
  });

  it("still exposes streaming chat and its helpers", () => {
    expect(typeof streamChat).toBe("function");
    expect(typeof parseSseChunk).toBe("function");
    expect(typeof friendlyError).toBe("function");
    expect(typeof joinUrl).toBe("function");
  });

  it("keeps the SSE frame parser behaviour the chat relies on", () => {
    const events = parseSseChunk('event: delta\ndata: {"text":"hi"}\n\nevent: done\ndata: {"actions":["quiz"]}\n\n');
    expect(events).toEqual([
      { event: "delta", data: { text: "hi" } },
      { event: "done", data: { actions: ["quiz"] } },
    ]);
  });

  it("keeps joining API base URLs the same way", () => {
    expect(joinUrl("", "/api/topics")).toBe("/api/topics");
    expect(joinUrl("https://api.example.com/", "/api/topics")).toBe("https://api.example.com/api/topics");
  });
});
