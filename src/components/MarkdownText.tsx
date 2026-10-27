import React from 'react';

// Small, safe markdown renderer for chat bubbles: headings, bullets, numbered lists, **bold**, `code`, fenced code.
// It builds React elements only, so message text is never injected as HTML.

const renderInline = (text: string, keyPrefix: string): React.ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key} className="px-1 py-0.5 rounded bg-slate-950/70 border border-slate-700/60 text-[0.85em] font-mono text-sky-200">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });

interface Props {
  text: string;
  /** Mermaid fences are shown separately by the chat, so they are dropped from the text. */
  hideMermaid?: boolean;
}

export const MarkdownText: React.FC<Props> = ({ text, hideMermaid = true }) => {
  const source = hideMermaid ? text.replace(/```mermaid[\s\S]*?```/g, '') : text;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  const state: { fence: string[] | null } = { fence: null };

  lines.forEach((raw, idx) => {
    const key = `l${idx}`;

    if (raw.trim().startsWith('```')) {
      if (state.fence === null) {
        state.fence = [];
      } else {
        blocks.push(
          <pre key={key} className="my-1 p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre">
            {state.fence.join('\n')}
          </pre>
        );
        state.fence = null;
      }
      return;
    }
    if (state.fence !== null) {
      state.fence.push(raw);
      return;
    }

    if (!raw.trim()) {
      blocks.push(<div key={key} className="h-2" />);
      return;
    }

    const heading = raw.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? 'text-base' : level === 2 ? 'text-sm' : 'text-[13px]';
      blocks.push(
        <div key={key} className={`${size} font-bold text-white mt-1`}>{renderInline(heading[2], key)}</div>
      );
      return;
    }

    const bullet = raw.match(/^(\s*)[-*•]\s+(.*)$/);
    const numbered = raw.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (bullet || numbered) {
      const indent = (bullet ? bullet[1] : numbered![1]).length;
      const marker = bullet ? '•' : `${numbered![2]}.`;
      const content = bullet ? bullet[2] : numbered![3];
      blocks.push(
        <div key={key} className="flex gap-2" style={{ marginLeft: Math.min(Math.floor(indent / 2), 3) * 14 }}>
          <span className="text-slate-500 shrink-0 w-4 text-right">{marker}</span>
          <span className="min-w-0">{renderInline(content, key)}</span>
        </div>
      );
      return;
    }

    blocks.push(<div key={key}>{renderInline(raw, key)}</div>);
  });

  if (state.fence !== null && state.fence.length > 0) {
    blocks.push(<pre key="open-fence" className="my-1 p-2 rounded-lg bg-slate-950/80 text-[11px] font-mono text-slate-300 whitespace-pre-wrap">{state.fence.join('\n')}</pre>);
  }

  return <div className="space-y-0.5 break-words">{blocks}</div>;
};
