import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalculatorIcon, InfoIcon, MinusIcon, PlusIcon, ScalesIcon, TrendUpIcon, XIcon,
} from '../../lib/icons';
import apiClient from '../../api/client';
import ProductImage from '../ProductImage';
import { font, t, themed } from '../../theme';
import { SheetFrame } from '../Sheet';
import {
  MIN_SHARE, below, clock, heads, peso,
} from './offerText';

/*
 * The sheets of a livestock deal (web/src/components/offers/DealSheets.jsx,
 * Offers.css .of-dialog as a phone bottom sheet): naming a price (the first
 * offer, or an answer in the chat), setting a meetup, and recording the sale
 * after meeting. The website draws these sheets outside its page, so they
 * keep their full weights on phones (600 / 700).
 */

const native = Platform.OS !== 'web';

const ANIMALS = {
  PIG: 'pigs', COW: 'cattle', CARABAO: 'carabaos', GOAT: 'goats', SHEEP: 'sheep', CHICKEN: 'chickens', DUCK: 'ducks', TURKEY: 'turkeys', RABBIT: 'rabbits', HORSE: 'horses',
};

const amount = (text) => {
  const n = Number(String(text).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const moneyInput = (v) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

/**
 * The frame every sheet shares, in the app's one sheet look (the sign-in
 * sheet's: Sheet.js SheetFrame): handle, round × at the left, the title, then
 * the body. Shown until closed; the caller hears of it once it has gone down.
 */
function OfferSheet({ title, onClose, children }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(true);
  const done = useRef(false);
  const close = () => {
    setOpen(false);
    setTimeout(() => {
      if (done.current) return;
      done.current = true;
      onClose();
    }, 260);
  };
  return (
    <SheetFrame safeBottom={false} open={open} onClose={close} title={title} padded={false} maxHeight={0.92}>
      <View style={[styles.dialogBody, styles.glassBody, { paddingBottom: 20 + insets.bottom }]}>
        {children}
      </View>
    </SheetFrame>
  );
}

/** The animal on the table: photo, name and asking price. */
function DealHead({ deal, listPrice }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemImg}><ProductImage src={deal.image} /></View>
      <View style={styles.itemText}>
        <Text style={styles.itemName} numberOfLines={1}>{deal.name}</Text>
        <Text style={styles.itemSmall}>{`Asking ${peso(listPrice)} per head · ${heads(deal.stock)} available`}</Text>
      </View>
    </View>
  );
}

/** − n + for a number of heads. */
function Stepper({ value, min, max, onChange }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} accessibilityRole="button" accessibilityLabel="Fewer heads" style={[styles.stepBtn, value <= min && styles.stepOff]}>
        <MinusIcon size={14} weight="bold" color={t.neutral[900]} />
      </Pressable>
      <Text style={styles.stepValue} accessibilityLiveRegion="polite">{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityRole="button" accessibilityLabel="More heads" style={[styles.stepBtn, value >= max && styles.stepOff]}>
        <PlusIcon size={14} weight="bold" color={t.neutral[900]} />
      </Pressable>
    </View>
  );
}

/** ₱ and an amount, typed in (.of-money). */
function MoneyField({ value, onChange, label }) {
  return (
    <View style={styles.money}>
      <Text style={styles.moneyPeso}>₱</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(moneyInput(v))}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        style={styles.moneyInput}
      />
    </View>
  );
}

function SendButton({ label, busyLabel, busy, disabled, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" style={[styles.send, (disabled || busy) && styles.sendOff]}>
      {busy ? <ActivityIndicator size="small" color="#fff" style={styles.sendSpin} /> : null}
      <Text style={styles.sendText}>{busy ? busyLabel : label}</Text>
    </Pressable>
  );
}

function NoteField({ label, value, onChange, placeholder }) {
  return (
    <View style={styles.fieldStack}>
      <Text style={styles.label}>{label} <Text style={styles.labelSoft}>(optional)</Text></Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={300}
        multiline
        placeholder={placeholder}
        placeholderTextColor={t.neutral[400]}
        accessibilityLabel={label}
        style={[styles.input, styles.textarea]}
      />
    </View>
  );
}

/**
 * Name a price per head for some heads: the first offer (from the product
 * page) or an answer in the chat. Works out the total, how it compares with
 * the asking price, the price per kilo, and what buyers usually pay.
 *
 * deal: { productId, name, image, listPrice, stock, weightKg }
 * initial: { quantity, price }
 */
export function PriceSheet({
  deal, initial = {}, title = 'Make an offer', submitLabel = 'Send offer', side = 'buyer', theirPrice = null, onSubmit, onClose,
}) {
  const listPrice = Number(deal.listPrice) || 0;
  const stock = Math.max(1, Number(deal.stock) || 1);
  const [qty, setQty] = useState(Math.min(stock, Math.max(1, Number(initial.quantity) || 1)));
  const [price, setPrice] = useState(String(initial.price ?? Math.round(listPrice * 0.95)));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [usual, setUsual] = useState(null);
  const lowest = Math.ceil(listPrice * MIN_SHARE);
  const value = amount(price);
  const valid = value >= lowest && value <= listPrice;
  const weight = Number(deal.weightKg) || 0;

  useEffect(() => {
    if (!deal.productId) return undefined;
    let live = true;
    apiClient.get('/offers/estimate', { params: { productId: deal.productId } })
      .then((res) => { if (live && res.data?.low) setUsual(res.data); })
      .catch(() => {});
    return () => { live = false; };
  }, [deal.productId]);

  const send = async () => {
    if (!valid || sending) return;
    setError('');
    setSending(true);
    try {
      await onSubmit({ quantity: qty, price: value, note: note.trim() || undefined });
    } catch (err) {
      setError(err?.message || 'Could not send it. Try again.');
      setSending(false);
    }
  };

  const diff = listPrice - value;
  return (
    <OfferSheet title={title} onClose={onClose}>
      <DealHead deal={deal} listPrice={listPrice} />

      <View style={styles.field}>
        <Text style={styles.label}>How many heads</Text>
        <Stepper value={qty} min={1} max={stock} onChange={setQty} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, styles.shrink]}>
          Your price per head
          {theirPrice != null ? <Text style={styles.labelSoft}>{` · they said ${peso(theirPrice)}`}</Text> : null}
        </Text>
        <MoneyField value={price} onChange={setPrice} label="Your price per head" />
      </View>
      <View style={styles.chips} accessibilityLabel="Quick prices">
        {[15, 10, 5, 0].map((pct) => {
          const p = Math.round(listPrice * (1 - pct / 100));
          const on = value === p;
          return (
            <Pressable key={pct} onPress={() => setPrice(String(p))} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{pct ? `−${pct}%` : 'Asking'}</Text>
            </Pressable>
          );
        })}
      </View>
      {price !== '' && !valid ? (
        <Text style={[styles.help, styles.helpBad]}>
          {value > listPrice ? `Up to the asking price, ${peso(listPrice)}.` : `From ${peso(lowest)} per head (half the asking price).`}
        </Text>
      ) : null}

      <View style={styles.calc} accessibilityLiveRegion="polite">
        <View style={styles.calcTotal}>
          <View style={styles.calcWhat}>
            <CalculatorIcon size={16} weight="fill" color={t.primary[600]} />
            <Text style={styles.calcWhatText}>{valid ? `${heads(qty)} × ${peso(value)}` : 'Total'}</Text>
          </View>
          <Text style={styles.calcSum}>{valid ? peso(value * qty) : '—'}</Text>
        </View>
        {valid ? (
          <View style={styles.calcLines}>
            <CalcLine Icon={TrendUpIcon}>
              {diff > 0
                ? `${peso(diff)} less per head than asking (${below(value, listPrice)}% off)${qty > 1 ? ` · ${peso(diff * qty)} less in all` : ''}`
                : 'At the asking price'}
            </CalcLine>
            {weight > 0 ? (
              <CalcLine Icon={ScalesIcon}>{`About ${peso(Math.round(value / weight))} per kilo live weight (≈${weight} kg each)`}</CalcLine>
            ) : null}
            {usual ? (
              <CalcLine Icon={InfoIcon} strong>
                {`Similar ${ANIMALS[usual.animal] || 'animals'}${usual.town ? ` in ${usual.town}` : ''} usually go for ${peso(usual.low)}–${peso(usual.high)} per head`}
              </CalcLine>
            ) : null}
          </View>
        ) : null}
      </View>

      <NoteField
        label="Message"
        value={note}
        onChange={setNote}
        placeholder={side === 'buyer' ? 'e.g. Can I see them on Saturday?' : 'e.g. They are vaccinated and healthy'}
      />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

      <SendButton label={submitLabel} busyLabel="Sending…" busy={sending} disabled={!valid} onPress={send} />
      <Text style={styles.fineprint}>
        {side === 'buyer'
          ? 'No payment now. You talk it over in chat, meet to see the animals, and pay in person.'
          : 'The buyer can accept, answer with another price, or decline.'}
      </Text>
    </OfferSheet>
  );
}

function CalcLine({ Icon, strong = false, children }) {
  return (
    <View style={styles.calcLine}>
      <Icon size={15} color={t.primary[600]} style={styles.calcIcon} />
      <Text style={[styles.calcLineText, strong && styles.calcStrong]}>{children}</Text>
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400e3;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayChip = (d, today) => {
  const n = Math.round((startOfDay(d) - today) / DAY_MS);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
// Meetup times on the half hour, 5:00 AM to 8:00 PM.
const TIMES = Array.from({ length: 31 }, (_, i) => 5 * 60 + i * 30);

/**
 * When and where to meet; the shop's pickup spot is offered first. The
 * website's date-and-time box is a row of days and a row of times here.
 */
export function MeetupSheet({ deal, onSubmit, onClose }) {
  // Tomorrow at 9 AM, unless a meetup is set already.
  const [at, setAt] = useState(() => {
    if (deal.meetAt) return new Date(deal.meetAt);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [place, setPlace] = useState(deal.meetPlace || deal.store?.pickupAddress || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [now] = useState(() => new Date());
  const today = startOfDay(now);
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)), [now]);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const times = TIMES.includes(minutes) ? TIMES : [...TIMES, minutes].sort((a, b) => a - b);
  const sameDay = (d) => startOfDay(d).getTime() === startOfDay(at).getTime();

  const pickDay = (d) => {
    const next = new Date(d);
    next.setHours(at.getHours(), at.getMinutes(), 0, 0);
    // Not earlier than now: today's first time still ahead.
    if (next < now) {
      const first = TIMES.find((m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m) > now);
      if (first == null) return;
      next.setHours(0, first, 0, 0);
    }
    setAt(next);
  };
  const pickTime = (m) => {
    const next = new Date(at);
    next.setHours(0, m, 0, 0);
    setAt(next);
  };

  const send = async () => {
    if (!at || !place.trim()) { setError('Choose a day and time, and say where.'); return; }
    setSending(true);
    setError('');
    try {
      await onSubmit({ at: at.toISOString(), place: place.trim() });
    } catch (err) {
      setError(err?.message || 'Could not set the meetup.');
      setSending(false);
    }
  };

  return (
    <OfferSheet title={deal.meetAt ? 'Change the meetup' : 'Set a meetup'} onClose={onClose}>
      <Text style={styles.asking}>Meet to see the animals and settle the deal. Both of you see it in the chat.</Text>
      <View style={styles.fieldStack}>
        <Text style={styles.label}>Day and time</Text>
        <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
          {days.map((d) => {
            const on = sameDay(d);
            const past = !TIMES.some((m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m) > now);
            return (
              <Pressable key={d.getTime()} onPress={() => pickDay(d)} disabled={past} accessibilityRole="button" accessibilityState={{ selected: on, disabled: past }} style={[styles.chip, on && styles.chipOn, past && styles.chipPast]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{dayChip(d, today)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
          {times.map((m) => {
            const slot = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, m);
            const on = m === minutes;
            const past = slot < now;
            return (
              <Pressable key={m} onPress={() => pickTime(m)} disabled={past} accessibilityRole="button" accessibilityState={{ selected: on, disabled: past }} style={[styles.chip, on && styles.chipOn, past && styles.chipPast]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{clock(slot)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.fieldStack}>
        <Text style={styles.label}>Place</Text>
        <TextInput
          value={place}
          onChangeText={setPlace}
          maxLength={200}
          placeholder="e.g. the farm, or the town plaza"
          placeholderTextColor={t.neutral[400]}
          accessibilityLabel="Place"
          style={styles.input}
        />
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <SendButton label="Send meetup" busyLabel="Saving…" busy={sending} onPress={send} />
    </OfferSheet>
  );
}

/**
 * After meeting: the heads and the total agreed in person (filled in from
 * the agreement, and changeable). The buyer confirms it.
 */
export function RecordSheet({ deal, onSubmit, onClose }) {
  const stock = Math.max(1, Number(deal.product?.stock) || deal.quantity || 1);
  const perHead = deal.agreedPrice || deal.price;
  const [qty, setQty] = useState(Math.min(stock, deal.quantity));
  const [total, setTotal] = useState(String(Math.round(perHead * Math.min(stock, deal.quantity))));
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const value = amount(total);
  const valid = value > 0;

  const changeQty = (n) => {
    setQty(n);
    // Until the seller types a total, it follows the agreed price per head.
    if (!touched) setTotal(String(Math.round(perHead * n)));
  };

  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError('');
    try {
      await onSubmit({ quantity: qty, total: value, note: note.trim() || undefined });
    } catch (err) {
      setError(err?.message || 'Could not mark it as done.');
      setSending(false);
    }
  };

  return (
    <OfferSheet title="Mark the deal as done" onClose={onClose}>
      <Text style={styles.asking}>{`Agreed: ${peso(deal.agreedPrice)} per head for ${heads(deal.quantity)}. Enter what you settled on in person.`}</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Heads sold</Text>
        <Stepper value={qty} min={1} max={stock} onChange={changeQty} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Total paid</Text>
        <MoneyField value={total} onChange={(v) => { setTouched(true); setTotal(v); }} label="Total paid" />
      </View>
      {valid ? <Text style={styles.help}>{`${peso(value / qty)} per head`}</Text> : null}
      <NoteField label="Note" value={note} onChange={setNote} placeholder="e.g. Picked up at the farm, paid in cash" />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <SendButton label="Mark as done" busyLabel="Saving…" busy={sending} disabled={!valid} onPress={send} />
      <Text style={styles.fineprint}>The buyer confirms it in the chat. If they don&apos;t answer, it confirms itself after 3 days.</Text>
    </OfferSheet>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  dialog: {
    width: '100%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: t.neutral[0], overflow: 'hidden',
    boxShadow: [{ offsetX: 0, offsetY: 24, blurRadius: 60, color: 'rgba(0, 0, 0, 0.25)' }],
  },
  dialogBody: { gap: 12, padding: 20 },
  // Under the system sheet's grabber.
  glassBody: { paddingTop: 4 },
  grip: { alignSelf: 'center', width: 40, height: 4, marginTop: -8, marginBottom: -4, borderRadius: 999, backgroundColor: t.neutral[300] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flexShrink: 1, fontSize: 19, lineHeight: 24.7, ...font(600), color: t.neutral[900] },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { backgroundColor: t.neutral[100] },
  asking: { marginTop: -6, fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: t.neutral[50] },
  itemImg: { width: 52, height: 52, flexShrink: 0, overflow: 'hidden', borderRadius: 10, backgroundColor: t.neutral[100] },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 15, lineHeight: 24, ...font(700), color: t.neutral[900] },
  itemSmall: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },

  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fieldStack: { gap: 6 },
  label: { fontSize: 14, lineHeight: 22.4, ...font(600), color: t.neutral[800] },
  labelSoft: { ...font(400), color: t.neutral[400] },
  shrink: { flexShrink: 1 },

  stepper: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: t.neutral[100] },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.35 },
  stepValue: { minWidth: 32, fontSize: 16, lineHeight: 25.6, ...font(700), color: t.neutral[900], textAlign: 'center' },

  money: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.neutral[100] },
  moneyPeso: { fontSize: 16, lineHeight: 25.6, ...font(700), color: t.neutral[500] },
  moneyInput: {
    width: 110, padding: 0, fontSize: 20, lineHeight: 26, ...font(700), color: t.neutral[900], textAlign: 'right', outlineStyle: 'none',
  },

  chips: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  chip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.neutral[100] },
  chipOn: { backgroundColor: t.primary[600] },
  chipPast: { opacity: 0.4 },
  chipText: { fontSize: 13, lineHeight: 20.8, ...font(600), color: t.neutral[700] },
  chipTextOn: { color: t.onBrand },
  pickRow: { gap: 6 },

  help: { marginTop: -6, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500], textAlign: 'right' },
  helpBad: { color: t.danger[600] },
  error: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.danger[600] },

  calc: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: t.primary[50] },
  calcTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  calcWhat: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  calcWhatText: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, ...font(600), color: t.neutral[700] },
  calcSum: { fontSize: 24, lineHeight: 24, ...font(700), color: t.primary[800] },
  calcLines: { gap: 6 },
  calcLine: { flexDirection: 'row', gap: 8 },
  calcIcon: { flexShrink: 0, marginTop: 1 },
  calcLineText: { flex: 1, fontSize: 13, lineHeight: 17.55, ...font(400), color: t.neutral[700] },
  calcStrong: { ...font(600) },

  input: {
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.neutral[100],
    fontSize: 15, lineHeight: 20, ...font(400), color: t.neutral[900], outlineStyle: 'none',
  },
  textarea: { minHeight: 66, textAlignVertical: 'top' },

  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 13, borderRadius: 999, backgroundColor: t.primary[600] },
  sendOff: { opacity: 0.5 },
  sendSpin: { marginRight: 8 },
  sendText: { fontSize: 16, lineHeight: 25.6, ...font(700), color: t.onBrand },
  fineprint: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500], textAlign: 'center' },
}));
