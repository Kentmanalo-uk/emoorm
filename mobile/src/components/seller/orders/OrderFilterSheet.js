import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarDotsIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CheckIcon,
} from '../../../lib/icons';
import Sheet, { SheetButton } from '../../Sheet';
import { font, t, themed } from '../../../theme';
import { PAYMENT_FILTERS } from './sellerOrderLib';

/*
 * Phones: "Filter orders" (web SellerOrders.jsx, the PhoneSheet behind the
 * sliders button in the search box): Date ordered (From / To) and Payment,
 * with Reset and Done. Every change applies at once, as on the website.
 *
 * The website's fields are a browser date input and its own Select (a list
 * of choices); here the date opens a month calendar under the two fields
 * and the payment field a list of choices under it, inside the same sheet.
 *
 * <OrderFilterSheet open from to payment onFrom onTo onPayment onReset onClose />
 * from / to: 'YYYY-MM-DD' or ''.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const two = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${two(m + 1)}-${two(d)}`;
const parse = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
/** "10/09/2026", as a date field shows its value. */
const shown = (value) => {
  const p = parse(value);
  return p ? `${two(p.m + 1)}/${two(p.d)}/${p.y}` : '';
};

/** A month to pick a day from; days outside min…max cannot be picked. */
function MonthCalendar({ value, min, max, onPick, onClear }) {
  const start = parse(value) || parse(max) || (() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  })();
  const [view, setView] = useState({ y: start.y, m: start.m });
  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const now = new Date();
  const today = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (n) => setView(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <View style={styles.cal}>
      <View style={styles.calHead}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shift(-1)} style={styles.calNav}>
          <CaretLeftIcon size={16} weight="bold" color={t.neutral[700]} />
        </Pressable>
        <Text style={styles.calTitle}>{MONTHS[view.m]} {view.y}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.calNav}>
          <CaretRightIcon size={16} weight="bold" color={t.neutral[700]} />
        </Pressable>
      </View>
      <View style={styles.calRow}>
        {WEEK.map((w) => <Text key={w} style={styles.calWeek}>{w}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={r} style={styles.calRow}>
          {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (!d) {
              // eslint-disable-next-line react/no-array-index-key
              return <View key={`e${i}`} style={styles.calCell} />;
            }
            const key = keyOf(view.y, view.m, d);
            const off = (min && key < min) || (max && key > max);
            const on = key === value;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: Boolean(off) }}
                disabled={Boolean(off)}
                onPress={() => onPick(key)}
                style={styles.calCell}
              >
                <View style={[styles.calDay, on && styles.calDayOn, !on && key === today && styles.calToday]}>
                  <Text style={[styles.calDayText, on && styles.calDayTextOn, off && styles.calDayOff]}>{d}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {value ? (
        <Pressable accessibilityRole="button" onPress={onClear} style={styles.calClear}>
          <Text style={styles.calClearText}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A field of the sheet (.scm-field input / .ui-select): white, 46 high, 12px corners. */
function FieldBox({
  text, placeholder, open, onPress, label, caret = false, date = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.input, open && styles.inputOpen]}
    >
      <Text style={[styles.inputText, !text && styles.inputPlaceholder]} numberOfLines={1}>{text || placeholder}</Text>
      {caret ? (
        <View style={open && styles.caretOpen}>
          <CaretDownIcon size={14} weight="bold" color={open ? t.primary[600] : t.neutral[500]} />
        </View>
      ) : null}
      {/* A date field's calendar mark, as the browser's date input shows it. */}
      {date ? <CalendarDotsIcon size={18} color={open ? t.primary[600] : t.neutral[900]} /> : null}
    </Pressable>
  );
}

export default function OrderFilterSheet({
  open, from, to, payment, onFrom, onTo, onPayment, onReset, onClose,
}) {
  // Which field has its picker open: 'from', 'to', 'payment' or none.
  const [picking, setPicking] = useState(null);
  const toggle = (name) => setPicking((cur) => (cur === name ? null : name));
  const payLabel = PAYMENT_FILTERS.find((p) => p.key === payment)?.label || 'Any payment';

  return (
    <Sheet
      open={open}
      variant="seller"
      title="Filter orders"
      onClose={() => { setPicking(null); onClose?.(); }}
      footer={(
        <>
          <SheetButton variant="seller" label="Reset" onPress={() => { setPicking(null); onReset?.(); }} />
          <SheetButton variant="seller" primary label="Done" onPress={() => { setPicking(null); onClose?.(); }} />
        </>
      )}
    >
      <Text style={styles.label}>Date ordered</Text>
      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>From</Text>
          <FieldBox label="From" text={shown(from)} placeholder="mm/dd/yyyy" date open={picking === 'from'} onPress={() => toggle('from')} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>To</Text>
          <FieldBox label="To" text={shown(to)} placeholder="mm/dd/yyyy" date open={picking === 'to'} onPress={() => toggle('to')} />
        </View>
      </View>
      {picking === 'from' ? (
        <MonthCalendar key="from" value={from} max={to || undefined} onPick={(v) => { onFrom(v); setPicking(null); }} onClear={() => { onFrom(''); setPicking(null); }} />
      ) : null}
      {picking === 'to' ? (
        <MonthCalendar key="to" value={to} min={from || undefined} onPick={(v) => { onTo(v); setPicking(null); }} onClear={() => { onTo(''); setPicking(null); }} />
      ) : null}

      <Text style={styles.label}>Payment</Text>
      <View style={styles.field}>
        <FieldBox label="Payment" text={payment ? payLabel : ''} placeholder="Any payment" caret open={picking === 'payment'} onPress={() => toggle('payment')} />
      </View>
      {picking === 'payment' ? (
        <View style={styles.list} accessibilityRole="radiogroup">
          {PAYMENT_FILTERS.map((p) => {
            const on = p.key === payment;
            return (
              <Pressable
                key={p.key || 'any'}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => { onPayment(p.key); setPicking(null); }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Text style={[styles.optionText, on && styles.optionOn]}>{p.label}</Text>
                {on ? <CheckIcon size={16} weight="bold" color={t.primary[600]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  // .scm-sheet-label
  label: { marginTop: 14, marginBottom: 8, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  fieldRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },
  input: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  inputOpen: { borderColor: t.primary[600] },
  inputText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20.8, ...font(400), color: t.neutral[900] },
  inputPlaceholder: { color: t.neutral[500] },
  caretOpen: { transform: [{ rotate: '180deg' }] },

  list: { marginTop: 8, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, overflow: 'hidden' },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  optionPressed: { backgroundColor: t.neutral[50] },
  optionText: { flex: 1, fontSize: 15, lineHeight: 22, ...font(400), color: t.neutral[800] },
  optionOn: { ...font(500), color: t.primary[700] },

  cal: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calNav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  calTitle: { fontSize: 15, lineHeight: 22, ...font(500), color: t.neutral[900] },
  calRow: { flexDirection: 'row' },
  calWeek: { flex: 1, textAlign: 'center', paddingVertical: 4, fontSize: 12, lineHeight: 18, ...font(500), color: t.neutral[500] },
  calCell: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  calDay: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calDayOn: { backgroundColor: t.primary[600] },
  calToday: { borderWidth: 1, borderColor: t.primary[300] },
  calDayText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[800] },
  calDayTextOn: { ...font(600), color: t.onBrand },
  calDayOff: { color: t.neutral[300] },
  calClear: { alignSelf: 'flex-end', marginTop: 4, paddingVertical: 6, paddingHorizontal: 10 },
  calClearText: { fontSize: 13, lineHeight: 20, ...font(600), color: t.danger[600] },
}));
