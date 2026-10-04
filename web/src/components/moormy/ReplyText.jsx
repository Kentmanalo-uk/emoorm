import { Fragment } from 'react';

/*
 * Ate Moormy's answers, as paragraphs and lists: the little markdown her
 * replies use (**bold**, *italic*, "- " bullets, "1. " steps). Shared by her
 * seller page and the buyers' chat.
 */

/** **bold** and *italic* inside a line. */
const inline = (text) => text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
  if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
  if (/^\*[^*\s][^*]*\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
  return <Fragment key={i}>{part}</Fragment>;
});

/** A reply as paragraphs and lists (the little markdown answers use). */
export default function ReplyText({ text }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const step = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || step) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        list = { type, items: [] };
        blocks.push(list);
      }
      list.items.push(bullet ? bullet[1] : step[2]);
      continue;
    }
    list = null;
    if (line) blocks.push({ type: 'p', text: line.replace(/^#{1,6}\s*/, '') });
  }
  return blocks.map((b, i) => {
    if (b.type === 'p') return <p key={i}>{inline(b.text)}</p>;
    const Tag = b.type;
    return <Tag key={i}>{b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</Tag>;
  });
}
