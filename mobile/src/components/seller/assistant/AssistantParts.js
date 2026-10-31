import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { ArrowClockwiseIcon, CaretRightIcon, PaperPlaneRightIcon } from '../../../lib/icons';
import MoormyFace from '../../inbox/MoormyFace';
import Glass from '../../Glass';
import { font, ink, t, themed } from '../../../theme';

/*
 * The pieces of Ate Moormy's seller page (web/src/pages/SellerAssistant.jsx
 * + SellerAssistant.css, `.sa-page.is-phone`): her round face, the English |
 * Tagalog switch, the question chips, the links an answer points to, the
 * "Try again" button, the typing dots and the question box.
 */

const native = Platform.OS !== 'web';

/** .sa-avatar: her face, round. */
export function Avatar({ size = 32, style }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, styles.avatar, style]}>
      <MoormyFace size={size} />
    </View>
  );
}

/** .sa-lang: English | Tagalog, the language she answers in. */
export function LangSwitch({ lang, onChange, disabled, label }) {
  return (
    <View style={styles.lang} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[['en', 'English'], ['tl', 'Tagalog']].map(([code, name]) => {
        const on = lang === code;
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(code)}
            style={[styles.langBtn, on && styles.langBtnOn]}
          >
            <Text style={[styles.langText, on && styles.langTextOn]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** .sa-chips: questions to tap. */
export function Chips({ list, disabled, onPick }) {
  return (
    <View style={styles.chips}>
      {list.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onPick(p)}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, disabled && styles.chipOff]}
        >
          {({ pressed }) => <Text style={[styles.chipText, pressed && styles.chipTextPressed]}>{p.question}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

/** .sa-links: the pages an answer is about. */
export function LinkPills({ links, onOpen }) {
  return (
    <View style={styles.links}>
      {links.map((l) => (
        <Pressable
          key={`${l.to}${l.label}`}
          accessibilityRole="link"
          onPress={() => onOpen(l.to)}
          style={({ pressed }) => [styles.link, pressed && { backgroundColor: t.primary[100] }]}
        >
          <Text style={styles.linkText}>{l.label}</Text>
          <CaretRightIcon size={14} weight="bold" color={t.primary[700]} />
        </Pressable>
      ))}
    </View>
  );
}

/** .sa-retry: an outlined pill in the error's red. */
export function RetryButton({ label, onPress, disabled }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={styles.retry}>
      <ArrowClockwiseIcon size={14} color={t.danger[700]} />
      <Text style={styles.retryText}>{label}</Text>
    </Pressable>
  );
}

/** .sa-typing: three grey dots that rise in turn while she answers. */
export function TypingDots({ label, still }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  const dots = [a, b, c];
  useEffect(() => {
    if (still) return undefined;
    // sa-dot: 1.2s; up at 30%, back down by 60%, then rest. Delays 0, 0.15, 0.3s.
    const loops = [a, b, c].map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 150),
      Animated.timing(d, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
      Animated.timing(d, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
      Animated.delay(480 - i * 150),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, a, b, c]);
  return (
    <View style={[styles.bubble, styles.typing]} accessibilityLabel={label}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, {
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }]}
        />
      ))}
    </View>
  );
}

// .sa-composer on phones: white, a hairline above.
/* A function, not a table: this is handed to a component whole, and
   React Native freezes the style it is given. A fresh object each time
   keeps the colours of the palette in use. */
const composerFallback = () => ({
  backgroundColor: t.neutral[0],
  borderTopWidth: 1,
  borderTopColor: t.neutral[200],
});

/**
 * .sa-composer: fixed to the bottom of the screen, floating in Glass (iOS 26
 * Liquid Glass; elsewhere the website's white bar). The box grows with the
 * question up to 120px; Enter sends, as on the website.
 */
export function Composer({
  value, onChange, onSend, placeholder, canSend, disabled, bottomInset, onHeight,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Glass
      fallbackStyle={composerFallback()}
      style={[styles.composer, { paddingBottom: 8 + bottomInset }]}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
    >
      <TextInput
        multiline
        value={value}
        onChangeText={onChange}
        maxLength={500}
        placeholder={placeholder}
        placeholderTextColor={t.neutral[500]}
        accessibilityLabel={placeholder}
        editable={!disabled}
        enterKeyHint="send"
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={() => { if (canSend) onSend(); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocus]}
        underlineColorAndroid="transparent"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        disabled={!canSend}
        onPress={onSend}
        style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && canSend && { backgroundColor: t.primary[700] }]}
      >
        <PaperPlaneRightIcon size={20} weight="fill" color={canSend ? '#fff' : t.neutral[400]} />
      </Pressable>
    </Glass>
  );
}

const styles = themed(() => StyleSheet.create({
  avatar: { overflow: 'hidden', flexShrink: 0 },

  lang: {
    flexDirection: 'row', alignSelf: 'center', marginTop: 10, padding: 3, borderRadius: 999, backgroundColor: t.neutral[200],
  },
  langBtn: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999 },
  langBtnOn: {
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: ink(0.12) }],
  },
  langText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[600], ...font(500) },
  langTextOn: { color: t.primary[700] },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  chipPressed: { borderColor: t.primary[600] },
  chipOff: { opacity: 0.55 },
  chipText: { fontSize: 14, lineHeight: 18.9, color: t.neutral[800], ...font(400) },
  chipTextPressed: { color: t.primary[700] },

  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.primary[50],
  },
  linkText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(500) },

  retry: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.danger[700], borderRadius: 999,
  },
  retryText: { fontSize: 13, lineHeight: 19.5, color: t.danger[700], ...font(500) },

  bubble: {
    paddingVertical: 10, paddingHorizontal: 14, backgroundColor: t.neutral[100],
    borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 6,
  },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14, paddingHorizontal: 16 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.neutral[400] },

  composer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingHorizontal: 12,
  },
  input: {
    flex: 1, minWidth: 0, minHeight: 44, maxHeight: 120, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 20, backgroundColor: t.neutral[0],
    color: t.neutral[900], fontSize: 16, lineHeight: 22.4, ...font(400),
  },
  inputFocus: { borderColor: t.primary[600] },
  send: {
    flexShrink: 0, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  sendOff: { backgroundColor: t.neutral[200] },
}));

export const bubbleStyle = styles.bubble;
