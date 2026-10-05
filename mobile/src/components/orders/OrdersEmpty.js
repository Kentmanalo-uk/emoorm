import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../theme';
import EmptyArt from '../EmptyArt';

/**
 * The empty list of My Orders and Returns (.profile-section .empty-state on
 * phones): a full-width white band with the scene, a line, a hint and one
 * green button.
 */
export default function OrdersEmpty({
  art = 'orders', title, hint, button, onPress,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.box}>
        <EmptyArt name={art} size={96} />
        <Text style={styles.title}>{title}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {button ? (
          <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.btn, pressed && { backgroundColor: t.primary[700] }]}>
            <Text style={styles.btnText}>{button}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: -12, padding: 14, backgroundColor: t.neutral[0] },
  box: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 4 },
  title: { fontSize: 16, lineHeight: 25.6, ...font(500), color: t.neutral[700], textAlign: 'center' },
  hint: { fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[500], textAlign: 'center' },
  btn: {
    height: 44, marginTop: 8, paddingHorizontal: 22, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  btnText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: '#fff' },
});
