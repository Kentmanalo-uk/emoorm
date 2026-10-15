import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import Sheet from '../../Sheet';
import { font, t } from '../../../theme';
import { MONTHS, ymd } from './format';

/*
 * The period picker of Analytics and Finance (web/src/components/analytics/
 * DateRangePicker.jsx) as Seller Center phones show it (SellerMobile.css,
 * SellerPhoneFit.css): Today / Week / Month / Year / Custom as five equal
 * chips on one row; Custom opens a row with two dates and Apply. The
 * website's date fields are the browser's own; here each opens a month
 * calendar in a sheet.
 */

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const rangeFor = (preset) => {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'week': {
      const day = now.getDay(); // Sun = 0
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      return { from: startOfDay(monday).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: endOfDay(now).toISOString() };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: endOfDay(now).toISOString() };
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: now.toISOString() };
    case '90d':
      return { from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: now.toISOString() };
    default:
      return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() };
  }
};

/** The page's first period: this month so far. */
export const defaultMonth = () => ({ preset: 'month', ...rangeFor('month') });

// Phones show the short words, so all five fit on one row.
const PRESETS = [
  { key: 'today', short: 'Today' },
  { key: 'week', short: 'Week' },
  { key: 'month', short: 'Month' },
  { key: 'year', short: 'Year' },
];

/** "2026-10-09" → a local Date at midnight. */
const parseDay = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

/** How the browser's date field shows a day: 10/09/2026. */
const fieldText = (s) => {
  const d = parseDay(s);
  if (!d) return 'mm/dd/yyyy';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

export default function DateRangePicker({ value, onChange, showCustom = true }) {
  const active = value?.preset || 'month';
  const [customOpen, setCustomOpen] = useState(active === 'custom');
  // The picker's ISO strings are UTC; the fields hold local calendar days.
  const [customFrom, setCustomFrom] = useState(value?.from ? ymd(value.from) : '');
  const [customTo, setCustomTo] = useState(value?.to ? ymd(value.to) : '');
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null

  const pick = (preset) => {
    setCustomOpen(false);
    onChange({ preset, ...rangeFor(preset) });
  };

  const applyCustom = () => {
    const from = parseDay(customFrom);
    const to = parseDay(customTo);
    if (!from || !to) return;
    onChange({ preset: 'custom', from: from.toISOString(), to: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString() });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Date range">
        {PRESETS.map((p) => (
          <Chip key={p.key} label={p.short} active={active === p.key} onPress={() => pick(p.key)} />
        ))}
        {showCustom ? <Chip label="Custom" active={active === 'custom'} onPress={() => setCustomOpen((v) => !v)} /> : null}
      </View>

      {showCustom && customOpen ? (
        <View style={styles.custom}>
          <DateField value={customFrom} label="From" onPress={() => setPicking('from')} />
          <Text style={styles.sep}>to</Text>
          <DateField value={customTo} label="To" onPress={() => setPicking('to')} />
          <Pressable
            accessibilityRole="button"
            onPress={applyCustom}
            disabled={!customFrom || !customTo}
            style={({ pressed }) => [styles.apply, pressed && styles.applyPressed, (!customFrom || !customTo) && styles.off]}
          >
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      ) : null}

      <CalendarSheet
        open={Boolean(picking)}
        title={picking === 'to' ? 'To' : 'From'}
        value={picking === 'to' ? customTo : customFrom}
        onClose={() => setPicking(null)}
        onPick={(day) => {
          if (picking === 'to') setCustomTo(day);
          else setCustomFrom(day);
          setPicking(null);
        }}
      />
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipOn]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function DateField({ value, label, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'not set'}`} onPress={onPress} style={styles.field}>
      <Text style={[styles.fieldText, !value && styles.fieldEmpty]} numberOfLines={1}>{fieldText(value)}</Text>
    </Pressable>
  );
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** A month to pick one day from (the browser's date field, as a sheet). */
function CalendarSheet({ open, title, value, onClose, onPick }) {
  const initial = parseDay(value) || new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [lastOpen, setLastOpen] = useState(open);
  // Reopening starts at the chosen day's month.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
  }

  const cells = useMemo(() => {
    const first = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const list = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d += 1) list.push(d);
    while (list.length % 7) list.push(null);
    return list;
  }, [month]);

  const today = ymd(new Date());
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <Sheet variant="seller" open={open} title={title} onClose={onClose}>
      <View style={styles.calHead}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shift(-1)} style={styles.calNav}>
          <CaretLeftIcon size={18} weight="bold" color={t.neutral[700]} />
        </Pressable>
        <Text style={styles.calMonth}>{`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.calNav}>
          <CaretRightIcon size={18} weight="bold" color={t.neutral[700]} />
        </Pressable>
      </View>
      <View style={styles.calGrid}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.calCell}><Text style={styles.calWeekday}>{w}</Text></View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.calCell} />;
          const key = ymd(new Date(month.getFullYear(), month.getMonth(), d));
          const on = key === value;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onPick(key)} style={styles.calCell}>
              <View style={[styles.calDay, on && styles.calDayOn]}>
                <Text style={[styles.calDayText, key === today && styles.calToday, on && styles.calDayTextOn]}>{d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // .an-daterange-wrap: the whole row, then the custom dates under it.
  wrap: { width: '100%', gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  // .an-daterange-btn on Seller Center phones: five equal chips.
  chip: {
    flex: 1, minWidth: 0, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 2,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  chipOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  chipText: { fontSize: 13, lineHeight: 15.6, textAlign: 'center', color: t.neutral[700], ...font(500) },
  chipTextOn: { color: t.neutral[0] },

  // .an-daterange-custom
  custom: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 12, backgroundColor: t.neutral[0], boxShadow: 'rgba(149, 157, 165, 0.06) 0px 8px 24px',
  },
  field: {
    flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0, minHeight: 44, justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 6,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 6, backgroundColor: t.neutral[0],
  },
  fieldText: { fontSize: 16, lineHeight: 20, color: t.neutral[900], ...font(400) },
  fieldEmpty: { color: t.neutral[400] },
  sep: { fontSize: 11, lineHeight: 14, color: t.neutral[500], ...font(400) },
  // .an-icon-btn (phones: 44 tall)
  apply: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 16,
    borderRadius: 8, backgroundColor: t.neutral[150],
  },
  applyPressed: { backgroundColor: t.neutral[200] },
  applyText: { fontSize: 13, lineHeight: 16, color: t.neutral[700], ...font(600) },
  off: { opacity: 0.6 },

  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calNav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  calMonth: { fontSize: 15, lineHeight: 20, color: t.neutral[900], ...font(500) },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  calWeekday: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(500) },
  calDay: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  calDayOn: { backgroundColor: t.primary[600] },
  calDayText: { fontSize: 15, lineHeight: 20, color: t.neutral[800], ...font(400) },
  calToday: { color: t.primary[700], ...font(600) },
  calDayTextOn: { color: t.neutral[0], ...font(600) },
});
