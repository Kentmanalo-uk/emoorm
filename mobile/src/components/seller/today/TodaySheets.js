import { useEffect, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { MinusIcon, PlusIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import Sheet, { SheetButton, SheetOption } from '../../Sheet';
import { momentLabel } from '../../../lib/availability';
import { DateTimeField, DateTimePanel } from './DateTimeField';

/*
 * Today's menu sheets (web/src/pages/SellerToday.jsx PhoneSheets and the
 * card's ⋯ menu, .stw-form in SellerToday.css): More time, Add more (how
 * many to sell), and the ⋯ menu. Posting, editing and posting again are
 * PostForm.js.
 */

/** A labelled field (.scm-field): the label above, the control under it. */
function Field({ label, style, children }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Footer({ onCancel, onGo, goLabel, busy }) {
  return (
    <>
      <SheetButton variant="seller" label="Cancel" onPress={onCancel} />
      <SheetButton variant="seller" primary label={goLabel} onPress={onGo} disabled={busy} />
    </>
  );
}

/* ── More time ────────────────────────────────────────────────────── */
export function ExtendSheet({
  extend, setExtend, busy, onSave, onClose,
}) {
  const [picking, setPicking] = useState(false);
  useEffect(() => { if (!extend) setPicking(false); }, [extend]);
  return (
    <Sheet
      variant="seller"
      open={Boolean(extend)}
      title="More time to order"
      onClose={onClose}
      footer={extend ? <Footer onCancel={onClose} onGo={onSave} goLabel="Save" busy={busy} /> : null}
    >
      {extend ? (
        <View style={styles.form}>
          <Text style={styles.hint}>Now: orders close {momentLabel(extend.window.ordersCloseAt)}.</Text>
          <Field label="Orders close">
            <DateTimeField value={extend.value} open={picking} onPress={() => setPicking((p) => !p)} accessibilityLabel="Orders close" />
          </Field>
          {picking ? (
            <DateTimePanel value={extend.value} onChange={(v) => setExtend((x) => ({ ...x, value: v }))} onDone={() => setPicking(false)} />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/* ── Add more: how many to sell in all ────────────────────────────── */
const ADD_PICKS = [5, 10, 20];

export function AddMoreSheet({
  adding, setAdding, busy, onSave, onClose,
}) {
  const w = adding?.window;
  const lessOff = adding ? adding.total <= adding.min : true;
  return (
    <Sheet
      variant="seller"
      open={Boolean(adding)}
      title="How many to sell"
      onClose={onClose}
      footer={adding ? <Footer onCancel={onClose} onGo={onSave} goLabel="Save" busy={busy} /> : null}
    >
      {adding ? (
        <View style={styles.form}>
          <Text style={styles.hint}>{w.product?.name}: {w.remaining ?? w.quantity} left now.</Text>
          <View style={styles.stepper} accessibilityLabel="How many in all">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="One less"
              disabled={lessOff}
              onPress={() => setAdding((a) => ({ ...a, total: Math.max(a.min, a.total - 1) }))}
              style={styles.stepBtn}
            >
              <MinusIcon size={22} weight="bold" color={lessOff ? t.neutral[300] : t.primary[700]} />
            </Pressable>
            <TextInput
              value={String(adding.total)}
              onChangeText={(v) => setAdding((a) => ({ ...a, total: Number(v.replace(/[^0-9]/g, '')) || 0 }))}
              onBlur={() => setAdding((a) => (a ? { ...a, total: Math.max(a.min, a.total) } : a))}
              keyboardType="number-pad"
              accessibilityLabel="How many in all"
              style={styles.stepInput}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="One more" onPress={() => setAdding((a) => ({ ...a, total: a.total + 1 }))} style={styles.stepBtn}>
              <PlusIcon size={22} weight="bold" color={t.primary[700]} />
            </Pressable>
          </View>
          <View style={styles.adds}>
            {ADD_PICKS.map((n) => (
              <Pressable key={n} accessibilityRole="button" onPress={() => setAdding((a) => ({ ...a, total: a.total + n }))} style={styles.add}>
                <Text style={styles.addText}>+{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ── ⋯ on a card ──────────────────────────────────────────────────── */
export function MoreSheet({ more, onExtend, onEnd, onClose }) {
  return (
    <Sheet variant="seller" open={Boolean(more)} title={more?.product?.name || 'More'} onClose={onClose}>
      {more ? (
        <View>
          <SheetOption variant="seller" label="More time" onPress={onExtend} />
          <SheetOption variant="seller" danger label="Stop taking orders" onPress={onEnd} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  // .stw-form
  form: { gap: 14, paddingBottom: 4 },
  // .scm-field
  field: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[600] },
  hint: { fontSize: 15, lineHeight: 22.5, ...font(400), color: t.neutral[700] },

  // .stw-stepper, .stw-adds
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  stepInput: {
    flex: 1, minWidth: 0, height: 60, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14,
    fontSize: 28, ...font(600), color: t.neutral[900], textAlign: 'center', backgroundColor: t.neutral[0],
  },
  adds: { flexDirection: 'row', gap: 8 },
  add: {
    flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  addText: { fontSize: 16, lineHeight: 22, ...font(500), color: t.neutral[800] },
}));
