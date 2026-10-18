/**
 * Streaming pipeline tests: real delta forwarding, duplicate prevention, and
 * the no-fallback-after-partial-stream rule.
 *
 * The Gemini SDK is mocked so provider behavior (deltas, failure timing,
 * usage metadata, cancellation) is exercised without network or keys.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockIsGeminiEnabled, mockConfigRef, streamControl } = vi.hoisted(() => {
  return {
    mockIsGeminiEnabled: vi.fn(() => true),
    mockConfigRef: {
      current: {
        ai: {
          provider: "gemini",
          geminiApiKey: "test-key-not-real",
          geminiModel: "test-model",
          complianceAttested: true,
          timeoutMs: 5_000,
          maxInputChars: 4000,
          maxOutputChars: 4000,
          rateLimit: { windowMs: 60_000, maxRequests: 20 },
        },
      },
    },
    streamControl: {
      behavior: undefined as
        | {
            chunks: unknown[];
            failAt?: number;
            failWith?: Error;
            signal?: AbortSignal;
          }
        | undefined,
    },
  };
});

vi.mock("../src/config.js", () => ({
  config: mockConfigRef.current,
  isGeminiEnabled: mockIsGeminiEnabled,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: async (params: { config?: { abortSignal?: AbortSignal } }) => {
        const behavior = streamControl.behavior;
        const signal = behavior?.signal ?? params.config?.abortSignal;
        if (!behavior) throw new Error("no stream behavior configured");
        const throwIfAborted = () => {
          if (signal?.aborted) {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            throw err;
          }
        };
        return (async function* () {
          throwIfAborted();
          for (let i = 0; i < behavior.chunks.length; i++) {
            if (behavior.failAt === i) throw behavior.failWith ?? new Error("boom");
            yield behavior.chunks[i];
            throwIfAborted();
          }
          if (behavior.chunks.length === behavior.failAt) {
            throw behavior.failWith ?? new Error("boom");
          }
        })();
      },
    };
  },
}));

const mockConfig = mockConfigRef.current;
void mockConfig;

import { streamWithFallback, generateWithFallback } from "../src/services/ai/index.js";

const ctx = {
  message: "Explain polynomial reductions",
  topicId: "polynomial-reductions",
  level: "beginner" as const,
  history: [],
};

describe("streamWithFallback forwards real deltas", () => {
  beforeEach(() => {
    mockIsGeminiEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("emits each provider chunk exactly once, in order, as deltas", async () => {
    streamControl.behavior = {
      chunks: [
        { text: "A polynomial reduction " },
        { text: "is a translation " },
        { text: "between problems." },
      ],
    };
    const deltas: string[] = [];
    const outcome = await streamWithFallback(ctx, { onDelta: (t) => deltas.push(t) });
    expect(deltas).toEqual([
      "A polynomial reduction ",
      "is a translation ",
      "between problems.",
    ]);
    expect(outcome.streamedDeltas).toBe(true);
    expect(outcome.reply.mode).toBe("ai");
    // The assembled reply is one text block whose content is exactly the
    // concatenation — not a cumulative snapshot, not a resend.
    const textBlocks = outcome.reply.blocks.filter((b) => b.type === "text");
    expect(textBlocks).toHaveLength(1);
    if (textBlocks[0]?.type === "text") {
      expect(textBlocks[0].markdown).toBe(deltas.join(""));
    }
  });

  it("surfaces exact provider token counts in usage metadata when available", async () => {
    streamControl.behavior = {
      chunks: [
        { text: "Hello" },
        {
          text: " world",
          usageMetadata: { candidatesTokenCount: 42, promptTokenCount: 11 },
          modelVersion: "test-model",
        },
      ],
    };
    const outcome = await streamWithFallback(ctx, { onDelta: () => {} });
    expect(outcome.usage).toEqual({
      model: "test-model",
      outputTokens: 42,
      inputTokens: 11,
    });
  });

  it("falls back to the curated provider when it fails before the first delta", async () => {
    streamControl.behavior = { chunks: [], failAt: 0, failWith: new Error("quota exceeded") };
    const deltas: string[] = [];
    const outcome = await streamWithFallback(ctx, { onDelta: (t) => deltas.push(t) });
    expect(deltas).toEqual([]);
    expect(outcome.streamedDeltas).toBe(false);
    expect(outcome.reply.mode).toBe("curated_fallback");
    expect(outcome.reply.blocks.length).toBeGreaterThan(0);
  });

  it("does NOT substitute curated content after partial AI text was streamed", async () => {
    streamControl.behavior = {
      chunks: [{ text: "Here is the beginning of the explanation." }],
      failAt: 1,
      failWith: new Error("connection reset"),
    };
    const deltas: string[] = [];
    await expect(
      streamWithFallback(ctx, { onDelta: (t) => deltas.push(t) }),
    ).rejects.toThrow(/connection reset|Gemini provider failed/);
    expect(deltas).toEqual(["Here is the beginning of the explanation."]);
  });

  it("rejects when the client aborts the stream (no curated content either)", async () => {
    streamControl.behavior = { chunks: [{ text: "partial " }, { text: "text" }] };
    const controller = new AbortController();
    controller.abort();
    await expect(
      streamWithFallback(ctx, { signal: controller.signal, onDelta: () => {} }),
    ).rejects.toThrow();
  });
});

describe("generateWithFallback (non-streaming path)", () => {
  it("falls back to curated content when the AI provider fails completely", async () => {
    streamControl.behavior = { chunks: [], failAt: 0, failWith: new Error("boom") };
    const reply = await generateWithFallback(ctx);
    expect(reply.mode).toBe("curated_fallback");
    expect(reply.blocks.length).toBeGreaterThan(0);
  });
});
