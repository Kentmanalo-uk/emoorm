import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarCheckIcon, PlusIcon, XIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { ANIMALS, AGE_UNITS, SEXES, WEEKDAYS } from '../productKinds';
import {
  Chips, Field, FieldError, Hint, MoneyInput, OptionalHead, PF, PfInput, PfSelect, Stepper, Suggest, Switch,
  UnitInput, useInvalidTarget,
} from './parts';
import WayField, { derivedStyles } from './WayField';
import {
  READY_PREP, COOK_PREP, COOK_PREP_MAX, SERVES_EXAMPLES, NOTES_MAX, MAX_SIZES, TODAY_MAX,
  minutesLabel, clock, peso, emptySize, sizeRows,
} from './formState';

/*
 * Step 2 (web product-form/DetailsStep.jsx): what each kind needs, and how
 * buyers get it.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Half-hour times from 5:00 AM to 11:30 PM, as [{ key: "15:00", label: "3:00 PM" }]. */
const TIMES = Array.from({ length: 38 }, (_, i) => {
  const m = 300 + i * 30;
  const key = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return { key, label: clock(key) };
});

/** The times to offer, keeping one already chosen that is not on the list. */
const timesWith = (value, list = TIMES) => (value && !list.some((x) => x.key === value)
  ? [...list, { key: value, label: clock(value) }].sort((a, b) => a.key.localeCompare(b.key))
  : list);

const asOptions = (list) => list.map((x) => ({ value: x.key, label: x.label }));

function NotesField({ form, set, placeholder }) {
  // Always under the "Optional" divider: no "Optional" tag of its own.
  return (
    <Field label="Notes for buyers" aside={`${form.notes.length}/${NOTES_MAX}`}>
      <PfInput
        multiline
        short
        maxLength={NOTES_MAX}
        value={form.notes}
        onChangeText={(v) => set('notes', v)}
        placeholder={placeholder}
      />
    </Field>
  );
}

function ServesField({ form, set, error, required, label = 'Good for how many?', hint }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <PfInput
        value={form.serves}
        maxLength={60}
        onChangeText={(v) => set('serves', v)}
        placeholder="e.g. Good for 3-4 people"
        autoComplete="off"
      />
      <Suggest label="Tap one:" items={SERVES_EXAMPLES} isOn={(x) => form.serves === x} onPick={(x) => set('serves', x)} />
    </Field>
  );
}

/* ── Regular product ─────────────────────────────────────────────── */
function RegularDetails({ form, set, errors, couriersOn, stockedGroup, way }) {
  const total = stockedGroup
    ? stockedGroup.choices.reduce((n, c) => n + (parseInt(stockedGroup.stocks[c] || '0', 10) || 0), 0)
    : 0;
  return (
    <>
      <Field
        label="How many do you have now?"
        required
        error={errors.stock}
        hint={stockedGroup ? null : 'It goes down by itself as you sell.'}
      >
        {stockedGroup ? (
          <View style={derivedStyles.box} accessibilityLiveRegion="polite">
            <Text style={derivedStyles.strong}>{total} in total</Text>
            <Text style={derivedStyles.small}>From each {stockedGroup.name || 'choice'}&apos;s stock in Extras</Text>
          </View>
        ) : (
          <Stepper value={form.stock} onChange={(v) => set('stock', v)} invalid={!!errors.stock} label="How many you have" />
        )}
      </Field>
      {couriersOn ? (
        <Field
          label="Weight with packaging"
          required
          error={errors.weightKg}
          hint="Your shop ships with couriers: they work out the shipping fee from it."
        >
          <UnitInput value={form.weightKg} onChange={(v) => set('weightKg', v)} placeholder="e.g. 0.5" invalid={!!errors.weightKg} />
        </Field>
      ) : null}
      {way}
      <OptionalHead />
      <Field label="Size or amount">
        <PfInput
          value={form.size}
          maxLength={60}
          onChangeText={(v) => set('size', v)}
          placeholder="e.g. 250 g pack, 1 kilo, 12 pieces"
          autoComplete="off"
        />
      </Field>
    </>
  );
}

/* ── Ready to eat today ──────────────────────────────────────────── */
function ReadyDetails({ form, set, patch, errors, editing, way }) {
  const router = useRouter();
  const now = new Date();
  const soonest = new Date(now.getTime() + 10 * 60e3);
  const laterToday = TIMES.filter((x) => {
    const [h, m] = x.key.split(':').map(Number);
    return h * 60 + m >= soonest.getHours() * 60 + soonest.getMinutes() && soonest.getDate() === now.getDate();
  });
  const times = timesWith(form.closeTime, form.closeDay === 'today' ? laterToday : TIMES);
  const days = [
    ...(laterToday.length ? [{ key: 'today', label: 'Today' }] : []),
    { key: 'tomorrow', label: 'Tomorrow' },
  ];

  return (
    <>
      {editing ? (
        <View style={styles.todayBox}>
          <CalendarCheckIcon size={22} color={PF.greenDark} />
          <View style={styles.todayBoxText}>
            <Text style={styles.todayBoxTitle}>How many and until when are set each day</Text>
            <Text style={styles.todayBoxBody}>Post it, change how many are left or close orders early from Today&apos;s menu.</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/seller/today')} style={styles.todayLinkWrap}>
              <Text style={styles.todayLink}>Open Today&apos;s menu</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Switch
            checked={form.postToday}
            onChange={(on) => set('postToday', on)}
            label="I have it today"
            sub={form.postToday ? 'It goes on Today’s menu as soon as you save.' : 'Post it from Today’s menu on the days you cook it.'}
          />
          {form.postToday ? (
            <View style={styles.today}>
              <Field label="How many servings today?" required error={errors.todayQty}>
                <Stepper value={form.todayQty} onChange={(v) => set('todayQty', v)} min={1} max={TODAY_MAX} invalid={!!errors.todayQty} label="How many today" />
              </Field>
              <Field label="Ready how soon after an order?" required>
                <PfSelect
                  value={form.todayPrep}
                  onChange={(v) => set('todayPrep', v)}
                  options={READY_PREP.map((p) => ({ value: p.value, label: p.label }))}
                />
              </Field>
              <Field label="Buyers can order until" required error={errors.closeTime}>
                <View style={styles.close}>
                  <Chips
                    label="Which day"
                    options={days}
                    value={form.closeDay}
                    onChange={(d) => patch({ closeDay: d, closeTime: form.closeTime })}
                  />
                  <PfSelect
                    value={times.some((x) => x.key === form.closeTime) ? form.closeTime : ''}
                    onChange={(v) => set('closeTime', v)}
                    placeholder="Choose a time"
                    options={[
                      ...(!times.some((x) => x.key === form.closeTime) ? [{ value: '', label: 'Choose a time' }] : []),
                      ...asOptions(times),
                    ]}
                    invalid={!!errors.closeTime}
                    style={styles.closeSelect}
                  />
                </View>
              </Field>
            </View>
          ) : null}
        </>
      )}
      {way}
      <OptionalHead />
      <ServesField form={form} set={set} label="Good for how many?" />
    </>
  );
}

/* ── Paluto, cooked to order ─────────────────────────────────────── */
function PalutoDetails({ form, set, patch, errors, way }) {
  const sizesRef = useInvalidTarget(!!errors.sizes);
  const rows = sizeRows(form);
  const prices = form.sizes.map((r) => Number(r.price)).filter((n) => n > 0);
  const lowest = prices.length ? Math.min(...prices) : null;

  const toggleSizes = (on) => {
    if (on && !form.sizes.length) {
      patch({ sizesOn: true, sizes: [emptySize(form.serves.trim(), form.price), emptySize()] });
    } else patch({ sizesOn: on });
  };
  const editSize = (key, field, value) => patch({ sizes: form.sizes.map((r) => (r.key === key ? { ...r, [field]: value } : r)) });
  const removeSize = (key) => patch({ sizes: form.sizes.filter((r) => r.key !== key) });

  const maxChoices = COOK_PREP_MAX.filter((m) => m > Number(form.prepMin || 0));
  const toggleDay = (d) => {
    const all = form.cookDays.length ? form.cookDays : [];
    set('cookDays', all.includes(d) ? all.filter((x) => x !== d) : [...all, d].sort((a, b) => a - b));
  };
  const everyDay = !form.cookDays.length || form.cookDays.length === 7;

  return (
    <>
      <View ref={sizesRef} style={[styles.sizes, form.sizesOn && styles.sizesOn]}>
        <Switch
          checked={form.sizesOn}
          onChange={toggleSizes}
          label="It comes in sizes with their own prices"
          sub="e.g. Good for 3-4: ₱350, Good for 6-8: ₱650"
        />
        {form.sizesOn ? (
          <>
            {form.sizes.map((r, i) => (
              <View style={styles.sizeRow} key={r.key}>
                <PfInput
                  value={r.name}
                  maxLength={80}
                  onChangeText={(v) => editSize(r.key, 'name', v)}
                  placeholder={i === 0 ? 'e.g. Good for 3-4 people' : 'e.g. Good for 6-8 people'}
                  accessibilityLabel={`Size ${i + 1}`}
                  style={styles.sizeName}
                />
                <MoneyInput
                  value={r.price}
                  onChange={(v) => editSize(r.key, 'price', v)}
                  placeholder={i === 0 ? '350' : '650'}
                  label={`Price of size ${i + 1}`}
                  style={styles.sizePrice}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove size ${i + 1}`}
                  onPress={() => removeSize(r.key)}
                  style={styles.sizeRemove}
                >
                  <XIcon size={16} weight="bold" color={t.neutral[500]} />
                </Pressable>
              </View>
            ))}
            {form.sizes.length < MAX_SIZES ? (
              <Pressable accessibilityRole="button" onPress={() => patch({ sizes: [...form.sizes, emptySize()] })} style={styles.addLine}>
                <PlusIcon size={14} weight="bold" color={t.primary[700]} />
                <Text style={styles.addLineText}>Add a size</Text>
              </Pressable>
            ) : null}
            {lowest && rows.length > 1 ? (
              <Hint>
                Buyers see <Text style={styles.hintStrong}>from {peso(lowest)}</Text> and pay the price of the size they pick.
              </Hint>
            ) : null}
            <FieldError text={errors.sizes} />
          </>
        ) : null}
      </View>

      <ServesField
        form={form}
        set={set}
        required
        error={errors.serves}
        hint={form.sizesOn ? 'For the smallest size.' : null}
      />

      <Field label="How long to cook it?" required error={errors.prepMin}>
        <View style={styles.range}>
          <PfSelect
            value={form.prepMin}
            onChange={(v) => patch({ prepMin: v, prepMax: Number(form.prepMax) > Number(v) ? form.prepMax : '' })}
            placeholder="Choose"
            options={[{ value: '', label: 'Choose' }, ...COOK_PREP.map((m) => ({ value: String(m), label: minutesLabel(m) }))]}
            invalid={!!errors.prepMin}
            style={styles.rangeSelect}
          />
          <Text style={styles.rangeText}>up to</Text>
          <PfSelect
            value={form.prepMax}
            onChange={(v) => set('prepMax', v)}
            title="Up to how long (optional)"
            accessibilityLabel="Up to how long (optional)"
            placeholder="Same time"
            disabled={!form.prepMin}
            options={[{ value: '', label: 'Same time' }, ...maxChoices.map((m) => ({ value: String(m), label: minutesLabel(m) }))]}
            style={styles.rangeSelect}
          />
        </View>
      </Field>

      <Field label="Minimum order" required error={errors.minOrder} hint="The fewest a buyer can order. Most keep it at 1.">
        <Stepper value={form.minOrder} onChange={(v) => set('minOrder', v)} min={1} max={100} invalid={!!errors.minOrder} label="Minimum order" />
      </Field>

      {way}

      <OptionalHead />
      <Field label="Days you cook" hint="Buyers can order any day. You cook it on these days.">
        <Chips
          label="Days you cook"
          multi
          size="sm"
          options={[{ key: 'all', label: 'Every day' }, ...[1, 2, 3, 4, 5, 6, 0].map((d) => ({ key: d, label: WEEKDAYS[d].short, title: WEEKDAYS[d].label }))]}
          values={everyDay ? ['all'] : form.cookDays}
          onChange={(k) => (k === 'all' ? set('cookDays', []) : toggleDay(k))}
        />
      </Field>
      <Field
        label="Orders must come in by"
        error={errors.orderBy}
        hint="Later orders are cooked on your next cooking day."
      >
        <PfSelect
          value={form.orderBy}
          onChange={(v) => set('orderBy', v)}
          placeholder="Any time"
          options={[{ value: '', label: 'Any time' }, ...asOptions(timesWith(form.orderBy))]}
        />
      </Field>
      <NotesField form={form} set={set} placeholder="e.g. Choose grilled or sinigang in your message. Bring your own container for pickup." />
    </>
  );
}

/* ── Live animal ─────────────────────────────────────────────────── */
function AnimalDetails({ form, set, patch, errors }) {
  const heads = parseInt(form.stock, 10) || 0;
  const sexes = SEXES.map((x) => (x.key === 'MIXED'
    ? { ...x, disabled: heads <= 1, title: heads <= 1 ? 'For more than one head' : undefined }
    : x));

  return (
    <>
      <Field label="Animal" required error={errors.animal}>
        <Chips label="Animal" options={ANIMALS} value={form.animal} onChange={(a) => patch({ animal: a })} />
        {form.animal === 'OTHER' ? (
          <PfInput
            value={form.animalName}
            maxLength={40}
            onChangeText={(v) => patch({ animalName: v, animal: form.animal })}
            placeholder="What animal? e.g. Quail"
            accessibilityLabel="What animal"
          />
        ) : null}
      </Field>

      <Field
        label="How many heads?"
        required
        error={errors.stock}
        hint="Same age, sex and weight? List them together. Animals that differ go in their own listing."
      >
        <Stepper
          value={form.stock}
          onChange={(v) => {
            // Males and females only fits more than one head.
            if ((parseInt(v, 10) || 0) <= 1 && form.sex === 'MIXED') patch({ stock: v, sex: '' });
            else set('stock', v);
          }}
          min={0}
          max={10000}
          unit={heads === 1 ? 'head' : 'heads'}
          invalid={!!errors.stock}
          label="How many heads"
        />
      </Field>

      <Field label="Age" required error={errors.ageValue}>
        <View style={styles.age}>
          <PfInput
            keyboardType="number-pad"
            value={form.ageValue}
            onChangeText={(v) => set('ageValue', v)}
            placeholder="e.g. 8"
            invalid={!!errors.ageValue}
            style={styles.ageValue}
          />
          <PfSelect
            value={form.ageUnit}
            onChange={(v) => set('ageUnit', v)}
            title="Weeks, months or years"
            accessibilityLabel="Weeks, months or years"
            options={AGE_UNITS.map((u) => ({ value: u.key, label: `${u.label} old` }))}
            style={styles.ageUnit}
          />
        </View>
      </Field>

      <Field label="Sex" required error={errors.sex}>
        <Chips label="Sex" options={sexes} value={form.sex} onChange={(x) => set('sex', x)} />
      </Field>

      <Field label="Approximate weight" required error={errors.liveWeight} hint={heads > 1 ? 'About how heavy each one is.' : 'About how heavy it is.'}>
        <UnitInput value={form.liveWeight} onChange={(v) => set('liveWeight', v)} placeholder="e.g. 65" invalid={!!errors.liveWeight} />
      </Field>

      {/* No pickup or delivery to choose: buyers make an offer, and you
          agree in chat where to meet. */}
      <Switch
        checked={form.visitFirst}
        onChange={(on) => set('visitFirst', on)}
        label="Buyers can visit the farm first"
        sub="They can come and see the animal before they buy."
      />

      <OptionalHead />
      <NotesField form={form} set={set} placeholder="e.g. Vaccinated and dewormed. Fed with rice bran and kangkong." />
    </>
  );
}

/**
 * Step 2: what each kind needs, and how buyers get it.
 * @param {Object} props.ctx - kind, editing, couriersOn, shopMode, stockedGroup
 */
export default function DetailsStep({ form, set, patch, errors, ctx }) {
  const { kind } = ctx;
  if (!kind) {
    return (
      <Text style={styles.emptyStep}>
        Choose the category in Basics first. The questions here depend on what you sell.
      </Text>
    );
  }
  const way = (
    <WayField
      value={form.fulfillment}
      onChange={(v) => set('fulfillment', v)}
      shopMode={ctx.shopMode}
      kind={kind}
      couriersOn={ctx.couriersOn}
    />
  );
  const props = { form, set, patch, errors, way };
  if (kind === 'READY_TO_EAT') return <ReadyDetails {...props} editing={ctx.editing} />;
  if (kind === 'COOK_TO_ORDER') return <PalutoDetails {...props} />;
  if (kind === 'LIVESTOCK') return <AnimalDetails {...props} />;
  return <RegularDetails {...props} couriersOn={ctx.couriersOn} stockedGroup={ctx.stockedGroup} />;
}

const styles = themed(() => StyleSheet.create({
  emptyStep: {
    padding: 18, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[50],
    color: PF.muted, fontSize: 14, lineHeight: 22.4, ...font(400),
  },

  todayBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, backgroundColor: PF.greenSoft,
  },
  todayBoxText: { flex: 1, minWidth: 0, gap: 3 },
  todayBoxTitle: { fontSize: 14.5, lineHeight: 21, color: PF.ink, ...font(700) },
  todayBoxBody: { fontSize: 13.5, lineHeight: 19.6, color: PF.greenDark, ...font(400) },
  todayLinkWrap: { alignSelf: 'flex-start', marginTop: 4 },
  todayLink: {
    fontSize: 13.5, lineHeight: 19.6, color: PF.greenDark, textDecorationLine: 'underline', ...font(600),
  },
  today: { gap: 16, padding: 16, borderRadius: 14, backgroundColor: t.neutral[50] },
  close: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  closeSelect: { width: 'auto', minWidth: 160, flexGrow: 1 },

  sizes: {
    gap: 10, paddingVertical: 4, paddingHorizontal: 14,
    borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 12,
  },
  sizesOn: { paddingBottom: 14, borderStyle: 'solid', borderColor: t.primary[200], backgroundColor: PF.greenSoft },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sizeName: { flex: 1, width: 'auto' },
  sizePrice: { width: 92 },
  sizeRemove: {
    width: 36, height: 40, borderRadius: 10, backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  addLine: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  addLineText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(600) },
  hintStrong: { ...font(700) },

  range: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rangeSelect: { flex: 1, width: 'auto' },
  rangeText: { color: PF.muted, fontSize: 14, lineHeight: 22.4, ...font(400) },

  age: { flexDirection: 'row', gap: 10 },
  ageValue: { flex: 1, width: 'auto' },
  ageUnit: { flex: 1.4, width: 'auto' },
}));
