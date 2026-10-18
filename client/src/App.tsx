/**
 * AlgoTutor AI — conversation-first learning interface.
 *
 * The conversation is the primary interface: a welcome screen with capability
 * suggestions, then a centered chat. The topic catalog is secondary (drawer);
 * the server decides the effective topic from the message itself and the
 * client follows it. Recent conversations persist in browser-local storage —
 * no accounts, no database, nothing uploaded.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatBlock, LearningLevel, TopicSummary } from "@shared/contract";
import { TUTOR_ACTIONS } from "@shared/contract";
import { api, streamChat } from "./api/client";
import { ChatThread } from "./components/chat/ChatThread";
import { Composer } from "./components/chat/Composer";
import { Header } from "./components/chat/Header";
import { Sidebar } from "./components/chat/Sidebar";
import { PrivacyNotice } from "./components/chat/PrivacyNotice";
import {
  loadConversations,
  newConversationId,
  renameConversation,
  deleteConversation as deleteStoredConversation,
  titleFromMessage,
  upsertConversation,
  type StoredConversation,
} from "./lib/conversations";

export interface Message {
  id: string;
  role: "user" | "assistant";
  /** User text, or the streamed text of an assistant reply. */
  text?: string;
  blocks?: ChatBlock[];
  /** Producing mode — undefined until the server declares it. */
  mode?: "ai" | "curated_fallback";
  error?: string;
  /** Assistant message still receiving its response. */
  streaming?: boolean;
  /** Generation was stopped by the user before completion. */
  stopped?: boolean;
  /** Context that produced this message (for regenerate). */
  topicId?: string;
  level?: LearningLevel;
  /** Follow-up action ids the producer says it can honor next. */
  actions?: string[];
  /**
   * Present only when an enabled AI provider failed before its first text
   * delta and the curated fallback answered instead (from the SSE done event).
   */
  fallbackReason?: string;
}

export interface ProviderStatus {
  provider: string;
  enabled: boolean;
}

/**
 * Capability suggestions. Each one submits a REAL message; servers route it
 * from the message content itself — no topic pre-selection is implied.
 */
const CAPABILITY_CHIPS: { label: string; prompt: string; hint: string }[] = [
  { label: "Explain a concept", prompt: "Explain polynomial-time reductions to me as a beginner", hint: "Plain-language intro to reductions" },
  { label: "Prove a theorem", prompt: "Show me the formal proof of the Cook–Levin theorem", hint: "Formal statement and proof sketch" },
  { label: "Run an algorithm", prompt: "Run a randomized Max-Cut demo", hint: "Verified step-by-step solver trace" },
  { label: "Visualize a graph", prompt: "Visualize a Vertex Cover example on a graph", hint: "Graph rendering of a worked instance" },
  { label: "Compare approaches", prompt: "Compare Vertex Cover approximation with randomized Max-Cut", hint: "Guarantees and trade-offs" },
  { label: "Generate a practice question", prompt: "Generate a practice question for me", hint: "Graded quiz from the validated bank" },
];

let idCounter = 0;
function nextId() {
  return `m-${Date.now().toString(36)}-${idCounter++}`;
}

/** Compact, fact-bearing history line for structured blocks (Phase 7). */
function blockHistoryFacts(m: Message): string {
  if (!m.blocks) return "";
  return m.blocks
    .map((b) => {
      if (b.type === "text" || b.type === "callout") return b.markdown;
      if (b.type === "algorithm_trace") {
        const trace = b.trace;
        return `[Verified ${trace.algorithmName} result: ${JSON.stringify(trace.result).slice(0, 400)}${trace.guarantee ? `, guarantee: ${trace.guarantee}` : ""}]`;
      }
      if (b.type === "graph") {
        return `[Graph shown: ${b.data.nodes.length} vertices (${b.data.nodes.map((n) => n.label).join(", ").slice(0, 120)}), ${b.data.edges.length} edges]`;
      }
      if (b.type === "quiz") return `[Practice quiz shown: ${b.quiz.title}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function currentConversationId(): string {
  return newConversationId();
}

export default function App() {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [topicId, setTopicId] = useState<string>("polynomial-reductions");
  const [level, setLevel] = useState<LearningLevel>("beginner");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderStatus>({ provider: "curated", enabled: false });
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Recent conversations (browser-local; no database).
  const [conversations, setConversations] = useState<StoredConversation[]>(() => loadConversations());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);

  // Auto-scroll: only when the user is already near the bottom.
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Delta batching: accumulate provider text chunks and flush at most once
  // per animation frame so the UI tracks the stream without re-rendering the
  // conversation for every tiny chunk.
  const deltaQueue = useRef<{ id: string; text: string }[]>([]);
  const rafHandle = useRef<number | null>(null);

  // Latest effective topic/title, for end-of-turn bookkeeping.
  const conversationStateRef = useRef<{
    id: string | null;
    title: string | null;
    topicId: string;
    level: LearningLevel;
  }>({ id: null, title: null, topicId: "polynomial-reductions", level: "beginner" });
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    api
      .topics()
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics([]));
    api
      .health()
      .then((r) => setProvider(r.ai))
      .catch(() => undefined);
  }, []);

  // Persist the active conversation after each completed turn.
  const persistConversation = useCallback(
    (finalMessages: Message[]) => {
      if (finalMessages.length === 0) return;
      const state = conversationStateRef.current;
      const convId = state.id ?? currentConversationId();
      const firstUser = finalMessages.find((m) => m.role === "user")?.text ?? "";
      const stored: StoredConversation = {
        id: convId,
        title: state.title ?? titleFromMessage(firstUser || "Conversation"),
        topicId: state.topicId,
        level: state.level,
        messages: finalMessages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          blocks: m.blocks,
          error: m.error,
          stopped: m.stopped,
        })),
        updatedAt: Date.now(),
      };
      setConversations((prev) => upsertConversation(prev, stored));
      conversationStateRef.current = { ...state, id: convId };
      if (!conversationId) setConversationId(convId);
    },
    [conversationId],
  );

  const flushDeltas = useCallback(() => {
    rafHandle.current = null;
    const queued = deltaQueue.current;
    deltaQueue.current = [];
    if (queued.length === 0) return;
    setMessages((prev) => {
      const next = [...prev];
      for (const { id, text } of queued) {
        const idx = next.findIndex((m) => m.id === id);
        if (idx >= 0 && next[idx].streaming) {
          next[idx] = { ...next[idx], text: (next[idx].text ?? "") + text };
        }
      }
      return next;
    });
  }, []);

  const queueDelta = useCallback(
    (id: string, text: string) => {
      deltaQueue.current.push({ id, text });
      if (rafHandle.current === null) {
        rafHandle.current = requestAnimationFrame(flushDeltas);
      }
    },
    [flushDeltas],
  );

  useEffect(
    () => () => {
      if (rafHandle.current !== null) cancelAnimationFrame(rafHandle.current);
    },
    [],
  );

  // Keep near-bottom scroll behavior: scroll only if the user has not scrolled
  // up to review earlier content.
  useEffect(() => {
    if (!stickToBottom.current) return;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const cancelRef = useRef<(() => void) | null>(null);
  // Synchronous in-flight guard: the streamingId state read lags a render,
  // so rapid double submissions (double-click, chip + Enter) need a ref that
  // is set before the first request is dispatched.
  const inFlightRef = useRef(false);

  const send = useCallback(
    async (text: string, topicOverride?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (inFlightRef.current || cancelRef.current) return; // no duplicate submissions
      inFlightRef.current = true;
      const effectiveTopicId = topicOverride ?? conversationStateRef.current.topicId;
      const levelForTurn = level;

      const userMsg: Message = {
        id: nextId(),
        role: "user",
        text: trimmed,
        topicId: effectiveTopicId,
        level: levelForTurn,
      };
      const assistantId = nextId();
      stickToBottom.current = true;

      // Phase 7: bounded, fact-bearing conversation history. The last user
      // messages plus the assistant text AND structured facts (verified
      // results, graph contents, shown quizzes) so follow-ups can refer to
      // "those vertices" or "step 3" concretely.
      const history = messagesRef.current
        .filter((m) => !m.error && (m.text || m.blocks?.length))
        .slice(-12)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content:
            m.role === "user"
              ? (m.text ?? "")
              : [m.text ?? "", blockHistoryFacts(m)].filter(Boolean).join("\n").slice(0, 2000),
        }));

      const priorMessages = messagesRef.current;
      if (!conversationStateRef.current.id) {
        conversationStateRef.current = {
          ...conversationStateRef.current,
          id: currentConversationId(),
          title: titleFromMessage(priorMessages.length === 0 ? trimmed : (priorMessages.find((m) => m.role === "user")?.text ?? trimmed)),
        };
        setConversationId(conversationStateRef.current.id);
        setConversationTitle(conversationStateRef.current.title);
      }

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", streaming: true, topicId: effectiveTopicId, level: levelForTurn },
      ]);
      setStreamingId(assistantId);
      setDrawerOpen(false);

      let done = false;

      const finishTurn = (patch: Partial<Message>) => {
        if (done) return;
        done = true;
        flushDeltas();
        setMessages((prev) => {
          const next = prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, ...patch } : m));
          return next;
        });
        setStreamingId(null);
        cancelRef.current = null;
        inFlightRef.current = false;
      };

      cancelRef.current = streamChat(
        { message: trimmed, topicId: effectiveTopicId, level: levelForTurn, history },
        {
          onDelta: (delta) => queueDelta(assistantId, delta),
          onBlock: (_index, block) => {
            // A structured block means the streamed text (if any) is complete;
            // flush pending deltas first so ordering stays truthful.
            flushDeltas();
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, blocks: [...(m.blocks ?? []), block] } : m)),
            );
          },
          onMeta: (meta) => {
            // Topic switching without the sidebar: the server's effective
            // topic governs the conversation from now on.
            if (meta.effectiveTopicId) {
              conversationStateRef.current = { ...conversationStateRef.current, topicId: meta.effectiveTopicId };
              setTopicId(meta.effectiveTopicId);
            }
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId && !m.mode ? { ...m, mode: meta.mode } : m)),
            );
          },
          onDone: (info) => {
            if (info.effectiveTopicId) {
              conversationStateRef.current = { ...conversationStateRef.current, topicId: info.effectiveTopicId };
              setTopicId(info.effectiveTopicId);
            }
            finishTurn({ actions: info.actions, fallbackReason: info.fallbackReason });
            window.setTimeout(() => persistConversation(messagesRef.current), 60);
          },
          onError: (message) => {
            finishTurn({ error: message });
          },
        },
      );
    },
    [level, streamingId, queueDelta, flushDeltas, persistConversation],
  );

  const stop = useCallback(() => {
    if (cancelRef.current) cancelRef.current();
    cancelRef.current = null;
    inFlightRef.current = false;
    if (streamingId) {
      const id = streamingId;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, streaming: false, stopped: !m.text && !m.blocks?.length } : m,
        ),
      );
      setStreamingId(null);
      window.setTimeout(() => persistConversation(messagesRef.current), 50);
    }
  }, [streamingId, persistConversation]);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setConversationId(null);
    setConversationTitle(null);
    conversationStateRef.current = {
      id: null,
      title: null,
      topicId,
      level,
    };
    setDrawerOpen(false);
    stickToBottom.current = true;
  }, [stop, topicId, level]);

  const regenerate = useCallback(() => {
    if (streamingId) return;
    // Find the last user message and remove everything after it, then resend.
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser < 0) return;
    const user = messages[lastUser];
    setMessages(messages.slice(0, lastUser));
    void send(user.text ?? "", user.topicId);
  }, [messages, streamingId, send]);

  const selectTopic = useCallback(
    (id: string) => {
      setTopicId(id);
      conversationStateRef.current = { ...conversationStateRef.current, topicId: id };
    },
    [],
  );

  const openConversation = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      stop();
      setMessages(
        conv.messages.map((m) => ({ ...m, streaming: false })),
      );
      setConversationId(conv.id);
      setConversationTitle(conv.title);
      conversationStateRef.current = { id: conv.id, title: conv.title, topicId: conv.topicId, level: conv.level };
      setTopicId(conv.topicId);
      setLevel(conv.level);
      setDrawerOpen(false);
      stickToBottom.current = true;
    },
    [conversations, stop],
  );

  const removeConversation = useCallback(
    (id: string) => {
      const next = deleteStoredConversation(id, conversations);
      setConversations(next);
      if (id === conversationId) {
        stop();
        setMessages([]);
        setConversationId(null);
        setConversationTitle(null);
      }
    },
    [conversations, conversationId, stop],
  );

  const renameCurrent = useCallback(
    (id: string, title: string) => {
      const next = renameConversation(id, title, conversations);
      setConversations(next);
      if (id === conversationId && title.trim()) {
        setConversationTitle(title.trim());
        conversationStateRef.current = { ...conversationStateRef.current, title: title.trim() };
      }
    },
    [conversations, conversationId],
  );

  return (
    <div className="app">
      <Sidebar
        topics={topics}
        topicId={topicId}
        onTopicChange={selectTopic}
        level={level}
        onLevelChange={setLevel}
        onNewChat={reset}
        onShowPrivacy={() => {
          setShowPrivacy(true);
          setDrawerOpen(false);
        }}
        provider={provider}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversations={conversations}
        activeConversationId={conversationId}
        onOpenConversation={openConversation}
        onRenameConversation={renameCurrent}
        onDeleteConversation={removeConversation}
      />
      <div className="main">
        <Header
          topics={topics}
          topicId={topicId}
          level={level}
          provider={provider}
          onOpenDrawer={() => setDrawerOpen(true)}
          streaming={Boolean(streamingId)}
          conversationTitle={conversationTitle}
        />
        <main
          className="thread"
          ref={threadRef}
          onScroll={onThreadScroll}
          aria-live="polite"
        >
          <div className="thread-inner">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-icon" aria-hidden="true">
                  λ
                </div>
                <h1 className="welcome-title">What would you like to learn today?</h1>
                <p className="welcome-sub">
                  Ask a question in your own words — no topic selection needed. I can explain concepts, prove theorems,
                  run verified algorithms step by step, and draw graphs.
                  {provider.enabled ? " Responses are AI-generated." : " Responses come from curated, offline lessons."}
                </p>
                <div className="starter-chips" role="group" aria-label="Capabilities">
                  {CAPABILITY_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      className="chip"
                      title={chip.hint}
                      onClick={() => void send(chip.prompt)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {(conversationStateRef.current.id || conversations.length > 0) && null}
                {conversations.length > 0 && (
                  <p className="welcome-note">
                    Your recent conversations are kept in this browser only — open one from the menu tab.
                  </p>
                )}
              </div>
            ) : (
              <ChatThread
                messages={messages}
                streamingActive={Boolean(streamingId)}
                onAction={(action) => void send(action)}
                onRegenerate={regenerate}
              />
            )}
          </div>
        </main>
        <Composer
          onSend={(text) => void send(text)}
          onStop={stop}
          streaming={Boolean(streamingId)}
          placeholder="Ask anything — e.g. 'run a Max-Cut demo' or 'explain the formal proof'"
        />
      </div>
      {showPrivacy && <PrivacyNotice onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
