import { StyleSheet, Text, View } from 'react-native';
import { font } from '../../../theme';

/*
 * Ate Moormy's answers, as paragraphs and lists (web/src/components/moormy/
 * ReplyText.jsx inside .sa-bubble): the little markdown her replies use
 * (**bold**, *italic*, "- " bullets, "1. " steps). Paragraphs and lists are
 * 8px apart, list items 4px, lists indented 20px; bold is 600.
 */

/** **bold** and *italic* inside a line. */
const inline = (text, base) => text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
  if (/^\*\*[^*]+\*\*$/.test(part)) return <Text key={i} style={[base, styles.bold]}>{part.slice(2, -2)}</Text>;
  if (/^\*[^*\s][^*]*\*$/.test(part)) return <Text key={i} style={[base, styles.italic]}>{part.slice(1, -1)}</Text>;
  return part;
});

/** text: her reply; style: the bubble's text style (size, line height, colour). */
export default function ReplyText({ text, style }) {
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
    const gap = i > 0 ? styles.blockGap : null;
    if (b.type === 'p') return <Text key={i} style={[style, gap]}>{inline(b.text, style)}</Text>;
    return (
      <View key={i} style={[styles.list, gap]}>
        {b.items.map((item, j) => (
          <View key={j} style={[styles.li, j > 0 && styles.liGap]}>
            <Text style={[style, styles.marker]}>{b.type === 'ul' ? '•' : `${j + 1}.`}</Text>
            <Text style={[style, styles.liText]}>{inline(item, style)}</Text>
          </View>
        ))}
      </View>
    );
  });
}

const styles = StyleSheet.create({
  bold: { ...font(600) },
  italic: { fontStyle: 'italic' },
  blockGap: { marginTop: 8 },
  list: { paddingLeft: 20 },
  li: { flexDirection: 'row' },
  liGap: { marginTop: 4 },
  marker: { position: 'absolute', left: -20, width: 18, textAlign: 'right', paddingRight: 4 },
  liText: { flex: 1 },
});
