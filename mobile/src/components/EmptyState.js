import { cloneElement, isValidElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../theme';
import EmptyArt from './EmptyArt';

/**
 * The shared "nothing here yet" card (web/src/components/ui/EmptyState.jsx):
 * a large centred white card with a picture, a title, one line of text and
 * up to two actions.
 *
 * art:     an EmptyArt scene name (preferred)
 * icon:    a Phosphor icon component or element, used when there is no `art`
 *          (drawn as the website does: 80, filled, light green)
 * text:    the line under the title (`message` also works)
 * actions: [{ label, onPress, variant?: 'primary' | 'outline', icon? }]
 *          (`actionLabel` + `onAction` also work for one primary action)
 * inset:   inside a card or list that is already white: no card, less room
 * flat:    on the website's flat phone pages (phone-app.css): square corners
 */
export default function EmptyState({
  art, icon, title, text, message, actions, actionLabel, onAction, inset = false, flat = false, style,
}) {
  const body = text ?? message;
  const list = (actions || (actionLabel && onAction ? [{ label: actionLabel, onPress: onAction }] : [])).filter(Boolean);
  const iconProps = { size: 80, weight: 'fill', color: t.primary[200] };
  let iconNode = null;
  if (!art && icon) {
    iconNode = isValidElement(icon) ? cloneElement(icon, iconProps) : (() => { const Icon = icon; return <Icon {...iconProps} />; })();
  }

  return (
    <View style={[styles.card, flat && styles.flat, inset && styles.inset, style]}>
      {art ? <EmptyArt name={art} size={112} style={styles.art} /> : null}
      {iconNode ? <View style={styles.icon}>{iconNode}</View> : null}
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {body ? <Text style={styles.text}>{body}</Text> : null}
      {list.length ? (
        <View style={styles.actions}>
          {list.map(({ label, onPress, variant = 'primary', icon: ActionIcon }) => {
            const outline = variant === 'outline';
            return (
              <Pressable key={label} accessibilityRole="button" onPress={onPress} style={[styles.btn, outline ? styles.btnOutline : styles.btnPrimary]}>
                {ActionIcon ? <ActionIcon size={18} color={outline ? t.neutral[800] : '#fff'} /> : null}
                <Text style={[styles.btnText, outline && styles.btnTextOutline]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 420,
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: t.neutral[0],
  },
  flat: { borderRadius: 0 },
  inset: { minHeight: 0, paddingVertical: 28, paddingHorizontal: 16, borderRadius: 0, backgroundColor: 'transparent' },
  art: { marginBottom: 16 },
  icon: { marginBottom: 20 },
  title: { marginBottom: 8, fontSize: 19, lineHeight: 24.7, ...font(500), color: t.neutral[800], textAlign: 'center' },
  text: { maxWidth: 300, fontSize: 14.5, lineHeight: 21.75, ...font(400), color: t.neutral[500], textAlign: 'center' },
  actions: { alignSelf: 'center', alignItems: 'stretch', gap: 10, width: '100%', maxWidth: 260, marginTop: 24 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 46, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1,
  },
  btnPrimary: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  btnOutline: { borderColor: t.neutral[300], backgroundColor: '#fff' },
  btnText: { fontSize: 15, lineHeight: 20, ...font(500), color: '#fff' },
  btnTextOutline: { color: t.neutral[800] },
});
