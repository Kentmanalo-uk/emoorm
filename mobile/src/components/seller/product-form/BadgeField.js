import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t, themed } from '../../../theme';
import { BadgeTag, PRODUCT_BADGES } from '../../TodayTag';
import { Field, PF } from './parts';

/*
 * Badge (web product-form/BadgeField.jsx): a small label before the
 * product's name (Pre-order, Palengke, DIY), picked from the tags themselves
 * as buyers will see them. Only a label: how people order stays the same.
 * '' is none.
 */
export default function BadgeField({ value, onChange }) {
  const opt = (key, label, content) => {
    const on = (value || '') === key;
    return (
      <Pressable
        key={key || 'none'}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        onPress={() => onChange(key)}
        style={[styles.opt, on && styles.optOn]}
      >
        {content}
      </Pressable>
    );
  };
  return (
    <Field label="Badge" optional hint="A small label on your product. It doesn't change how people order.">
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Badge">
        {opt('', 'None', <Text style={[styles.none, !value && styles.noneOn]}>None</Text>)}
        {PRODUCT_BADGES.map((b) => opt(b.key, b.label, <BadgeTag badge={b.key} size={13} style={styles.tag} />))}
      </View>
    </Field>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    minWidth: 64, minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: PF.line, borderRadius: 10, backgroundColor: t.neutral[0],
  },
  optOn: { borderColor: PF.green, backgroundColor: PF.greenSoft },
  // The tag's own gap after it is for names; here it sits alone.
  tag: { paddingRight: 0 },
  none: { fontSize: 14, color: PF.muted, ...font(500) },
  noneOn: { color: PF.greenDark },
}));
