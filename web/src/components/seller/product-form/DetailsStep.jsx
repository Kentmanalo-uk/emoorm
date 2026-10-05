import { Link } from 'react-router-dom';
import { Plus, X, CalendarCheck } from '@phosphor-icons/react';
import { ANIMALS, AGE_UNITS, SEXES, WEEKDAYS } from '../../../lib/productKinds';
import {
  Field, FieldError, OptionalHead, Chips, Switch, MoneyInput, Stepper,
} from './parts';
import WayField from './WayField';
import {
  READY_PREP, COOK_PREP, COOK_PREP_MAX, SERVES_EXAMPLES, NOTES_MAX, MAX_SIZES, TODAY_MAX,
  minutesLabel, clock, peso, emptySize, sizeRows,
} from './formState';

const pad = (n) => String(n).padStart(2, '0');

/** Half-hour times from 5:00 AM to 11:30 PM, as [{ key: "15:00", label: "3:00 PM" }]. */
const TIMES = Array.from({ length: 38 }, (_, i) => {
  const m = 300 + i * 30;
  const key = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return { key, label: clock(key) };
});

/** The times to offer, keeping one already chosen that is not on the list. */
const timesWith = (value, list = TIMES) => (value && !list.some((t) => t.key === value)
  ? [...list, { key: value, label: clock(value) }].sort((a, b) => a.key.localeCompare(b.key))
  : list);

function NotesField({ form, set, placeholder }) {
  return (
    <Field
      label="Notes for buyers"
      optional
      htmlFor="pf-notes"
      aside={`${form.notes.length}/${NOTES_MAX}`}
    >
      <textarea
        id="pf-notes"
        className="pf-input pf-textarea pf-textarea--short"
        rows={2}
        maxLength={NOTES_MAX}
        value={form.notes}
        onChange={(e) => set('notes', e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

function ServesField({ form, set, error, required, label = 'Good for how many?', hint }) {
  return (
    <Field label={label} required={required} optional={!required} error={error} htmlFor="pf-serves" hint={hint}>
      <input
        id="pf-serves"
        className="pf-input"
        value={form.serves}
        maxLength={60}
        onChange={(e) => set('serves', e.target.value)}
        placeholder="e.g. Good for 3-4 people"
        autoComplete="off"
      />
      <div className="pf-suggest">
        <span>Tap one:</span>
        {SERVES_EXAMPLES.map((s) => (
          <button type="button" key={s} className={form.serves === s ? 'is-on' : ''} onClick={() => set('serves', s)}>{s}</button>
        ))}
      </div>
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
        htmlFor="pf-stock"
        hint={stockedGroup ? null : 'It goes down by itself as you sell.'}
      >
        {stockedGroup ? (
          <div className="pf-derived" aria-live="polite">
            <strong>{total} in total</strong>
            <small>From each {stockedGroup.name || 'choice'}&apos;s stock in Extras</small>
          </div>
        ) : (
          <Stepper id="pf-stock" value={form.stock} onChange={(v) => set('stock', v)} invalid={!!errors.stock} label="How many you have" />
        )}
      </Field>
      {couriersOn && (
        <Field
          label="Weight with packaging"
          required
          error={errors.weightKg}
          htmlFor="pf-weight"
          hint="Your shop ships with couriers: they work out the shipping fee from it."
        >
          <div className="pf-unit">
            <input
              id="pf-weight"
              className={`pf-input${errors.weightKg ? ' is-invalid' : ''}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.weightKg}
              onChange={(e) => set('weightKg', e.target.value)}
              placeholder="e.g. 0.5"
            />
            <span>kg</span>
          </div>
        </Field>
      )}
      {way}
      <OptionalHead />
      <Field label="Size or amount" optional htmlFor="pf-size">
        <input
          id="pf-size"
          className="pf-input"
          value={form.size}
          maxLength={60}
          onChange={(e) => set('size', e.target.value)}
          placeholder="e.g. 250 g pack, 1 kilo, 12 pieces"
          autoComplete="off"
        />
      </Field>
    </>
  );
}

/* ── Ready to eat today ──────────────────────────────────────────── */
function ReadyDetails({ form, set, patch, errors, editing, way }) {
  const now = new Date();
  const soonest = new Date(now.getTime() + 10 * 60e3);
  const laterToday = TIMES.filter((t) => {
    const [h, m] = t.key.split(':').map(Number);
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
        <div className="pf-today-box">
          <CalendarCheck size={22} aria-hidden="true" />
          <div>
            <strong>How many and until when are set each day</strong>
            <span>Post it, change how many are left or close orders early from Today&apos;s menu.</span>
            <Link to="/seller/today" className="pf-today-link">Open Today&apos;s menu</Link>
          </div>
        </div>
      ) : (
        <>
          <Switch
            checked={form.postToday}
            onChange={(on) => set('postToday', on)}
            label="I have it today"
            sub={form.postToday ? 'It goes on Today’s menu as soon as you save.' : 'Post it from Today’s menu on the days you cook it.'}
          />
          {form.postToday && (
            <div className="pf-today">
              <Field label="How many servings today?" required error={errors.todayQty} htmlFor="pf-today-qty">
                <Stepper id="pf-today-qty" value={form.todayQty} onChange={(v) => set('todayQty', v)} min={1} max={TODAY_MAX} invalid={!!errors.todayQty} label="How many today" />
              </Field>
              <Field label="Ready how soon after an order?" required htmlFor="pf-today-prep">
                <select id="pf-today-prep" className="pf-input pf-select" value={form.todayPrep} onChange={(e) => set('todayPrep', e.target.value)}>
                  {READY_PREP.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Buyers can order until" required error={errors.closeTime} htmlFor="pf-close-time">
                <div className="pf-close">
                  <Chips
                    label="Which day"
                    options={days}
                    value={form.closeDay}
                    onChange={(d) => patch({ closeDay: d, closeTime: form.closeTime })}
                  />
                  <select id="pf-close-time" className="pf-input pf-select" value={form.closeTime} onChange={(e) => set('closeTime', e.target.value)}>
                    {!times.some((t) => t.key === form.closeTime) && <option value="">Choose a time</option>}
                    {times.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              </Field>
            </div>
          )}
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
      <div className={`pf-sizes${form.sizesOn ? ' is-on' : ''}`} data-invalid={errors.sizes ? 'true' : undefined}>
        <Switch
          checked={form.sizesOn}
          onChange={toggleSizes}
          label="It comes in sizes with their own prices"
          sub="e.g. Good for 3-4: ₱350, Good for 6-8: ₱650"
        />
        {form.sizesOn && (
          <>
            {form.sizes.map((r, i) => (
              <div className="pf-size-row" key={r.key}>
                <input
                  className="pf-input"
                  value={r.name}
                  maxLength={80}
                  onChange={(e) => editSize(r.key, 'name', e.target.value)}
                  placeholder={i === 0 ? 'e.g. Good for 3-4 people' : 'e.g. Good for 6-8 people'}
                  aria-label={`Size ${i + 1}`}
                />
                <MoneyInput
                  value={r.price}
                  onChange={(v) => editSize(r.key, 'price', v)}
                  placeholder={i === 0 ? '350' : '650'}
                  label={`Price of size ${i + 1}`}
                />
                <button type="button" className="pf-size-remove" onClick={() => removeSize(r.key)} aria-label={`Remove size ${i + 1}`}>
                  <X size={16} weight="bold" />
                </button>
              </div>
            ))}
            {form.sizes.length < MAX_SIZES && (
              <button type="button" className="pf-tier-add" onClick={() => patch({ sizes: [...form.sizes, emptySize()] })}>
                <Plus size={14} weight="bold" /> Add a size
              </button>
            )}
            {lowest && rows.length > 1 && <p className="pf-hint">Buyers see <strong>from {peso(lowest)}</strong> and pay the price of the size they pick.</p>}
            <FieldError text={errors.sizes} />
          </>
        )}
      </div>

      <ServesField
        form={form}
        set={set}
        required
        error={errors.serves}
        hint={form.sizesOn ? 'For the smallest size.' : null}
      />

      <Field label="How long to cook it?" required error={errors.prepMin} htmlFor="pf-prep">
        <div className="pf-range">
          <select
            id="pf-prep"
            className={`pf-input pf-select${errors.prepMin ? ' is-invalid' : ''}`}
            value={form.prepMin}
            onChange={(e) => {
              const v = e.target.value;
              patch({ prepMin: v, prepMax: Number(form.prepMax) > Number(v) ? form.prepMax : '' });
            }}
          >
            <option value="">Choose</option>
            {COOK_PREP.map((m) => <option key={m} value={String(m)}>{minutesLabel(m)}</option>)}
          </select>
          <span>up to</span>
          <select
            className="pf-input pf-select"
            value={form.prepMax}
            onChange={(e) => set('prepMax', e.target.value)}
            aria-label="Up to how long (optional)"
            disabled={!form.prepMin}
          >
            <option value="">Same time</option>
            {maxChoices.map((m) => <option key={m} value={String(m)}>{minutesLabel(m)}</option>)}
          </select>
        </div>
      </Field>

      <Field label="Minimum order" required error={errors.minOrder} htmlFor="pf-min-order" hint="The fewest a buyer can order. Most keep it at 1.">
        <Stepper id="pf-min-order" value={form.minOrder} onChange={(v) => set('minOrder', v)} min={1} max={100} invalid={!!errors.minOrder} label="Minimum order" />
      </Field>

      {way}

      <OptionalHead />
      <Field label="Days you cook" optional hint="Buyers can order any day. You cook it on these days.">
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
        optional
        error={errors.orderBy}
        htmlFor="pf-order-by"
        hint="Later orders are cooked on your next cooking day."
      >
        <select id="pf-order-by" className="pf-input pf-select" value={form.orderBy} onChange={(e) => set('orderBy', e.target.value)}>
          <option value="">Any time</option>
          {timesWith(form.orderBy).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      <NotesField form={form} set={set} placeholder="e.g. Choose grilled or sinigang in your message. Bring your own container for pickup." />
    </>
  );
}

/* ── Live animal ─────────────────────────────────────────────────── */
function AnimalDetails({ form, set, patch, errors, way }) {
  const heads = parseInt(form.stock, 10) || 0;
  const sexes = SEXES.map((s) => (s.key === 'MIXED'
    ? { ...s, disabled: heads <= 1, title: heads <= 1 ? 'For more than one head' : undefined }
    : s));

  return (
    <>
      <Field label="Animal" required error={errors.animal}>
        <Chips
          label="Animal"
          options={ANIMALS}
          value={form.animal}
          onChange={(a) => patch({ animal: a })}
        />
        {form.animal === 'OTHER' && (
          <input
            className="pf-input"
            value={form.animalName}
            maxLength={40}
            onChange={(e) => patch({ animalName: e.target.value, animal: form.animal })}
            placeholder="What animal? e.g. Quail"
            aria-label="What animal"
          />
        )}
      </Field>

      <Field
        label="How many heads?"
        required
        error={errors.stock}
        htmlFor="pf-heads"
        hint="Same age, sex and weight? List them together. Animals that differ go in their own listing."
      >
        <Stepper
          id="pf-heads"
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

      <Field label="Age" required error={errors.ageValue} htmlFor="pf-age">
        <div className="pf-age">
          <input
            id="pf-age"
            className={`pf-input${errors.ageValue ? ' is-invalid' : ''}`}
            type="number"
            inputMode="numeric"
            min="0"
            max="600"
            step="1"
            value={form.ageValue}
            onChange={(e) => set('ageValue', e.target.value)}
            placeholder="e.g. 8"
          />
          <select className="pf-input pf-select" value={form.ageUnit} onChange={(e) => set('ageUnit', e.target.value)} aria-label="Weeks, months or years">
            {AGE_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label} old</option>)}
          </select>
        </div>
      </Field>

      <Field label="Sex" required error={errors.sex}>
        <Chips label="Sex" options={sexes} value={form.sex} onChange={(s) => set('sex', s)} />
      </Field>

      <Field label="Approximate weight" required error={errors.liveWeight} htmlFor="pf-live-weight" hint={heads > 1 ? 'About how heavy each one is.' : 'About how heavy it is.'}>
        <div className="pf-unit">
          <input
            id="pf-live-weight"
            className={`pf-input${errors.liveWeight ? ' is-invalid' : ''}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={form.liveWeight}
            onChange={(e) => set('liveWeight', e.target.value)}
            placeholder="e.g. 65"
          />
          <span>kg</span>
        </div>
      </Field>

      {way}
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
    return <p className="pf-empty-step">Choose the category in Basics first. The questions here depend on what you sell.</p>;
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
