import { StyleSheet, Text, View } from 'react-native';
import useAppSettings, { shortcutLook } from '../../lib/appSettings';
import { font, t, themed } from '../../theme';

/**
 * The head of a page that Home's shortcuts open (web Collection.jsx
 * .coll-head, ExploreMindoro.jsx .exm-head, LiveNow.jsx .lvn-head, phone
 * rules): the shortcut's mark at 40, and one line beside it. On phones the
 * page's title is in the back bar, so it is read out here but not drawn.
 *
 * Art: the FlatArt mark (drawn in the look the super admin chose).
 */
export default function ShortcutHead({ Art, title, line }) {
  const look = shortcutLook(useAppSettings());
  return (
    <View style={styles.head}>
      <View style={styles.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Art size={40} look={look} />
      </View>
      <View style={styles.text}>
        {title ? <Text style={styles.srOnly} accessibilityRole="header">{title}</Text> : null}
        <Text style={styles.line}>{line}</Text>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .coll-head on phones: a row 12 apart, padding 12 2 14.
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 12, paddingHorizontal: 2, paddingBottom: 14,
  },
  art: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  line: { fontSize: 14, lineHeight: 19.6, ...font(400), color: t.neutral[500] },
}));
