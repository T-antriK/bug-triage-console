import type { EvidenceSpan } from '../types';

/** Renders the original report text with verified evidence spans wrapped
 *  in <mark>. Spans are assumed non-overlapping and sorted by start
 *  (pipeline guarantees both). Anything not verbatim never reaches here. */
export function EvidenceHighlight({
  text,
  spans,
}: {
  text: string;
  spans: EvidenceSpan[];
}) {
  if (spans.length === 0) {
    return <p className="evidence-text">{text}</p>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  spans.forEach((span, i) => {
    const start = Math.max(span.start, cursor);
    if (start > cursor) parts.push(text.slice(cursor, start));
    if (span.end > start) {
      parts.push(
        <mark className="evidence-mark" key={`m${i}`} title={span.supports}>
          {text.slice(start, span.end)}
        </mark>,
      );
    }
    cursor = Math.max(cursor, span.end);
  });

  if (cursor < text.length) parts.push(text.slice(cursor));

  return <p className="evidence-text">{parts}</p>;
}
