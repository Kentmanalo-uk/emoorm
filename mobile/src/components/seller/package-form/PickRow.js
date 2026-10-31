import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckIcon, MinusIcon, PlusIcon, TrashIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { MAX_EACH, P, firstImage, peso, priceOf } from './pkfLib';
import { Thumb } from './PkfBits';

/*
 * Step 1's rows (web PackageForm.jsx PickRow / Stepper, PackageForm.css
 * .pkf-pick, .pkf-check, .pkf-stepper, ≤768px): one of the shop's products,
 * tap to put it in (or take it out), then − 2 + for how many.
 */

export default function PickRow({ product, line, tag, warning, first, onToggle, onQuantity }) {
  const on = !!line;
  return (
    <View style={[styles.pick, !first && styles.pickLine, on && styles.pickOn, !!warning && styles.pickWarn]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        onPress={onToggle}
        style={styles.main}
      >
        <View style={[styles.check, on && styles.checkOn]}>
          {on ? <CheckIcon size={13} weight="bold" color="#fff" /> : null}
        </View>
        <Thumb src={firstImage(product)} />
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <View style={styles.small}>
            <Text style={styles.price}>{peso(priceOf(product))} each</Text>
            {tag ? (
              <View style={[styles.tag, on && styles.tagOn]}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ) : null}
          </View>
          {warning ? <Text style={styles.warn}>{warning}</Text> : null}
        </View>
      </Pressable>
      {on ? <Stepper value={line.quantity} onChange={onQuantity} label={product.name} /> : null}
    </View>
  );
}

function Stepper({ value, onChange, label }) {
  // What is being typed: a cleared box waits for a number.
  const [draft, setDraft] = useState(null);
  const change = (n) => {
    setDraft(null);
    onChange(n);
  };
  const remove = value <= 1;
  const atMax = value >= MAX_EACH;
  return (
    <View style={styles.stepper} accessibilityLabel={`How many ${label}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={remove ? `Take ${label} out` : 'One less'}
        onPress={() => change(value - 1)}
        style={styles.stepBtn}
      >
        {remove
          ? <TrashIcon size={15} color={P.danger} />
          : <MinusIcon size={15} weight="bold" color={t.neutral[800]} />}
      </Pressable>
      <TextInput
        value={draft ?? String(value)}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        accessibilityLabel={`How many ${label}`}
        onChangeText={(raw) => {
          const n = parseInt(raw, 10);
          if (raw === '' || !Number.isFinite(n)) {
            setDraft('');
            return;
          }
          change(Math.min(MAX_EACH, Math.max(1, n)));
        }}
        onBlur={() => setDraft(null)}
        style={styles.stepInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="One more"
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        onPress={() => change(value + 1)}
        style={styles.stepBtn}
      >
        <PlusIcon size={15} weight="bold" color={atMax ? t.neutral[300] : t.neutral[800]} />
      </Pressable>
    </View>
  );
}

/** A grey row that glows while the shop's products load (.pkf-pick--loading). */
export function PickLoading({ first }) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [glow]);
  return (
    <View style={[styles.loading, !first && styles.pickLine]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.loadingGlow, { opacity: glow }]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 4, paddingRight: 8, backgroundColor: t.neutral[0],
  },
  pickLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  pickOn: { backgroundColor: P.greenSoft },
  pickWarn: { backgroundColor: t.warning[50] },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10 },
  check: {
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.neutral[300], borderRadius: 7, backgroundColor: t.neutral[0],
  },
  checkOn: { borderColor: P.green, backgroundColor: P.green },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 14.5, lineHeight: 18.85, color: P.ink, ...font(500) },
  small: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  price: { fontSize: 12.5, lineHeight: 20, color: P.muted, ...font(400) },
  tag: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: 999, backgroundColor: t.neutral[100] },
  tagOn: { backgroundColor: t.neutral[0] },
  tagText: { fontSize: 11.5, lineHeight: 18.4, color: t.neutral[600], ...font(500) },
  warn: { fontSize: 12, lineHeight: 19.2, color: t.warning[700], ...font(500) },

  stepper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: P.line, borderRadius: 999, backgroundColor: t.neutral[0],
  },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepInput: {
    width: 34, height: 34, padding: 0, textAlign: 'center', color: P.ink, fontSize: 16, ...font(600),
  },

  loading: { height: 60, backgroundColor: t.neutral[50], overflow: 'hidden' },
  loadingGlow: { backgroundColor: t.neutral[100] },
}));
