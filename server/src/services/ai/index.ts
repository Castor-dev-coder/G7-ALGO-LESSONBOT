/**
 * Provider factory and fallback orchestration.
 *
 * The curated fallback answers when the AI provider is disabled, not
 * configured, or fails. Hard rules that govern the interaction with streaming:
 *
 *   1. If the AI provider already emitted a text delta before failing, we do
 *      NOT silently swap in curated content — the student has seen AI text,
 *      and prepending/appending pre-written paragraphs would duplicate or
 *      contradict it. The failure is thrown and surfaces as a stream error.
 *   2. When the AI provider fails before any delta was emitted, the curated
 *      fallback answers and the response mode honestly reports
 *      "curated_fallback".
 *
 * When the AI provider is enabled, each turn is ORCHESTRATED (see
 * orchestrator.ts): the model proposes a validated plan (intent, effective
 * topic, optional allowlisted tool), validated tool arguments run the
 * deterministic solvers, and only then does the model compose the explanation
 * around the verified result.
 */
import { config, isGeminiEnabled } from "../../config.js";
import { CuratedFallbackProvider } from "./curated-fallback.js";
import type { SolverResult } from "../../../../shared/contract.js";
import type { TutorContext, TutorProvider, TutorReply, TutorStreamHandlers, TutorUsage } from "./types.js";
import { isTopicId, detectTopicId } from "./topic-detection.js";

/** Backward-compatible alias for the provider factory. */
export async function createProvider(): Promise<TutorProvider> {
  if (isGeminiEnabled()) {
    try {
      const { GeminiTutorProvider } = await import("./gemini-provider.js");
      return new GeminiTutorProvider();
    } catch {
      return new CuratedFallbackProvider();
    }
  }
  return new CuratedFallbackProvider();
}

/** Backward-compatible alias for the provider factory. */
export async function getProvider(): Promise<TutorProvider> {
  return createProvider();
}

export function providerStatus(): { provider: string; enabled: boolean } {
  return {
    provider: isGeminiEnabled() ? "gemini" : config.ai.provider,
    enabled: isGeminiEnabled(),
  };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error("AI request timed out"), { name: "TimeoutError" })),
      config.ai.timeoutMs,
    );
  });
  // Observe both settle paths so clearTimeout always runs and the derived
  // promise never produces an unhandled rejection of its own.
  const cleanup = () => clearTimeout(timer);
  promise.then(cleanup, cleanup);
  return Promise.race([promise, timeoutPromise]);
}

function runCuratedFallback(context: TutorContext, streaming?: TutorStreamHandlers): Promise<TutorReply> {
  const fallback = new CuratedFallbackProvider();
  return fallback.generateReply(context, streaming);
}

export interface StreamOutcome {
  reply: TutorReply;
  /** True when at least one text delta was emitted before completion. */
  streamedDeltas: boolean;
  /** Trustworthy provider usage metadata, when the provider reports it. */
  usage?: TutorUsage;
  /** Verified solver output for this turn, when the plan requested a tool. */
  computation?: SolverResult;
  /** The topic that actually governed this response (may differ from selection). */
  effectiveTopicId: string;
  /** The validated plan when the AI provider drove the turn. */
  plan?: import("./orchestrator.js").TutorPlan;
}

/**
 * Streaming generation with automatic fallback. onDelta receives each newly
 * generated chunk exactly once, as the provider produces it — never cumulative
 * snapshots. The completion path does NOT re-emit the assembled text.
 */
export async function streamWithFallback(
  context: TutorContext,
  streaming?: TutorStreamHandlers,
): Promise<StreamOutcome> {
  let emitted = false;
  const wrapped: TutorStreamHandlers = {
    ...streaming,
    onDelta: (text) => {
      emitted = true;
      streaming?.onDelta?.(text);
    },
  };

  if (isGeminiEnabled()) {
    try {
      const gemini = await import("./gemini-provider.js");
      const { planWithRetry, streamGeminiReply } = gemini;
      const { executePlanTool } = await import("./orchestrator.js");

      // A. Conversation understanding: validated plan. Planning failure must
      // not kill the answer — degrade to a planless direct compose instead.
      let planning: Awaited<ReturnType<typeof planWithRetry>> | undefined;
      try {
        planning = await withTimeout(planWithRetry(context, streaming?.signal));
      } catch (planErr) {
        if (streaming?.signal?.aborted) throw planErr;
        planning = undefined;
      }
      const effectiveTopicId = planning && isTopicId(planning.plan.topicId)
        ? (planning.plan.topicId as string)
        : detectTopicId(context.message, context.topicId);
      streaming?.onResolved?.({ effectiveTopicId });

      // B. Verified computation (only with allowlisted, validated arguments).
      const executed = planning ? executePlanTool(planning.plan) : undefined;
      const computation = executed?.computation;

      // C. Explanation, streaming, aware of the verified result.
      const planContext: TutorContext = {
        ...context,
        computedTrace: computation
          ? {
              algorithmId: computation.algorithmId,
              algorithmName: computation.algorithmName,
              result: computation.result,
              guarantee: computation.guarantee,
            }
          : context.computedTrace,
      };
      const result = await withTimeout(
        streamGeminiReply(
          planContext,
          wrapped,
          planning
            ? { plan: planning.plan, computation, usedCuratedInput: executed?.usedCuratedInput }
            : undefined,
        ),
      );
      return {
        reply: result.reply,
        streamedDeltas: emitted,
        usage: result.usage,
        computation,
        effectiveTopicId,
        plan: planning?.plan,
      };
    } catch (err) {
      if (emitted || streaming?.signal?.aborted) {
        // Partial AI text is already visible; swapping in curated content
        // here would duplicate or contradict it. Surface the real failure.
        throw err;
      }
      try {
        const curated = await runCuratedFallback(context, wrapped);
        streaming?.onResolved?.({
          effectiveTopicId: curated.topicId ?? detectTopicId(context.message, context.topicId),
        });
        return {
          reply: { ...curated, mode: "curated_fallback" },
          streamedDeltas: false,
          effectiveTopicId: curated.topicId ?? detectTopicId(context.message, context.topicId),
        };
      } catch {
        // The message may be off-scope; the route reports a safe error.
        throw err;
      }
    }
  }

  const provider = await createProvider();
  const outcome = await provider.generateReply(context, wrapped);
  const resolvedTopicId = outcome.topicId ?? detectTopicId(context.message, context.topicId);
  streaming?.onResolved?.({ effectiveTopicId: resolvedTopicId });
  return {
    reply: outcome,
    streamedDeltas: emitted,
    effectiveTopicId: resolvedTopicId,
  };
}

/**
 * Non-streaming generation with automatic fallback (used by the JSON route
 * and simple clients). See module docblock for the fallback rules.
 */
export async function generateWithFallback(context: TutorContext): Promise<
  TutorReply & { computation?: SolverResult; effectiveTopicId: string }
> {
  const outcome = await streamWithFallback(context);
  return {
    ...outcome.reply,
    computation: outcome.computation,
    effectiveTopicId: outcome.effectiveTopicId,
  };
}
