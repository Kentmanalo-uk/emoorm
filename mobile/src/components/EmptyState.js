import { cloneElement, isValidElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../theme';
import EmptyArt from './EmptyArt';
import WeightWaveText from './WeightWaveText';

/**
 * The app's one "nothing here yet" look, everywhere (the signed-out Messages /
 * Notifications / Cart page, web/src/components/LoginGate.jsx): a picture, a
 * title, one short line, and a green pill button. Centred, sitting a little
 * above the middle so it reads as centred on the screen.
 *
 * art:      an EmptyArt scene name (preferred)
 * icon:     a Phosphor icon component or element, used when there is no `art`
 * text:     the line under the title (`message` also works)
 * actions:  [{ label, onPress, variant?: 'primary' | 'outline', icon?, wave? }]
 *           (wave: the label in the Start selling sticker's bold wave)
 *           (`actionLabel` + `onAction` also work for one primary action)
 * page:     fills the space it is given (give it flex: 1, or a list's
 *           contentContainerStyle flexGrow: 1) and centres in it
 * compact:  inside a card or section: a smaller picture and less room
 * artSize:  the EmptyArt size (default 112, compact 72)
 * inset / flat: older names: inset reads as compact; flat is the default now
 *
 * Pieces that cannot use the component (a custom layout) take the same look
 * from `emptyStyles` and `EmptyActions`.
 */
export default function EmptyState({
  art, icon, title, text, message, actions, actionLabel, onAction,
  page = false, compact = false, inset = false, artSize, style, children,
}) {
  const small = compact || inset;
  const body = text ?? message;
  const list = (actions || (actionLabel && onAction ? [{ label: actionLabel, onPress: onAction }] : [])).filter(Boolean);
  const iconProps = { size: small ? 56 : 80, weight: 'fill', color: t.primary[200] };
  let iconNode = null;
  if (!art && icon) {
    iconNode = isValidElement(icon) ? cloneElement(icon, iconProps) : (() => { const Icon = icon; return <Icon {...iconProps} />; })();
  }

  return (
    <View style={[emptyStyles.wrap, page && emptyStyles.page, small && emptyStyles.compact, style]}>
      {art ? <EmptyArt name={art} size={artSize ?? (small ? 72 : 112)} style={emptyStyles.art} /> : null}
      {iconNode ? <View style={emptyStyles.art}>{iconNode}</View> : null}
      {title ? <Text style={[emptyStyles.title, small && emptyStyles.titleSmall]} accessibilityRole="header">{title}</Text> : null}
      {body ? <Text style={[emptyStyles.body, small && emptyStyles.bodySmall]}>{body}</Text> : null}
      {children}
      <EmptyActions actions={list} />
    </View>
  );
}

/** The pill buttons under an empty state: green, or white with a hairline. */
export function EmptyActions({ actions }) {
  if (!actions?.length) return null;
  return (
    <View style={emptyStyles.actions}>
      {actions.map(({ label, onPress, variant = 'primary', icon: ActionIcon, wave }) => {
        const outline = variant === 'outline';
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
              emptyStyles.btn,
              outline ? emptyStyles.btnOutline : emptyStyles.btnPrimary,
              pressed && (outline ? emptyStyles.btnOutlinePressed : emptyStyles.btnPrimaryPressed),
            ]}
          >
            {ActionIcon ? <ActionIcon size={18} color={outline ? t.neutral[800] : '#fff'} /> : null}
            {wave
              ? <WeightWaveText text={label} style={[emptyStyles.btnText, outline && emptyStyles.btnTextOutline]} />
              : <Text style={[emptyStyles.btnText, outline && emptyStyles.btnTextOutline]}>{label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

// The signed-out page's measures (InboxLoginGate / CartLoginGate).
export const emptyStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 32, paddingBottom: 40, paddingHorizontal: 24 },
  // A whole page: centred in the space, lifted a little (more room below).
  page: { flex: 1, paddingTop: 24, paddingBottom: 120 },
  compact: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 16 },
  art: { marginBottom: 18 },
  title: { marginBottom: 6, fontSize: 18, lineHeight: 21.6, color: t.neutral[900], textAlign: 'center', ...font(500) },
  titleSmall: { fontSize: 16, lineHeight: 20 },
  body: { maxWidth: 290, fontSize: 14, lineHeight: 21, color: t.neutral[500], textAlign: 'center', ...font(400) },
  bodySmall: { fontSize: 13.5, lineHeight: 19.5 },
  actions: { alignItems: 'center', gap: 10, marginTop: 20 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minWidth: 140, height: 42, paddingHorizontal: 28, borderRadius: 999, borderWidth: 1,
  },
  btnPrimary: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  btnPrimaryPressed: { borderColor: t.primary[700], backgroundColor: t.primary[700] },
  btnOutline: { borderColor: t.neutral[300], backgroundColor: '#fff' },
  btnOutlinePressed: { backgroundColor: t.neutral[50] },
  btnText: { fontSize: 15, lineHeight: 18, color: '#fff', ...font(500) },
  btnTextOutline: { color: t.neutral[800] },
});
