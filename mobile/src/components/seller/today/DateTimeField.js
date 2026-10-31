import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarBlankIcon, ClockIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import {
  DAY, clock, clockText, dayStart, daySlots, longDay, pickerDays, shortDay,
} from './todayTime';

/*
 * The app's stand-in for the website's <input type="datetime-local"> and
 * <input type="date"> on Today's menu (web/src/pages/SellerToday.jsx): the
 * app has no native date picker package, so a field shows the chosen time
 * and, tapped, opens a picker inside the sheet: a row of days, then a row of
 * half-hour times. Times are epoch ms, laid out in Manila time.
 *
 * DateTimeField   the field (.scm-field input look); `open` greens its edge
 * DateTimePanel   the picker, drawn full width under the field's row
 * DayPanel        days only
 * TimeField       a time of day ("HH:MM", <input type="time">)
 * TimePanel       its picker: a row of half-hour times
 */

const dayLabel = (ms) => {
  const today = dayStart(Date.now());
  if (ms === today) return 'Today';
  if (ms === today + DAY) return 'Tomorrow';
  return shortDay(ms);
};

/** "Oct 9, 6:30 PM": what a datetime field shows. */
export const fieldLabel = (ms) => (ms == null ? '' : `${longDay(ms).replace(/, \d{4}$/, '')}, ${clock(ms)}`);

export function DateTimeField({
  value, open = false, onPress, accessibilityLabel, date = false, pill = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.field, pill && styles.pill, open && styles.fieldOpen]}
    >
      <Text style={[styles.fieldText, pill && styles.pillText, value == null && styles.fieldEmpty]} numberOfLines={1}>
        {value == null ? (date ? 'Choose a day' : 'Choose a time') : (date ? longDay(value) : fieldLabel(value))}
      </Text>
      <CalendarBlankIcon size={pill ? 16 : 18} color={open ? t.primary[600] : t.neutral[500]} />
    </Pressable>
  );
}

/** A chip in the picker rows (.stw-days .scm-chip). */
function PickChip({ label, on, disabled, onPress, width }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, width ? { width } : null, on && styles.chipOn, disabled && styles.chipOff]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn, disabled && styles.chipTextOff]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const TIME_W = 96;
const GAP = 8;

/**
 * Pick a day, then a time (picking the time closes it through onDone).
 * Times already past are greyed out, except the one already chosen.
 */
export function DateTimePanel({ value, onChange, onDone }) {
  const [day, setDay] = useState(() => dayStart(value ?? Date.now()));
  const timesRef = useRef(null);
  const days = pickerDays(14, value);
  const slots = daySlots(day, value);
  const now = Date.now();

  // Open on the chosen time (or the next half hour), not on midnight.
  useEffect(() => {
    const target = value != null && dayStart(value) === day ? value : now;
    const index = Math.max(0, slots.findIndex((s) => s >= target - 60e3));
    const x = Math.max(0, index * (TIME_W + GAP) - TIME_W);
    const id = setTimeout(() => timesRef.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const pickDay = (d) => {
    setDay(d);
    // Same time of day on the new day, when a time is already chosen.
    if (value != null) onChange(d + (value - dayStart(value)));
  };

  return (
    <View style={styles.panel}>
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {days.map((d) => (
          <PickChip key={d} label={dayLabel(d)} on={d === day} onPress={() => pickDay(d)} />
        ))}
      </ScrollView>
      <ScrollView showsVerticalScrollIndicator={false} ref={timesRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {slots.map((s) => (
          <PickChip
            key={s}
            width={TIME_W}
            label={clock(s)}
            on={s === value}
            disabled={s < now - 60e3 && s !== value}
            onPress={() => { onChange(s); onDone?.(); }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * A time of day ("HH:MM", the website's <input type="time">): the field
 * shows "6:30 PM" and a "(next day)" tag after its label is the caller's.
 */
export function TimeField({ value, open = false, onPress, accessibilityLabel }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: value ? clockText(value) : 'Not set' }}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.field, open && styles.fieldOpen]}
    >
      <Text style={[styles.fieldText, !value && styles.fieldEmpty]} numberOfLines={1}>{value ? clockText(value) : 'Choose a time'}</Text>
      <ClockIcon size={18} color={open ? t.primary[600] : t.neutral[500]} />
    </Pressable>
  );
}

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** The half-hour times of a day as chips (picking one closes it through onDone). */
export function TimePanel({ value, onChange, onDone }) {
  const ref = useRef(null);
  const slots = value && !HALF_HOURS.includes(value) ? [...HALF_HOURS, value].sort() : HALF_HOURS;
  // Open on the chosen time, not on midnight.
  useEffect(() => {
    const index = Math.max(0, slots.indexOf(value || '10:00'));
    const x = Math.max(0, index * (TIME_W + GAP) - TIME_W);
    const id = setTimeout(() => ref.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ScrollView showsVerticalScrollIndicator={false} ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {slots.map((s) => (
        <PickChip key={s} width={TIME_W} label={clockText(s)} on={s === value} onPress={() => { onChange(s); onDone?.(); }} />
      ))}
    </ScrollView>
  );
}

/** Days only, from `from` (a day's midnight) for `count` days; `value` is a day's midnight. */
export function DayPanel({ value, from, count = 30, onChange }) {
  const days = Array.from({ length: count }, (_, i) => from + i * DAY);
  return (
    <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {days.map((d) => <PickChip key={d} label={shortDay(d)} on={d === value} onPress={() => onChange(d)} />)}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  // .scm-field input
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  fieldOpen: { borderColor: t.primary[600] },
  fieldText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20.8, ...font(400), color: t.neutral[900] },
  fieldEmpty: { color: t.neutral[500] },
  // .stw-days input[type=date]
  pill: { minHeight: 38, paddingHorizontal: 10, borderRadius: 999 },
  pillText: { fontSize: 14, lineHeight: 20, color: t.neutral[800] },

  panel: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  // .stw-days .scm-chip
  chip: {
    alignItems: 'center', justifyContent: 'center', minHeight: 38, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  chipOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  chipOff: { opacity: 0.45 },
  chipText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[700] },
  chipTextOn: { color: t.onBrand },
  chipTextOff: { color: t.neutral[400] },
}));
