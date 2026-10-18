/**
 * Compact top bar. Shows on small screens (with a menu button that opens the
 * sidebar drawer) and as a slim context bar on desktop.
 */
import type { LearningLevel, TopicSummary } from "@shared/contract";
import type { ProviderStatus } from "../../App";

interface HeaderProps {
  topics: TopicSummary[];
  topicId: string;
  level: LearningLevel;
  provider: ProviderStatus;
  onOpenDrawer: () => void;
  streaming: boolean;
  /** Title of the active (or restored) conversation, when one exists. */
  conversationTitle?: string | null;
}

export function Header({ topics, topicId, level, provider, onOpenDrawer, streaming, conversationTitle }: HeaderProps) {
  const topic = topics.find((t) => t.slug === topicId);
  return (
    <header className="header">
      <button
        type="button"
        className="btn btn-icon header-menu"
        onClick={onOpenDrawer}
        aria-label="Open navigation menu"
        aria-haspopup="true"
      >
        <span className="menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <div className="header-context">
        <span className="header-topic">{conversationTitle ?? (topic ? topic.title : "AlgoTutor AI")}</span>
        <span className="header-meta">
          <span
            className={`provider-badge ${provider.enabled ? "provider-ai" : "provider-curated"}`}
            title={
              provider.enabled
                ? "AI provider active (Gemini)"
                : "AI provider is off. Curated offline lessons answer every question."
            }
          >
            <span className="provider-dot" aria-hidden="true" />
            {provider.enabled ? "AI" : "Curated"}
          </span>
          {streaming && <span className="streaming-dot" aria-label="Generating response" />}
          <span className="header-level" title={`Teaching level: ${level}`}>
            {level === "beginner" ? "Beginner" : level === "intermediate" ? "Intermediate" : "Formal"}
          </span>
        </span>
      </div>
    </header>
  );
}
