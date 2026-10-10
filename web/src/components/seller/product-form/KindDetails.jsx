import { Link } from 'react-router-dom';
import { Plus, X, CalendarCheck } from '@phosphor-icons/react';
import { ANIMALS, AGE_UNITS, SEXES, WEEKDAYS } from '../../../lib/productKinds';
import {
  Field, FieldError, OptionalHead, Chips, Switch, MoneyInput, Stepper,
} from './parts';
import {
  READY_PREP, COOK_PREP, COOK_PREP_MAX, SERVES_EXAMPLES, NOTES_MAX, MAX_SIZES, TODAY_MAX,
  minutesLabel, clock, peso, emptySize, sizeRows,
} from './formState';
import Select from '../../ui/Select';

/*
 * The questions only some kinds have: today's cooked food, paluto (cooked
 * to order) and live animals. Regular goods have none.
 */

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

function NotesField({ form, set, example }) {
  return (
    <Field
      label="Anything else buyers should know?"
      htmlFor="pf-notes"
      aside={form.notes.length > NOTES_MAX - 60 ? `${form.notes.length}/${NOTES_MAX}` : null}
      hint={example}
    >
      <textarea
        id="pf-notes"
        className="pf-input pf-textarea pf-textarea--short"
        rows={2}
        maxLength={NOTES_MAX}
        value={form.notes}
        onChange={(e) => set('notes', e.target.value)}
      />
    </Field>
  );
}

function ServesField({ form, set, error, required, hint }) {
  return (
    <Field label="Good for how many people?" required={required} error={error} htmlFor="pf-serves" hint={hint}>
      <div className="pf-suggest pf-suggest--top">
        {SERVES_EXAMPLES.map((s) => (
          <button type="button" key={s} className={form.serves === s ? 'is-on' : ''} onClick={() => set('serves', s)}>{s}</button>
        ))}
      </div>
      <input
        id="pf-serves"
        className="pf-input"
        value={form.serves}
        maxLength={60}
        onChange={(e) => set('serves', e.target.value)}
        placeholder="Tap one above, or type it"
        autoComplete="off"
      />
    </Field>
  );
}

/* ── Ready to eat today ──────────────────────────────────────────── */
function ReadyDetails({ form, set, patch, errors, editing }) {
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
            <strong>You set how many and until when each day</strong>
            <span>Post it, change how many are left, or stop orders early from Today&apos;s menu.</span>
            <Link to="/seller/today" className="pf-today-link">Open Today&apos;s menu</Link>
          </div>
        </div>
      ) : (
        <>
          <Switch
            checked={form.postToday}
            onChange={(on) => set('postToday', on)}
            label="I have it today"
            sub={form.postToday ? 'Buyers can order it as soon as you save.' : 'Post it from Today’s menu on the days you cook it.'}
          />
          {form.postToday && (
            <div className="pf-today">
              <Field label="How many servings today?" required error={errors.todayQty} htmlFor="pf-today-qty">
                <Stepper id="pf-today-qty" value={form.todayQty} onChange={(v) => set('todayQty', v)} min={1} max={TODAY_MAX} invalid={!!errors.todayQty} label="How many servings today" />
              </Field>
              <Field label="Ready how soon after someone orders?" required htmlFor="pf-today-prep">
                <Select id="pf-today-prep" className="pf-input pf-select" value={form.todayPrep} onChange={(e) => set('todayPrep', e.target.value)}>
                  {READY_PREP.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </Field>
              <Field label="Buyers can order until" required error={errors.closeTime} htmlFor="pf-close-time">
                <div className="pf-close">
                  <Chips
                    label="Which day"
                    options={days}
                    value={form.closeDay}
                    onChange={(d) => patch({ closeDay: d, closeTime: form.closeTime })}
                  />
                  <Select id="pf-close-time" className="pf-input pf-select" value={form.closeTime} onChange={(e) => set('closeTime', e.target.value)}>
                    {!times.some((t) => t.key === form.closeTime) && <option value="">Choose a time</option>}
                    {times.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </Select>
                </div>
              </Field>
            </div>
          )}
        </>
      )}
      <OptionalHead />
      <ServesField form={form} set={set} />
    </>
  );
}

/* ── Paluto, cooked to order ─────────────────────────────────────── */
function PalutoDetails({ form, set, patch, errors }) {
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
      <ServesField
        form={form}
        set={set}
        required
        error={errors.serves}
        hint={form.sizesOn ? 'For the smallest size.' : null}
      />

      <div className={`pf-sizes${form.sizesOn ? ' is-on' : ''}`} data-invalid={errors.sizes ? 'true' : undefined}>
        <Switch
          checked={form.sizesOn}
          onChange={toggleSizes}
          label="Bigger sizes cost more"
          sub="Example: Good for 3-4 is ₱350, good for 6-8 is ₱650"
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
                  placeholder={i === 0 ? 'Good for 3-4 people' : 'Good for 6-8 people'}
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
            {lowest && rows.length > 1 && <p className="pf-hint">Buyers see <strong>from {peso(lowest)}</strong> and pay for the size they pick.</p>}
            <FieldError text={errors.sizes} />
          </>
        )}
      </div>

      <Field label="How long does it take to cook?" required error={errors.prepMin} htmlFor="pf-prep">
        <div className="pf-range">
          <Select
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
          </Select>
          <span>up to</span>
          <Select
            className="pf-input pf-select"
            value={form.prepMax}
            onChange={(e) => set('prepMax', e.target.value)}
            aria-label="Up to how long (you can leave it)"
            disabled={!form.prepMin}
          >
            <option value="">Same time</option>
            {maxChoices.map((m) => <option key={m} value={String(m)}>{minutesLabel(m)}</option>)}
          </Select>
        </div>
      </Field>

      <Field label="Fewest a buyer can order" required error={errors.minOrder} htmlFor="pf-min-order" hint="Most sellers keep it at 1.">
        <Stepper id="pf-min-order" value={form.minOrder} onChange={(v) => set('minOrder', v)} min={1} max={100} invalid={!!errors.minOrder} label="Fewest a buyer can order" />
      </Field>

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
        label="Last time to order for the day"
        error={errors.orderBy}
        htmlFor="pf-order-by"
        hint="Later orders are cooked on your next cooking day."
      >
        <Select id="pf-order-by" className="pf-input pf-select" value={form.orderBy} onChange={(e) => set('orderBy', e.target.value)}>
          <option value="">Any time</option>
          {timesWith(form.orderBy).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
      </Field>
      <NotesField form={form} set={set} example="Example: Say grilled or sinigang in your message. Bring your own container." />
    </>
  );
}

/* ── Live animal ─────────────────────────────────────────────────── */
function AnimalDetails({ form, set, patch, errors }) {
  const heads = parseInt(form.stock, 10) || 0;
  const sexes = SEXES.map((s) => (s.key === 'MIXED'
    ? { ...s, disabled: heads <= 1, title: heads <= 1 ? 'For more than one animal' : undefined }
    : s));

  return (
    <>
      <Field label="What animal?" required error={errors.animal}>
        <Chips
          label="What animal"
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
            placeholder="Type the animal, like Quail"
            aria-label="What animal"
          />
        )}
      </Field>

      <Field label="How old?" required error={errors.ageValue} htmlFor="pf-age" hint="Example: 8 months old">
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
          />
          <Select className="pf-input pf-select" value={form.ageUnit} onChange={(e) => set('ageUnit', e.target.value)} aria-label="Weeks, months or years">
            {AGE_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label} old</option>)}
          </Select>
        </div>
      </Field>

      <Field label="Male or female?" required error={errors.sex}>
        <Chips label="Male or female" options={sexes} value={form.sex} onChange={(s) => set('sex', s)} />
      </Field>

      <Field
        label={heads > 1 ? 'About how heavy is each one?' : 'About how heavy is it?'}
        required
        error={errors.liveWeight}
        htmlFor="pf-live-weight"
        hint="Example: 65 kg"
      >
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
          />
          <span>kg</span>
        </div>
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
      <NotesField form={form} set={set} example="Example: Vaccinated and dewormed. Fed with rice bran." />
    </>
  );
}

/**
 * The questions for the kind of product (none for regular goods).
 * @param {Object} props.ctx - kind, editing
 */
export default function KindDetails({ form, set, patch, errors, ctx }) {
  const props = { form, set, patch, errors };
  if (ctx.kind === 'READY_TO_EAT') return <ReadyDetails {...props} editing={ctx.editing} />;
  if (ctx.kind === 'COOK_TO_ORDER') return <PalutoDetails {...props} />;
  if (ctx.kind === 'LIVESTOCK') return <AnimalDetails {...props} />;
  return null;
}
