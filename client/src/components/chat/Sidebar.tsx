/**
 * Navigation sidebar. A fixed panel on wide screens; a slide-over drawer with
 * a scrim on narrow screens.
 *
 * The topic catalog is a SECONDARY section here — it is never a prerequisite
 * for asking a question. Recent conversations (browser-local, capped) get the
 * prominent position, plus new-chat, level, provider status, and privacy.
 */
import { useEffect, useRef, useState } from "react";
import type { LearningLevel, TopicSummary } from "@shared/contract";
import { LEARNING_LEVELS } from "@shared/contract";
import type { ProviderStatus } from "../../App";
import type { StoredConversation } from "../../lib/conversations";
import { STORAGE_NOTICE } from "../../lib/conversations";

interface SidebarProps {
  topics: TopicSummary[];
  topicId: string;
  onTopicChange: (id: string) => void;
  level: LearningLevel;
  onLevelChange: (level: LearningLevel) => void;
  onNewChat: () => void;
  onShowPrivacy: () => void;
  provider: ProviderStatus;
  open: boolean;
  onClose: () => void;
  conversations: StoredConversation[];
  activeConversationId: string | null;
  onOpenConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
}

const LEVEL_LABELS: Record<LearningLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  formal: "Formal",
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function Sidebar({
  topics,
  topicId,
  onTopicChange,
  level,
  onLevelChange,
  onNewChat,
  onShowPrivacy,
  provider,
  open,
  onClose,
  conversations,
  activeConversationId,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
}: SidebarProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Move focus into the drawer when it opens (keyboard/mobile accessibility).
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const startRename = (conv: StoredConversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  const commitRename = () => {
    if (renamingId) onRenameConversation(renamingId, renameValue);
    setRenamingId(null);
  };

  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Conversation navigation">
        <div className="sidebar-head">
          <span className="brand-mark" aria-hidden="true">
            λ
          </span>
          <span className="brand-name">AlgoTutor AI</span>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn btn-icon sidebar-close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <button type="button" className="btn btn-primary sidebar-newchat" onClick={onNewChat}>
          + New chat
        </button>

        <nav className="sidebar-recents" aria-label="Recent conversations">
          <p className="sidebar-label">Recent conversations</p>
          {conversations.length === 0 ? (
            <p className="sidebar-empty">No recent conversations yet.</p>
          ) : (
            <ul className="recents-list">
              {conversations.map((conv) => (
                <li key={conv.id} className={`recents-item ${conv.id === activeConversationId ? "recents-item-active" : ""}`}>
                  {renamingId === conv.id ? (
                    <form
                      className="recents-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename();
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        aria-label="Rename conversation"
                        maxLength={120}
                      />
                    </form>
                  ) : (
                    <>
                      <button type="button" className="recents-open" onClick={() => onOpenConversation(conv.id)} title={conv.title}>
                        <span className="recents-title">{conv.title}</span>
                        <span className="recents-meta">
                          {relativeTime(conv.updatedAt)} · {conv.messages.length} msg
                        </span>
                      </button>
                      <span className="recents-actions">
                        <button type="button" className="btn-icon-mini" onClick={() => startRename(conv)} aria-label={`Rename "${conv.title}"`}>
                          ✎
                        </button>
                        <button type="button" className="btn-icon-mini" onClick={() => onDeleteConversation(conv.id)} aria-label={`Delete "${conv.title}"`}>
                          🗑
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="sidebar-note">{STORAGE_NOTICE}</p>
        </nav>

        <details className="sidebar-section sidebar-topics-details">
          <summary className="sidebar-label" aria-label="Topic catalog">
            Topic catalog
          </summary>
          <p className="sidebar-note">Optional context — you can ask about any topic directly in the chat.</p>
          {topics.map((t) => (
            <button
              key={t.slug}
              type="button"
              className={`sidebar-topic ${t.slug === topicId ? "sidebar-topic-active" : ""}`}
              onClick={() => {
                onTopicChange(t.slug);
                onClose();
              }}
              title={t.description}
            >
              {t.title}
            </button>
          ))}
        </details>

        <div className="sidebar-section">
          <p className="sidebar-label" id="level-label">
            Level
          </p>
          <div className="segmented" role="radiogroup" aria-labelledby="level-label">
            {LEARNING_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={level === l}
                className={`segment ${level === l ? "segment-active" : ""}`}
                onClick={() => onLevelChange(l)}
              >
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div
            className={`provider-badge ${provider.enabled ? "provider-ai" : "provider-curated"}`}
            title={
              provider.enabled
                ? "AI provider active (Gemini)"
                : "AI provider is off. Curated offline lessons answer every question."
            }
          >
            <span className="provider-dot" aria-hidden="true" />
            {provider.enabled ? "AI provider" : "Curated lessons"}
          </div>
          <button type="button" className="linklike" onClick={onShowPrivacy}>
            Privacy
          </button>
        </div>
      </aside>
    </>
  );
}
