import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AirplaneTiltIcon, CheckIcon } from 'phosphor-react-native';
import apiClient from '../../../api/client';
import Select from '../../Select';
import { DAYS, shortDate } from '../../shop/shopHours';
import { toast } from '../../../lib/toast';
import { font, t } from '../../../theme';
import { SellerButton } from './SettingsCard';
import { DateField, TimeField } from './PickerFields';

/*
 * Shop Settings: the Away mode and Opening hours forms, each opened under
 * its row (web src/components/seller/ShopHoursCards.jsx + .css, phones).
 * Both save straight to the shop (PUT /stores/:id) and hand the saved shop
 * to onSaved.
 */

const DEFAULT_RANGE = ['08:00', '17:00'];

// The form's week: every day, open with one range or closed.
const weekForm = (hours) => Object.fromEntries(DAYS.map(([key]) => {
  const ranges = hours?.[key];
  return [key, ranges === undefined
    // Nothing set yet: Monday to Saturday as a start. A set week without
    // this day: closed.
    ? { open: hours ? false : key !== 'sun', from: DEFAULT_RANGE[0], to: DEFAULT_RANGE[1] }
    : { open: ranges.length > 0, from: ranges[0]?.[0] || DEFAULT_RANGE[0], to: ranges[0]?.[1] || DEFAULT_RANGE[1] }];
}));

const tomorrowISO = () => {
  const d = new Date(Date.now() + 86400e3);
  return d.toISOString().slice(0, 10);
};

const PREP_OPTIONS = [
  { value: '', label: 'Not set (1 day)' },
  { value: '0', label: 'Same day' },
  ...[1, 2, 3, 4, 5, 7, 10, 14].map((d) => ({ value: String(d), label: `${d} day${d === 1 ? '' : 's'}` })),
];

// Saves straight to the shop and hands the saved shop on.
const useShopSave = (store, onSaved) => {
  const [busy, setBusy] = useState(false);
  const save = async (data, message) => {
    setBusy(true);
    try {
      const res = await apiClient.put(`/stores/${store.id}`, data);
      onSaved?.(res.data);
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [save, busy];
};

/** The browser's checkbox with the seller green (accent-color), 18 × 18. */
function Checkbox({ checked }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked ? <CheckIcon size={13} weight="bold" color="#fff" /> : null}
    </View>
  );
}

/**
 * Away mode: the date the shop is back and a note for buyers. Buyers still
 * see the products but can't order until then. `onDone` runs after it is
 * saved, and on Cancel.
 */
export function AwayForm({ store, onSaved, onDone }) {
  const [backOn, setBackOn] = useState(tomorrowISO());
  const [note, setNote] = useState(store.vacationNote || '');
  const [save, saving] = useShopSave(store, onSaved);

  const goAway = async () => {
    // Back at the start of that day, Manila time.
    const until = new Date(`${backOn}T00:00:00+08:00`);
    if (await save({ vacationUntil: until.toISOString(), vacationNote: note }, `Away until ${shortDate(until)}`)) onDone?.();
  };

  return (
    <View style={styles.body}>
      <Text style={styles.help}>
        Buyers still see your products, with the date you are back, but can&apos;t order until then.
      </Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Back on</Text>
        <DateField value={backOn} min={tomorrowISO()} onChange={setBackOn} label="Back on" style={styles.dateBox} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Note for buyers (optional)</Text>
        <TextInput
          value={note}
          maxLength={200}
          placeholder="e.g. Harvest season, back next week!"
          placeholderTextColor={t.neutral[500]}
          onChangeText={setNote}
          style={styles.input}
          accessibilityLabel="Note for buyers (optional)"
        />
      </View>
      <View style={styles.actions}>
        {onDone ? <SellerButton label="Cancel" onPress={onDone} disabled={saving} style={styles.action} /> : null}
        <SellerButton primary label="Go away" Icon={AirplaneTiltIcon} onPress={goAway} busy={saving} disabled={!backOn} style={styles.action} />
      </View>
    </View>
  );
}

/**
 * Opening hours: the week's hours (shown on the shop page with "Open now"
 * or "Closed now") and the days an order takes to get ready.
 */
export function HoursForm({ store, onSaved }) {
  const [week, setWeek] = useState(() => weekForm(store.openingHours));
  const [prepDays, setPrepDays] = useState(store.prepDays ?? '');
  const [save, saving] = useShopSave(store, onSaved);

  const setDay = (key, patch) => setWeek((w) => ({ ...w, [key]: { ...w[key], ...patch } }));
  const badRange = DAYS.some(([key]) => week[key].open && week[key].from >= week[key].to);
  const saveHours = () => save({
    openingHours: Object.fromEntries(DAYS.map(([key]) => [key, week[key].open ? [[week[key].from, week[key].to]] : []])),
    prepDays: prepDays === '' ? null : Number(prepDays),
  }, 'Opening hours saved');
  const clearHours = async () => {
    if (await save({ openingHours: null }, 'Opening hours removed')) setWeek(weekForm(null));
  };

  return (
    <View style={styles.body}>
      <Text style={styles.help}>Shown on your shop page with “Open now” or “Closed now”. Buyers can still order when you are closed.</Text>
      <View>
        {DAYS.map(([key, label]) => {
          const day = week[key];
          return (
            <View key={key} style={styles.day}>
              <View style={styles.dayTop}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: day.open }}
                  accessibilityLabel={label}
                  onPress={() => setDay(key, { open: !day.open })}
                  style={styles.dayToggle}
                  hitSlop={6}
                >
                  <Checkbox checked={day.open} />
                  <Text style={[styles.dayName, !day.open && styles.dayNameClosed]}>{label}</Text>
                </Pressable>
                {!day.open ? <Text style={styles.closed}>Closed</Text> : null}
              </View>
              {day.open ? (
                <View style={styles.times}>
                  <TimeField value={day.from} onChange={(v) => setDay(key, { from: v })} label={`${label} opens`} style={styles.timeBox} />
                  <Text style={styles.to}>to</Text>
                  <TimeField value={day.to} onChange={(v) => setDay(key, { to: v })} label={`${label} closes`} style={styles.timeBox} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {badRange ? <Text style={styles.error}>A day closes before it opens. Check the times.</Text> : null}

      <View style={[styles.field, styles.prep]}>
        <Text style={styles.fieldLabel}>Days to get an order ready</Text>
        <Select
          value={String(prepDays)}
          options={PREP_OPTIONS}
          onChange={(v) => setPrepDays(v)}
          title="Days to get an order ready"
          accessibilityLabel="Days to get an order ready"
          style={styles.select}
          textStyle={styles.selectText}
          caretColor={t.neutral[800]}
        />
        <Text style={styles.small}>Buyers see when to expect their order from this.</Text>
      </View>

      <View style={styles.actions}>
        {store.openingHours ? (
          <SellerButton label="Remove hours" onPress={clearHours} disabled={saving} style={styles.action} />
        ) : null}
        <SellerButton primary label="Save hours" onPress={saveHours} busy={saving} disabled={badRange} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // .sst-panel .shc-body on phones: under its row, 16px sides.
  body: { gap: 12, paddingTop: 0, paddingHorizontal: 16, paddingBottom: 16 },
  help: { fontSize: 13.5, lineHeight: 20.9, ...font(400), color: t.neutral[600] },

  field: { gap: 5 },
  fieldLabel: { fontSize: 13, lineHeight: 18, ...font(500), color: t.neutral[700] },
  dateBox: { alignSelf: 'flex-start', minWidth: 156 },
  input: {
    minHeight: 46, paddingHorizontal: 10, paddingVertical: 0, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    backgroundColor: t.neutral[0], fontSize: 14, ...font(400), color: t.neutral[900],
  },

  // .shc-day on phones: the times wrap under the day name.
  day: { gap: 6, minHeight: 52, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.neutral[100] },
  dayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dayToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: t.neutral[500], borderRadius: 3, backgroundColor: t.neutral[0],
  },
  checkboxOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  dayName: { fontSize: 14, lineHeight: 20, ...font(500), color: t.neutral[900] },
  dayNameClosed: { color: t.neutral[500] },
  closed: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[500] },
  times: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 28 },
  timeBox: { flex: 1, minWidth: 0 },
  to: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[500] },
  error: { fontSize: 13, lineHeight: 18, ...font(400), color: t.danger[700] },

  prep: { marginTop: 4 },
  select: {
    minHeight: 46, paddingHorizontal: 10, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  selectText: { fontSize: 14, lineHeight: 20, color: t.neutral[900] },
  small: { fontSize: 12, lineHeight: 16, ...font(400), color: t.neutral[500] },

  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
