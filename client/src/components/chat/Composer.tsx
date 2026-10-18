/**
 * Bottom-anchored composer. The input stays usable while a response streams;
 * the send button becomes a stop button during streaming, and Enter submits /
 * Shift+Enter inserts a newline.
 */
import { useEffect, useRef, useState } from "react";

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  /** Optional placeholder copy (home screen vs active conversation). */
  placeholder?: string;
}

export function Composer({ onSend, onStop, streaming, placeholder }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    onSend(text);
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-row">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!streaming) submit();
              }
            }}
            placeholder={placeholder ?? "Ask a question, request an example, or say “quiz me”…"}
            aria-label="Message input"
            rows={1}
            className="composer-input"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="btn btn-stop composer-send"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <span className="stop-square" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              className="btn btn-primary composer-send"
              aria-label="Send message"
            >
              ↑
              <span className="send-label">Send</span>
            </button>
          )}
        </div>
        <p className="composer-hint">
          <span className="hint-desktop">Enter to send · Shift+Enter for a new line · </span>
          Answers are computed by deterministic solvers; always check formal claims against your course notes.
        </p>
      </div>
    </div>
  );
}
