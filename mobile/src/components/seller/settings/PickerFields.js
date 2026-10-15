import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, ClockIcon } from 'phosphor-react-native';
import Sheet, { SheetButton } from '../../Sheet';
import { font, t } from '../../../theme';

/*
 * The website's <input type="date"> and <input type="time"> (Shop Settings,
 * ShopHoursCards.css .shc-field input / .shc-times input) for the app: a
 * field that opens the Seller Center sheet with a month to pick a day from,
 * or hour, minute and am/pm columns. Values stay as the browser gives them:
 * "2026-10-10" and "08:00".
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parseIso = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? { y, m: m - 1, d } : null;
};

/** "Oct 10, 2026" from "2026-10-10". */
export const dateLabel = (iso) => {
  const p = parseIso(iso);
  return p ? `${MONTHS_SHORT[p.m]} ${p.d}, ${p.y}` : '';
};

/** "08:00 am" from "08:00", as the phone's time field shows it. */
export const timeLabel = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  return `${pad2(h % 12 || 12)}:${pad2(m)} ${h < 12 ? 'am' : 'pm'}`;
};

/** The field box (.shc-field input on phones: 46px, white, grey edge, 8px corners). */
function FieldBox({ text, placeholder, Icon, onPress, label, style }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.box, pressed && styles.boxPressed, style]}>
      <Text style={[styles.boxText, !text && styles.boxPlaceholder]} numberOfLines={1}>{text || placeholder}</Text>
      <Icon size={18} color={t.neutral[800]} />
    </Pressable>
  );
}

export function DateField({ value, min, onChange, label = 'Date', style }) {
  const [open, setOpen] = useState(false);
  const start = parseIso(value) || parseIso(min) || { y: new Date().getFullYear(), m: new Date().getMonth() };
  const [month, setMonth] = useState({ y: start.y, m: start.m });
  useEffect(() => {
    if (!open) return;
    const p = parseIso(value) || parseIso(min);
    if (p) setMonth({ y: p.y, m: p.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shift = (by) => setMonth(({ y, m }) => {
    const n = m + by;
    return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
  });
  const minMonth = parseIso(min);
  const canGoBack = !minMonth || month.y > minMonth.y || (month.y === minMonth.y && month.m > minMonth.m);
  const firstDay = new Date(Date.UTC(month.y, month.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <>
      <FieldBox text={dateLabel(value)} placeholder="Pick a day" Icon={CalendarBlankIcon} onPress={() => setOpen(true)} label={label} style={style} />
      <Sheet variant="seller" open={open} title={label} onClose={() => setOpen(false)}>
        <View style={styles.monthHead}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={!canGoBack} onPress={() => shift(-1)} style={[styles.monthBtn, !canGoBack && styles.off]}>
            <CaretLeftIcon size={18} weight="bold" color={t.neutral[700]} />
          </Pressable>
          <Text style={styles.monthTitle}>{`${MONTHS[month.m]} ${month.y}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.monthBtn}>
            <CaretRightIcon size={18} weight="bold" color={t.neutral[700]} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {WEEK.map((w) => <Text key={w} style={styles.weekDay}>{w}</Text>)}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((d, di) => {
              if (!d) return <View key={di} style={styles.dayCell} />;
              const iso = isoOf(month.y, month.m, d);
              const disabled = Boolean(min && iso < min);
              const on = iso === value;
              return (
                <Pressable
                  key={di}
                  accessibilityRole="button"
                  accessibilityLabel={dateLabel(iso)}
                  accessibilityState={{ selected: on, disabled }}
                  disabled={disabled}
                  onPress={() => { onChange?.(iso); setOpen(false); }}
                  style={styles.dayCell}
                >
                  <View style={[styles.day, on && styles.dayOn]}>
                    <Text style={[styles.dayText, on && styles.dayTextOn, disabled && styles.dayTextOff]}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Sheet>
    </>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ROW_H = 44;

/** One scrolling column of the time sheet, opening on its chosen value. */
function Column({ items, value, render, onPick, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const i = items.indexOf(value);
    if (i > 1) setTimeout(() => ref.current?.scrollTo({ y: (i - 2) * ROW_H, animated: false }), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ScrollView showsHorizontalScrollIndicator={false} ref={ref} style={styles.column} nestedScrollEnabled showsVerticalScrollIndicator={false} accessibilityLabel={label}>
      {items.map((it) => {
        const on = it === value;
        return (
          <Pressable key={String(it)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onPick(it)} style={[styles.cell, on && styles.cellOn]}>
            <Text style={[styles.cellText, on && styles.cellTextOn]}>{render(it)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TimeField({ value, onChange, label = 'Time', style }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ h: 8, m: 0, pm: false });
  const show = () => {
    const [h, m] = String(value || '08:00').split(':').map(Number);
    setDraft({ h: h % 12 || 12, m: m || 0, pm: h >= 12 });
    setOpen(true);
  };
  const done = () => {
    const h24 = (draft.h % 12) + (draft.pm ? 12 : 0);
    onChange?.(`${pad2(h24)}:${pad2(draft.m)}`);
    setOpen(false);
  };
  return (
    <>
      <FieldBox text={timeLabel(value)} placeholder="--:-- --" Icon={ClockIcon} onPress={show} label={label} style={style} />
      <Sheet
        variant="seller"
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        scroll={false}
        footer={(
          <>
            <SheetButton variant="seller" label="Cancel" onPress={() => setOpen(false)} />
            <SheetButton variant="seller" primary label="Done" onPress={done} />
          </>
        )}
      >
        {open ? (
          <View style={styles.columns}>
            <Column label="Hour" items={HOURS} value={draft.h} render={(h) => pad2(h)} onPick={(h) => setDraft((d) => ({ ...d, h }))} />
            <Column label="Minute" items={MINUTES} value={draft.m} render={(m) => pad2(m)} onPick={(m) => setDraft((d) => ({ ...d, m }))} />
            <Column label="am or pm" items={[false, true]} value={draft.pm} render={(pm) => (pm ? 'pm' : 'am')} onPick={(pm) => setDraft((d) => ({ ...d, pm }))} />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 46, paddingHorizontal: 10, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  boxPressed: { backgroundColor: t.neutral[50] },
  boxText: { flexShrink: 1, fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[900] },
  boxPlaceholder: { color: t.neutral[500] },
  off: { opacity: 0.3 },

  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  monthTitle: { fontSize: 16, lineHeight: 22, ...font(500), color: t.neutral[900] },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, paddingVertical: 6, textAlign: 'center', fontSize: 12, lineHeight: 16, ...font(500), color: t.neutral[500] },
  dayCell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: t.primary[600] },
  dayText: { fontSize: 15, lineHeight: 20, ...font(400), color: t.neutral[900] },
  dayTextOn: { ...font(600), color: '#fff' },
  dayTextOff: { color: t.neutral[300] },

  columns: { flexDirection: 'row', gap: 8, height: ROW_H * 5 },
  column: { flex: 1 },
  cell: { height: ROW_H, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  cellOn: { backgroundColor: t.primary[50] },
  cellText: { fontSize: 16, lineHeight: 22, ...font(400), color: t.neutral[800] },
  cellTextOn: { ...font(600), color: t.primary[700] },
});
