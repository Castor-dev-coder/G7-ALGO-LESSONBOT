import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Markdown is rendered to sanitized HTML only. Raw HTML in model output is
// stripped by the server; this is the second line of defense. Table elements
// are allowed so streamed markdown tables survive sanitization.
marked.setOptions({ gfm: true, breaks: true });

export function TextBlock({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "p", "strong", "em", "ul", "ol", "li", "code", "pre", "br",
        "h1", "h2", "h3", "h4", "blockquote", "a", "table", "thead", "tbody",
        "tr", "th", "td",
      ],
      ALLOWED_ATTR: ["href", "target", "rel"],
    });
  }, [markdown]);
  return <div className="block text-block" dangerouslySetInnerHTML={{ __html: html }} />;
}
