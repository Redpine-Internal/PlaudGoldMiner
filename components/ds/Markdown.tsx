"use client";
import type React from "react";

/**
 * Minimal, dependency-free Markdown renderer for the subset Plaud's auto summaries
 * produce: ## / ### headings, **bold**, > blockquotes, - / numbered lists, ---
 * dividers, and paragraphs. No dangerouslySetInnerHTML — everything is real React
 * nodes, so arbitrary content stays safe.
 */
export interface MarkdownProps {
  children: string;
  style?: React.CSSProperties;
}

const text: React.CSSProperties = { font: "400 14px/22px var(--font-sans)", color: "var(--color-muted-foreground)" };

/** Split a line into React nodes, honoring **bold** spans. */
function inline(line: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(
      <strong key={`${keyBase}-b${i++}`} style={{ color: "var(--color-foreground)", fontWeight: 600 }}>
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function Markdown({ children, style }: MarkdownProps) {
  const lines = (children || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];

  // Every block's key is its position in `blocks` — always unique, even when a
  // single source line flushes both a paragraph and a list (which previously
  // collided on the shared line key).
  const flushPara = () => {
    if (!para.length) return;
    const bk = `md-b${blocks.length}`;
    blocks.push(
      <p key={bk} style={{ ...text, margin: "0 0 10px" }}>
        {para.flatMap((l, i) => (i ? [<br key={`${bk}-br${i}`} />, ...inline(l, `${bk}-${i}`)] : inline(l, `${bk}-${i}`)))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const bk = `md-b${blocks.length}`;
    blocks.push(
      <ul key={bk} style={{ ...text, margin: "0 0 10px", paddingLeft: 20 }}>
        {list.map((li, i) => (
          <li key={`${bk}-${i}`} style={{ marginBottom: 4 }}>
            {inline(li, `${bk}-${i}`)}
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushPara();
      flushList();
      return;
    }
    // Divider
    if (/^---+$/.test(line.trim())) {
      flushPara();
      flushList();
      blocks.push(<hr key={`md-b${blocks.length}`} style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "12px 0" }} />);
      return;
    }
    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      const size = level <= 2 ? 16 : 14;
      {
        const bk = `md-b${blocks.length}`;
        blocks.push(
          <div
            key={bk}
            style={{ font: `600 ${size}px/${size + 6}px var(--font-sans)`, color: "var(--color-foreground)", margin: "14px 0 6px" }}
          >
            {inline(h[2], bk)}
          </div>
        );
      }
      return;
    }
    // List item (-, *, or numbered), or blockquote line
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      list.push(li[1]);
      return;
    }
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      flushList();
      para.push(bq[1]);
      return;
    }
    // Plain paragraph line
    flushList();
    para.push(line);
  });
  flushPara();
  flushList();

  return <div style={style}>{blocks}</div>;
}
