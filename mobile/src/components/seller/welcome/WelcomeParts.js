import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowRightIcon, CheckCircleIcon, CheckIcon, UploadSimpleIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { uploadImage } from '../../../lib/upload';
import { toast } from '../../../lib/toast';

/*
 * The small pieces of the guided setup's screens (web/src/pages/
 * SellerWelcome.jsx + SellerWelcome.css, phones): the buttons (.sw-btn),
 * radio cards (.sw-choice), pills (.sw-pill, .sw-town), fields (.sw-field),
 * the photo picker (.sw-photo), the switch and link rows, the ticked points,
 * the "done" line, notes and links, the Done badge and the spinner.
 * Line heights are the website's body 1.6 unless a rule sets its own.
 */

/** .sw-btn: the green pill; ghost = white with a border; text = no fill. */
export function WelcomeButton({ label, onPress, disabled = false, kind = 'primary', arrow = false }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        kind === 'ghost' && styles.btnGhost,
        kind === 'text' && styles.btnText,
        pressed && primary && styles.btnPressed,
        pressed && kind === 'text' && styles.btnTextPressed,
        disabled && styles.btnOff,
      ]}
    >
      <Text style={[styles.btnLabel, kind === 'ghost' && styles.btnLabelGhost, kind === 'text' && styles.btnLabelText]} numberOfLines={1}>
        {label}
      </Text>
      {arrow ? <ArrowRightIcon size={18} color="#fff" /> : null}
    </Pressable>
  );
}

/** .sw-choice: a radio card; `icon` (the mode's picture) or the round radio. */
export function WelcomeChoice({ on, label, text, Icon, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.choice, on && styles.choiceOn]}
    >
      {Icon ? <Icon size={22} color={t.primary[600]} /> : <View style={[styles.radio, on && styles.radioOn]} />}
      <View style={styles.flex}>
        <Text style={styles.strong}>{label}</Text>
        <Text style={styles.small}>{text}</Text>
      </View>
    </Pressable>
  );
}

/** .sw-pill / .sw-town: one choice from a short list (a tick when chosen). */
export function WelcomePill({ on, label, onPress, town = false, role = 'radio' }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { checked: on } : { selected: on }}
      onPress={onPress}
      style={[styles.pill, town && styles.town, on && styles.pillOn]}
    >
      {on && !town ? <CheckIcon size={14} weight="bold" color="#fff" /> : null}
      <Text style={[styles.pillText, town && styles.townText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** .sw-field: a label (with an optional "optional"), then the input. */
export function WelcomeField({ label, optional = false, counter, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.fieldEm}> optional</Text> : null}
      </Text>
      {children}
      {counter ? <Text style={styles.counter}>{counter}</Text> : null}
    </View>
  );
}

/** The field's input; `rows` makes it a textarea of that many lines. */
export function WelcomeInput({ rows, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      multiline={Boolean(rows)}
      textAlignVertical={rows ? 'top' : 'center'}
      placeholderTextColor={t.neutral[400]}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[
        styles.input,
        rows ? { minHeight: rows * 25.6 + 27, lineHeight: 25.6 } : styles.inputLine,
        focused && styles.inputFocus,
        style,
      ]}
    />
  );
}

/** .sw-money: ₱ and the fee, in one 200 px box. */
export function WelcomeMoney({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.money}>
      <Text style={styles.moneySign}>₱</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.neutral[400]}
        keyboardType="decimal-pad"
        style={[styles.input, styles.inputLine, styles.moneyInput]}
      />
    </View>
  );
}

/** .sw-photo: the picture, or a dashed box to choose one, and its label. */
export function WelcomePhoto({ label, hint, value, onChange, wide = false }) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    setBusy(true);
    try {
      const res = await uploadImage(result.assets[0]);
      onChange(res.url);
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.photo}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `Change ${label}` : `Add ${label}`}
        disabled={busy}
        onPress={pick}
        style={[styles.photoBox, wide && styles.photoWide, value && styles.photoFilled]}
      >
        {value ? <Image source={{ uri: resolveImg(value) }} style={styles.photoImg} resizeMode="cover" /> : (
          <View style={styles.photoEmpty}>
            <UploadSimpleIcon size={22} color={t.neutral[500]} />
            <Text style={styles.photoEmptyText}>{busy ? 'Uploading…' : 'Add photo'}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.flex}>
        <Text style={styles.strong}>{label}</Text>
        {value
          ? <Text style={styles.small}><Text style={styles.link} onPress={pick} accessibilityRole="button">Change</Text></Text>
          : <Text style={styles.small}>{hint}</Text>}
      </View>
    </View>
  );
}

/** .sw-switch: words on the left, the track on the right. */
export function WelcomeSwitch({ on, label, text, onPress }) {
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [on, x]);
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.strong}>{label}</Text>
        <Text style={styles.small}>{text}</Text>
      </View>
      <View style={[styles.track, on && styles.trackOn]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }]} />
      </View>
    </Pressable>
  );
}

/** .sw-row-link: a row that opens another page. */
export function WelcomeRowLink({ label, text, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.strong}>{label}</Text>
        <Text style={styles.small}>{text}</Text>
      </View>
      <ArrowRightIcon size={18} color={t.neutral[600]} />
    </Pressable>
  );
}

/** .sw-points: short lines, each with a green icon. */
export function WelcomePoints({ items }) {
  return (
    <View style={styles.points}>
      {items.map(({ Icon, text }) => (
        <View key={text} style={styles.point}>
          <Icon size={18} color={t.primary[600]} />
          <Text style={styles.pointText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

/** .sw-done: a green tick and what is already done. */
export function WelcomeDone({ children }) {
  return (
    <View style={styles.done}>
      <CheckCircleIcon size={20} weight="fill" color={t.primary[700]} />
      <Text style={styles.doneText}>{children}</Text>
    </View>
  );
}

/** .sw-note (warn = the amber warning). Children may hold a WelcomeInlineLink. */
export function WelcomeNote({ warn = false, children }) {
  return <Text style={[styles.note, warn && styles.noteWarn]}>{children}</Text>;
}

/** .sw-link inside a line of text. */
export function WelcomeInlineLink({ label, onPress }) {
  return <Text accessibilityRole="button" onPress={onPress} style={styles.link}>{label}</Text>;
}

/** .sw-link on its own (a button: its words centred). */
export function WelcomeLink({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkBtn}>
      <Text style={[styles.link, styles.linkAlone]}>{label}</Text>
    </Pressable>
  );
}

/** .sw-sub: a small heading between groups. */
export function WelcomeSub({ children }) {
  return <Text style={styles.sub}>{children}</Text>;
}

/** .sw-badge: "Done" over a step that is already done. */
export function WelcomeBadge() {
  return (
    <View style={styles.badge}>
      <CheckIcon size={12} weight="bold" color={t.primary[700]} />
      <Text style={styles.badgeText}>Done</Text>
    </View>
  );
}

/** .sw-later-item: a step left for later, to go back to. */
export function WelcomeLaterItem({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.laterItem}>
      <Text style={styles.laterText}>{label}</Text>
      <ArrowRightIcon size={14} color={t.neutral[700]} />
    </Pressable>
  );
}

/** .sw-spinner: a 32 px ring, its top in green (still when motion is reduced). */
export function WelcomeSpinner({ still = false }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(Animated.timing(spin, {
      toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [spin, still]);
  if (still) return <ActivityIndicator size="small" color={t.primary[600]} />;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View accessibilityLabel="Loading" style={[styles.spinner, { transform: [{ rotate }] }]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: t.primary[600],
  },
  btnPressed: { backgroundColor: t.primary[700] },
  btnGhost: { borderWidth: 1.5, borderColor: t.neutral[200], backgroundColor: t.neutral[0] },
  btnText: { minHeight: 44, backgroundColor: 'transparent' },
  btnTextPressed: { backgroundColor: t.neutral[100] },
  btnOff: { opacity: 0.5 },
  btnLabel: { fontSize: 16, lineHeight: 25.6, color: '#fff', ...font(500) },
  btnLabelGhost: { color: t.neutral[800] },
  btnLabelText: { color: t.neutral[600] },

  strong: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  small: { marginTop: 1, fontSize: 13, lineHeight: 18.2, color: t.neutral[500], ...font(400) },

  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: t.neutral[200],
    borderRadius: 14,
    backgroundColor: t.neutral[0],
  },
  choiceOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.neutral[300] },
  radioOn: { borderWidth: 6, borderColor: t.primary[600] },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: t.neutral[200],
    borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  town: { minHeight: 34, paddingHorizontal: 12 },
  pillOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  pillText: { fontSize: 14.5, lineHeight: 23.2, color: t.neutral[800], ...font(400) },
  townText: { fontSize: 13.5, lineHeight: 21.6 },
  pillTextOn: { color: '#fff' },

  field: { gap: 6 },
  fieldLabel: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700], ...font(500) },
  fieldEm: { color: t.neutral[400], ...font(400) },
  counter: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 19.2, color: t.neutral[400], ...font(400) },
  input: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: t.neutral[200],
    borderRadius: 12,
    backgroundColor: t.neutral[0],
    color: t.neutral[900],
    fontSize: 16,
    ...font(400),
  },
  // One line: the website's 25.6 px line, 12 px above and below, the border.
  inputLine: { height: 53 },
  inputFocus: {
    borderColor: t.primary[600],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 3, color: t.primary[100] }],
  },

  money: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    borderWidth: 1.5,
    borderColor: t.neutral[200],
    borderRadius: 12,
  },
  moneySign: { paddingLeft: 14, fontSize: 15, lineHeight: 24, color: t.neutral[500], ...font(400) },
  moneyInput: { flex: 1, width: undefined, height: 50, borderWidth: 0, backgroundColor: 'transparent' },

  photo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 92,
    height: 92,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.neutral[300],
    borderRadius: 18,
    backgroundColor: t.neutral[50],
  },
  photoWide: { width: 164 },
  photoFilled: { borderWidth: 0 },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', gap: 4 },
  photoEmptyText: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: t.neutral[200],
    borderRadius: 14,
    backgroundColor: t.neutral[0],
  },
  track: { width: 46, height: 28, borderRadius: 999, backgroundColor: t.neutral[300] },
  trackOn: { backgroundColor: t.primary[600] },
  knob: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(15, 23, 42, 0.25)' }],
  },

  points: { gap: 10 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 24, color: t.neutral[700], ...font(400) },

  done: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { flex: 1, fontSize: 15, lineHeight: 24, color: t.primary[700], ...font(500) },

  note: { fontSize: 13.5, lineHeight: 20.25, color: t.neutral[500], ...font(400) },
  noteWarn: { color: '#b45309' },
  link: { color: t.primary[700], textDecorationLine: 'underline', ...font(500) },
  linkBtn: { alignSelf: 'stretch', alignItems: 'center' },
  linkAlone: { fontSize: 15, lineHeight: 24 },

  sub: { marginTop: 6, fontSize: 14, lineHeight: 22.4, color: t.neutral[700], ...font(500) },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginBottom: 8,
    paddingVertical: 2,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: t.primary[50],
  },
  badgeText: { fontSize: 12, lineHeight: 19.2, color: t.primary[700], ...font(500) },

  laterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  laterText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[700], ...font(400) },

  spinner: {
    width: 32,
    height: 32,
    borderWidth: 3,
    borderColor: t.primary[100],
    borderTopColor: t.primary[600],
    borderRadius: 16,
  },
});
