import { StyleSheet, Text, View } from 'react-native';
import { HammerIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';

/**
 * A stub page's body until its page is ported from the website.
 * <SellerPlaceholder source="web/src/pages/SellerOrders.jsx" />
 */
export default function SellerPlaceholder({ source, text = 'This page is on its way to the app.' }) {
  return (
    <View style={styles.box}>
      <HammerIcon size={44} weight="fill" color={t.primary[200]} />
      <Text style={styles.title}>Coming soon</Text>
      <Text style={styles.text}>{text}</Text>
      {source && __DEV__ ? <Text style={styles.source}>{source}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: 6, paddingVertical: 48, paddingHorizontal: 24 },
  title: { marginTop: 6, fontSize: 17, lineHeight: 22, color: t.neutral[900], ...font(500) },
  text: { fontSize: 14, lineHeight: 21, color: t.neutral[500], textAlign: 'center', ...font(400) },
  source: { fontSize: 12, lineHeight: 16, color: t.neutral[400], ...font(400) },
});
