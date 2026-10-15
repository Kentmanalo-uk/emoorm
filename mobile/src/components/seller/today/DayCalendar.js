import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import {
  MONTH_NAMES, WEEKDAY_NAMES, addDays, dayMs, shortDay, weekday,
} from './todayTime';

/*
 * A small month calendar for picking several days (web
 * src/components/seller/DayCalendar.jsx + DayCalendar.css): days are Manila
 * "YYYY-MM-DD" strings between `min` and `max`. Picked days are filled
 * circles, today has a ring, days out of range are greyed out, and the
 * arrows stay within the range.
 *
 * <DayCalendar value={['2026-10-14']} onToggle={(day) => …} min max today />
 */

const monthOf = (day) => day.slice(0, 7);
const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const CELL = `${100 / 7}%`;

export default function DayCalendar({
  value = [], onToggle, min, max, today = min, label = 'Days',
}) {
  const [month, setMonth] = useState(() => monthOf(value[0] || min));
  const picked = useMemo(() => new Set(value), [value]);

  const { lead, days } = useMemo(() => {
    const first = `${month}-01`;
    const out = [];
    for (let day = first; monthOf(day) === month; day = addDays(day, 1)) out.push(day);
    return { lead: weekday(first), days: out };
  }, [month]);

  const [y, m] = month.split('-').map(Number);
  const canBack = month > monthOf(min);
  const canNext = month < monthOf(max);

  return (
    <View style={styles.box} accessibilityLabel={label}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canBack }}
          disabled={!canBack}
          onPress={() => setMonth((x) => shiftMonth(x, -1))}
          style={styles.nav}
          hitSlop={4}
        >
          <CaretLeftIcon size={16} weight="bold" color={canBack ? t.primary[700] : t.neutral[300]} />
        </Pressable>
        <Text style={styles.month} accessibilityLiveRegion="polite">{MONTH_NAMES[m - 1]} {y}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canNext }}
          disabled={!canNext}
          onPress={() => setMonth((x) => shiftMonth(x, 1))}
          style={styles.nav}
          hitSlop={4}
        >
          <CaretRightIcon size={16} weight="bold" color={canNext ? t.primary[700] : t.neutral[300]} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAY_NAMES.map((w) => (
          <View key={w} style={styles.cell} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={styles.wd}>{w.slice(0, 2)}</Text>
          </View>
        ))}
        {lead > 0 ? <View style={{ width: `${(100 * lead) / 7}%` }} /> : null}
        {days.map((day) => {
          const off = day < min || day > max;
          const on = picked.has(day);
          const isToday = day === today;
          return (
            <View key={day} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${shortDay(dayMs(day))}${isToday ? ', today' : ''}`}
                accessibilityState={{ selected: on, disabled: off }}
                disabled={off}
                onPress={() => onToggle(day)}
                style={[styles.day, isToday && styles.today, on && styles.dayOn]}
              >
                <Text style={[styles.dayText, isToday && styles.todayText, on && styles.dayTextOn, off && styles.dayTextOff]}>
                  {Number(day.slice(8))}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // .dcal
  box: {
    paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14,
    backgroundColor: t.neutral[0],
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  month: { fontSize: 15, lineHeight: 20, ...font(600), color: t.neutral[900] },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  cell: { width: CELL, alignItems: 'center' },
  wd: { paddingVertical: 4, fontSize: 12, lineHeight: 16, ...font(400), color: t.neutral[500] },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: t.primary[600] },
  dayOn: { backgroundColor: t.primary[600], borderColor: t.primary[600] },
  dayText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[800] },
  todayText: { ...font(600), color: t.primary[700] },
  dayTextOn: { ...font(600), color: '#fff' },
  dayTextOff: { color: t.neutral[300] },
});
