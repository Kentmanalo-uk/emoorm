import { StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../theme';

/*
 * The product page's white panels (web ProductDetails.css .pdp-detail-card,
 * .pdp-section-head, .pdp-section-title, .pdp-section-count,
 * .pdp-section-body at phone width).
 */

/** "Reviews 2": the section title with its green count pill. */
export function SectionTitle({ children, count, style }) {
  return (
    <View style={[styles.title, style]}>
      <Text style={styles.titleText} accessibilityRole="header">{children}</Text>
      {count > 0 ? <View style={styles.count}><Text style={styles.countText}>{count}</Text></View> : null}
    </View>
  );
}

export function SectionHead({ children, style }) {
  return <View style={[styles.head, style]}>{children}</View>;
}

export function SectionBody({ children, style }) {
  return <View style={[styles.body, style]}>{children}</View>;
}

/** sectionRef: the page measures where the panel sits for its section tabs. */
export default function ProductSection({ children, style, sectionRef }) {
  return <View ref={sectionRef} collapsable={false} style={[styles.card, style]}>{children}</View>;
}

export const sectionStyles = StyleSheet.create({
  card: { marginTop: 8, backgroundColor: '#fff' },
});

const styles = StyleSheet.create({
  card: { marginTop: 8, backgroundColor: '#fff' },
  // The title sits in a 24px line box on the website (the head is a block).
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, paddingHorizontal: 16,
    minHeight: 38,
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { fontSize: 16, lineHeight: 18.4, ...font(500), color: t.neutral[900] },
  count: { paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.primary[50] },
  countText: { fontSize: 11, lineHeight: 12.65, ...font(500), color: t.primary[700], textAlign: 'center' },
  body: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 14 },
});
