import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import Sheet, { SheetButton } from '../../Sheet';
import { font, t } from '../../../theme';

/*
 * The voucher's "Last day" (the website's <input type="date"> in
 * ShopVouchers.jsx). The app has no date picker, so a month calendar opens
 * in a Seller Center sheet: tap a day to choose it; days before today are
 * off. "No last day" clears it. Values are YYYY-MM-DD, as the website's.
 *
 * <VoucherDateSheet open value="2026-10-31" onPick={(ymd) => …} onClose />
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const two = (n) => String(n).padStart(2, '0');
const ymdOf = (y, m, d) => `${y}-${two(m + 1)}-${two(d)}`;
const todayYmd = () => {
  const d = new Date();
  return ymdOf(d.getFullYear(), d.getMonth(), d.getDate());
};

const monthOf = (value) => {
  if (value) {
    const [y, m] = value.split('-').map(Number);
    return { y, m: m - 1 };
  }
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
};

export default function VoucherDateSheet({ open, value, onPick, onClose }) {
  const [view, setView] = useState(() => monthOf(value));
  useEffect(() => { if (open) setView(monthOf(value)); }, [open, value]);

  const today = todayYmd();
  const now = monthOf(null);
  const atFirst = view.y === now.y && view.m === now.m;
  const move = (step) => setView(({ y, m }) => {
    const next = m + step;
    return { y: y + Math.floor(next / 12), m: ((next % 12) + 12) % 12 };
  });

  const lead = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <Sheet
      variant="seller"
      open={open}
      title="Last day"
      onClose={onClose}
      footer={<SheetButton variant="seller" label="No last day" onPress={() => onPick('')} />}
    >
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={atFirst}
          onPress={() => move(-1)}
          style={[styles.nav, atFirst && styles.navOff]}
        >
          <CaretLeftIcon size={18} weight="bold" color={t.neutral[700]} />
        </Pressable>
        <Text style={styles.month}>{MONTHS[view.m]} {view.y}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => move(1)} style={styles.nav}>
          <CaretRightIcon size={18} weight="bold" color={t.neutral[700]} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={`w${i}`} style={styles.weekday}>{w}</Text>
        ))}
        {cells.map((d, i) => {
          if (!d) {
            // eslint-disable-next-line react/no-array-index-key
            return <View key={`e${i}`} style={styles.cell} />;
          }
          const ymd = ymdOf(view.y, view.m, d);
          const past = ymd < today;
          const on = ymd === value;
          return (
            <Pressable
              key={ymd}
              accessibilityRole="button"
              accessibilityLabel={`${MONTHS[view.m]} ${d}, ${view.y}`}
              accessibilityState={{ selected: on, disabled: past }}
              disabled={past}
              onPress={() => onPick(ymd)}
              style={styles.cell}
            >
              <View style={[styles.day, ymd === today && styles.today, on && styles.dayOn]}>
                <Text style={[styles.dayText, past && styles.dayPast, on && styles.dayTextOn]}>{d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  navOff: { opacity: 0.4 },
  month: { fontSize: 16, lineHeight: 24, ...font(500), color: t.neutral[900] },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', paddingVertical: 6, textAlign: 'center', fontSize: 12, lineHeight: 18, ...font(500), color: t.neutral[500] },
  cell: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderColor: t.primary[600] },
  dayOn: { backgroundColor: t.primary[600], borderWidth: 0 },
  dayText: { fontSize: 15, lineHeight: 20, ...font(400), color: t.neutral[800] },
  dayPast: { color: t.neutral[300] },
  dayTextOn: { ...font(600), color: '#fff' },
});
