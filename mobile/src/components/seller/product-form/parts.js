import {
  createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CaretDownIcon, CheckIcon, MinusIcon, PlusIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { SelectSheet } from '../../Select';
import { clock } from './formState';

/*
 * Small building blocks the product form's steps share (web
 * components/seller/product-form/parts.jsx + ProductForm.css, phones): a
 * field with its label and error, radio cards, chips, switches, a number
 * stepper, money input, a row that opens to show more, and the form's own
 * text input and dropdown (.pf-input / .pf-select).
 */

export const PF = {
  green: t.primary[600],
  greenDark: t.primary[700],
  greenSoft: t.primary[50],
  line: t.neutral[200],
  ink: t.neutral[900],
  muted: t.neutral[500],
  danger: t.danger[600],
};

/* ── Bringing the first problem into view ───────────────────────────
 * The website scrolls to the first [data-invalid="true"] after a failed
 * check. Here every part that can be invalid reports itself (its View) once
 * per failed check; the form measures them and scrolls to the highest. */
export const InvalidScrollContext = createContext(null);

/** A ref for a part that may hold a problem: reported to the form after a failed check. */
export function useInvalidTarget(invalid) {
  const ref = useRef(null);
  const ctx = useContext(InvalidScrollContext);
  const attempt = ctx?.attempt || 0;
  useEffect(() => {
    if (attempt && invalid && ctx) ctx.report(ref);
    // Only a new failed check (or a step opening after one) scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return ref;
}

// Inputs inside a field with a problem get the red border (.pf-field.has-error .pf-input).
const FieldInvalid = createContext(false);

export function FieldError({ text }) {
  if (!text) return null;
  return <Text style={s.error} accessibilityRole="alert">{text}</Text>;
}

/** The field's label: `required` adds the *, `optional` a quiet "Optional". */
export function FieldLabel({ label, required, optional, aside }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>
        {label}
        {required ? <Text style={s.req}> *</Text> : null}
      </Text>
      {optional ? <Text style={s.opt}>Optional</Text> : null}
      <View style={s.flex} />
      {aside ? <Text style={s.aside}>{aside}</Text> : null}
    </View>
  );
}

/**
 * A labelled field. The website hides "Optional" on fields under the
 * "Optional" divider; callers there simply leave `optional` out.
 */
export function Field({ label, required, optional, error, hint, aside, children, style }) {
  const ref = useInvalidTarget(!!error);
  return (
    <View ref={ref} style={[s.field, style]}>
      {label ? <FieldLabel label={label} required={required} optional={optional} aside={aside} /> : null}
      <FieldInvalid.Provider value={!!error}>{children}</FieldInvalid.Provider>
      {error ? <FieldError text={error} /> : hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

export function Hint({ children, style }) {
  return <Text style={[s.hint, style]}>{children}</Text>;
}

/** "Optional" divider: what follows can be left empty. */
export function OptionalHead({ children = 'Optional' }) {
  return (
    <View style={s.optHead}>
      <Text style={s.optHeadText}>{String(children).toUpperCase()}</Text>
      <View style={s.optHeadLine} />
    </View>
  );
}

/** The form's text input (.pf-input): green border while typing, red with a problem. */
export const PfInput = forwardRef(function PfInput({
  invalid, multiline, short, small, style, onFocus, onBlur, ...rest
}, ref) {
  const inField = useContext(FieldInvalid);
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={t.neutral[400]}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      style={[
        s.input,
        multiline && s.textarea,
        multiline && short && s.textareaShort,
        small && s.inputSm,
        focused && s.inputFocus,
        (invalid || inField) && s.inputInvalid,
        style,
      ]}
      {...rest}
    />
  );
});

/**
 * The form's dropdown (.pf-input.pf-select on the website's ui/Select): a
 * field with the chosen option and a caret; the options open in the bottom
 * sheet. options: [{ value, label }]; a '' value is the "nothing yet" line.
 * title: the sheet's title (the website's aria-label, if any).
 */
export function PfSelect({
  value, options, onChange, title, placeholder, disabled, invalid, style, accessibilityLabel,
}) {
  const inField = useContext(FieldInvalid);
  const [open, setOpen] = useState(false);
  const current = value === undefined || value === null ? '' : String(value);
  const selected = options.find((o) => String(o.value) === current);
  const isPlaceholder = !selected || selected.value === '';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[s.input, s.select, open && s.inputFocus, (invalid || inField) && s.inputInvalid, disabled && s.selectOff, style]}
      >
        <Text style={[s.selectValue, isPlaceholder && s.selectPlaceholder]} numberOfLines={1}>
          {selected ? selected.label : (placeholder || '')}
        </Text>
        <View style={open ? s.caretOpen : null}>
          <CaretDownIcon size={14} weight="bold" color={PF.muted} />
        </View>
      </Pressable>
      <SelectSheet
        open={open}
        title={title}
        options={options.map((o) => ({ ...o, value: String(o.value) }))}
        value={current}
        onPick={(v) => { setOpen(false); if (v !== current) onChange(v); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** One answer out of a few, as cards: [{ key, label, hint }]. */
export function RadioCards({ options, value, onChange, label, invalid }) {
  return (
    <View style={s.cards} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={String(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!o.disabled }}
            disabled={o.disabled}
            onPress={() => onChange(o.key)}
            style={[s.card, invalid && s.cardInvalid, on && s.cardOn]}
          >
            <Radio on={on} />
            <View style={s.cardText}>
              <Text style={s.cardTitle}>{o.label}</Text>
              {o.hint ? <Text style={s.cardHint}>{o.hint}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The round radio of a card (.pf-radio). */
export function Radio({ on }) {
  return <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>;
}

/** One answer out of 2-3 short ones, as a row of equal buttons: [{ key, label }]. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={String(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            disabled={o.disabled}
            onPress={() => onChange(o.key)}
            style={[s.segBtn, on && s.segBtnOn]}
          >
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tap-to-pick chips. One value (`value`), or several (`values` + multi). */
export function Chips({ options, value, values, onChange, label, multi = false, size = 'md' }) {
  const sm = size === 'sm';
  return (
    <View style={s.pick} accessibilityRole={multi ? undefined : 'radiogroup'} accessibilityLabel={label}>
      {options.map((o) => {
        const on = multi ? (values || []).includes(o.key) : value === o.key;
        return (
          <Pressable
            key={String(o.key)}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on, disabled: !!o.disabled }}
            accessibilityLabel={o.title || undefined}
            disabled={o.disabled}
            onPress={() => onChange(o.key)}
            style={[s.pickChip, sm && s.pickChipSm, on && s.pickChipOn, o.disabled && s.pickChipOff]}
          >
            <Text style={[s.pickText, sm && s.pickTextSm, on && s.pickTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Switch({ checked, onChange, label, sub }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={s.switch}
    >
      <View style={[s.track, checked && s.trackOn]}>
        <View style={[s.knob, checked && s.knobOn]} />
      </View>
      <View style={s.switchText}>
        <Text style={s.switchTitle}>{label}</Text>
        {sub ? <Text style={s.switchSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** ₱ in front of the amount. */
export function MoneyInput({ value, onChange, placeholder = '0.00', invalid, small, label, style }) {
  const inField = useContext(FieldInvalid);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.money, small && s.moneySm, focused && s.inputFocus, (invalid || inField) && s.inputInvalid, style]}>
      <Text style={[s.moneySign, small && s.moneySignSm]}>₱</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={t.neutral[400]}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[s.moneyInput, small && s.moneyInputSm]}
      />
    </View>
  );
}

/** A number with its unit after it (.pf-unit): "65 kg". */
export function UnitInput({ value, onChange, placeholder, unit = 'kg', invalid, keyboardType = 'decimal-pad' }) {
  return (
    <View style={s.unit}>
      <PfInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        invalid={invalid}
        style={s.flex}
      />
      <Text style={s.unitText}>{unit}</Text>
    </View>
  );
}

/** A whole number with − and + on its sides. */
export function Stepper({ value, onChange, min = 0, max = 10000, invalid, label, unit }) {
  const inField = useContext(FieldInvalid);
  const [focused, setFocused] = useState(false);
  const n = parseInt(value, 10);
  const step = (d) => {
    const base = Number.isFinite(n) ? n : min;
    onChange(String(Math.min(max, Math.max(min, base + d))));
  };
  const lessOff = Number.isFinite(n) && n <= min;
  const moreOff = Number.isFinite(n) && n >= max;
  return (
    <View style={s.stepper} accessibilityLabel={label}>
      <Pressable accessibilityRole="button" accessibilityLabel="One less" disabled={lessOff} onPress={() => step(-1)} style={s.stepBtn}>
        <MinusIcon size={18} weight="bold" color={lessOff ? t.neutral[400] : PF.ink} />
      </Pressable>
      <View style={[s.stepField, focused && s.inputFocus, (invalid || inField) && s.inputInvalid]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          placeholder={String(min)}
          placeholderTextColor={t.neutral[400]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={s.stepInput}
        />
        {unit ? <Text style={s.stepUnit}>{unit}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="One more" disabled={moreOff} onPress={() => step(1)} style={s.stepBtn}>
        <PlusIcon size={18} weight="bold" color={moreOff ? t.neutral[400] : PF.ink} />
      </Pressable>
    </View>
  );
}

/** A row that opens to show its options; `summary` says what is set while closed. */
export function MoreRow({ title, summary, open, onToggle, invalid, children }) {
  const ref = useInvalidTarget(!!invalid);
  return (
    <View ref={ref} style={[s.more, invalid && s.moreInvalid]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={s.moreHead}>
        <View style={s.moreText}>
          <Text style={s.moreTitle}>{title}</Text>
          {summary ? <Text style={s.moreSummary} numberOfLines={1}>{summary}</Text> : null}
        </View>
        <View style={open ? s.caretOpen : null}>
          <CaretDownIcon size={18} color={PF.muted} />
        </View>
      </Pressable>
      {open ? <View style={s.moreBody}>{children}</View> : null}
    </View>
  );
}

/** Tap-one suggestions under a field (.pf-suggest). */
export function Suggest({ label, items, isOn, onPick, plus = false }) {
  return (
    <View style={s.suggest}>
      <Text style={s.suggestLabel}>{label}</Text>
      {items.map((it) => {
        const on = isOn ? isOn(it) : false;
        return (
          <Pressable key={it} accessibilityRole="button" onPress={() => onPick(it)} style={[s.suggestBtn, on && s.suggestBtnOn]}>
            <Text style={[s.suggestText, on && s.suggestTextOn]}>{plus ? `+ ${it}` : it}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A checkbox (the sale's "Put it on sale": the browser's box in the danger red). */
export function Checkbox({ checked, color = t.danger[600] }) {
  return (
    <View style={[s.check, checked && { backgroundColor: color, borderColor: color }]}>
      {checked ? <CheckIcon size={12} weight="bold" color="#fff" /> : null}
    </View>
  );
}

/* ── A date and time (the website's datetime-local input) ──────────
 * The app has no date picker of its own: a day and a half-hour time, each
 * from the form's dropdown. The value stays the website's
 * "YYYY-MM-DDTHH:MM" (the device's time), '' while not set. */
const pad = (n) => String(n).padStart(2, '0');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (d, today) => {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const year = d.getFullYear() !== today.getFullYear() ? `, ${d.getFullYear()}` : '';
  return `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
};
const ALL_TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

export function DateTimeField({ value, onChange, title }) {
  const [dayPart, timePart] = (value || '').split('T');
  const [day, setDay] = useState(dayPart || '');
  const [time, setTime] = useState(timePart || '');
  // The value from outside wins (a product opened, a field cleared).
  useEffect(() => {
    setDay(dayPart || '');
    setTime(timePart || '');
  }, [dayPart, timePart]);

  const days = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const list = Array.from({ length: 61 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      return { value: dayKey(d), label: dayLabel(d, today) };
    });
    if (day && !list.some((o) => o.value === day)) {
      const [y, m, dd] = day.split('-').map(Number);
      list.unshift({ value: day, label: dayLabel(new Date(y, m - 1, dd), today) });
    }
    return [{ value: '', label: 'Not set' }, ...list];
  }, [day]);
  const times = useMemo(() => {
    const list = ALL_TIMES.map((k) => ({ value: k, label: clock(k) }));
    if (time && !ALL_TIMES.includes(time)) list.push({ value: time, label: clock(time) || time });
    return list.sort((a, b) => a.value.localeCompare(b.value));
  }, [time]);

  const emit = (d, tm) => onChange(d && tm ? `${d}T${tm}` : '');
  return (
    <View style={s.dateRow}>
      <PfSelect
        title={title ? `${title}: day` : 'Day'}
        value={day}
        options={days}
        placeholder="Not set"
        onChange={(d) => { setDay(d); if (!d) setTime(''); emit(d, d ? time : ''); }}
        style={s.dateDay}
      />
      <PfSelect
        title={title ? `${title}: time` : 'Time'}
        value={time}
        options={times}
        placeholder="Time"
        disabled={!day}
        onChange={(tm) => { setTime(tm); emit(day, tm); }}
        style={s.dateTime}
      />
    </View>
  );
}

/** Shared text styles for the steps. */
export const pfText = StyleSheet.create({
  muted: { color: PF.muted },
  strong: { ...font(700), color: PF.ink },
});

const s = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: 6, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(600) },
  req: { color: PF.danger },
  opt: {
    paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.neutral[100], color: PF.muted, fontSize: 11.5, lineHeight: 16, ...font(600),
  },
  aside: { fontSize: 12, lineHeight: 19, color: t.neutral[500], fontVariant: ['tabular-nums'], ...font(400) },
  hint: { fontSize: 12.5, lineHeight: 18, color: PF.muted, ...font(400) },
  error: { fontSize: 13, lineHeight: 18.2, color: PF.danger, ...font(500) },

  optHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  optHeadText: { fontSize: 12, lineHeight: 19, letterSpacing: 0.48, color: t.neutral[500], ...font(700) },
  optHeadLine: { flex: 1, height: 1, backgroundColor: PF.line },

  input: {
    width: '100%', minWidth: 0, minHeight: 46, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 12, backgroundColor: t.neutral[0],
    color: PF.ink, fontSize: 16, lineHeight: 21, ...font(400),
  },
  inputFocus: { borderColor: PF.green },
  inputInvalid: { borderColor: PF.danger },
  inputSm: { minHeight: 42, paddingVertical: 8, paddingHorizontal: 12 },
  textarea: { minHeight: 104, lineHeight: 24, paddingTop: 10 },
  textareaShort: { minHeight: 72 },

  select: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14 },
  selectValue: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20.8, color: PF.ink, ...font(400) },
  selectPlaceholder: { color: t.neutral[500] },
  selectOff: { opacity: 0.55 },
  caretOpen: { transform: [{ rotate: '180deg' }] },

  cards: { gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, minWidth: 0, paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: PF.line, borderRadius: 14, backgroundColor: t.neutral[0],
  },
  cardInvalid: { borderColor: t.danger[300] },
  cardOn: { borderColor: PF.green, backgroundColor: PF.greenSoft },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: 14.5, lineHeight: 23.2, color: PF.ink, ...font(600) },
  cardHint: { fontSize: 12.5, lineHeight: 17.5, color: PF.muted, ...font(400) },
  radio: {
    width: 20, height: 20, marginTop: 1, borderWidth: 2, borderColor: t.neutral[300], borderRadius: 10,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: PF.green },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: PF.green },

  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: t.neutral[100] },
  segBtn: { flex: 1, minHeight: 42, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: t.neutral[0], boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(15, 23, 42, 0.12)' }] },
  segText: { fontSize: 13.5, lineHeight: 16.2, color: t.neutral[600], textAlign: 'center', ...font(500) },
  segTextOn: { color: PF.greenDark, ...font(600) },

  pick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickChip: {
    minHeight: 42, paddingHorizontal: 16, borderWidth: 1.5, borderColor: PF.line, borderRadius: 999,
    backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  pickChipSm: { minHeight: 40, paddingHorizontal: 13 },
  pickChipOn: { borderColor: PF.green, backgroundColor: PF.green },
  pickChipOff: { opacity: 0.45 },
  pickText: { fontSize: 14.5, lineHeight: 20, color: t.neutral[700], ...font(500) },
  pickTextSm: { fontSize: 14 },
  pickTextOn: { color: '#fff' },

  switch: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  track: { width: 44, height: 26, borderRadius: 999, backgroundColor: t.neutral[300] },
  trackOn: { backgroundColor: PF.green },
  knob: {
    position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(15, 23, 42, 0.25)' }],
  },
  knobOn: { transform: [{ translateX: 18 }] },
  switchText: { flex: 1, minWidth: 0, gap: 1 },
  switchTitle: { fontSize: 14, lineHeight: 22.4, color: PF.ink, ...font(600) },
  switchSub: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(400) },

  money: {
    flexDirection: 'row', alignItems: 'center', minWidth: 0, minHeight: 46,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  moneySm: { minHeight: 42 },
  moneySign: { paddingLeft: 14, color: PF.muted, fontSize: 16, lineHeight: 22, ...font(600) },
  moneySignSm: { paddingLeft: 10 },
  moneyInput: {
    flex: 1, minWidth: 0, height: 44, paddingVertical: 0, paddingLeft: 6, paddingRight: 14,
    color: PF.ink, fontSize: 16, ...font(400),
  },
  moneyInputSm: { height: 40 },

  unit: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 },
  unitText: { color: PF.muted, fontSize: 15, lineHeight: 24, ...font(600) },

  stepper: { flexDirection: 'row', gap: 8 },
  stepBtn: { width: 50, height: 48, borderRadius: 12, backgroundColor: t.neutral[100], alignItems: 'center', justifyContent: 'center' },
  stepField: {
    flex: 1, minWidth: 0, height: 48, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  stepInput: {
    flexGrow: 1, flexShrink: 1, minWidth: 24, paddingVertical: 0, color: PF.ink, fontSize: 16, textAlign: 'center', ...font(600),
  },
  stepUnit: { flexShrink: 0, color: PF.muted, fontSize: 14, lineHeight: 22.4, ...font(400) },

  more: { borderWidth: 1, borderColor: PF.line, borderRadius: 14, backgroundColor: t.neutral[0] },
  moreInvalid: { borderColor: t.danger[300] },
  moreHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 60, paddingVertical: 12, paddingHorizontal: 16 },
  moreText: { flex: 1, minWidth: 0, gap: 2 },
  moreTitle: { fontSize: 15, lineHeight: 24, color: PF.ink, ...font(600) },
  moreSummary: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(400) },
  moreBody: { gap: 14, paddingHorizontal: 16, paddingBottom: 16 },

  suggest: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  suggestLabel: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(400) },
  suggestBtn: {
    minHeight: 32, paddingHorizontal: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300],
    borderRadius: 999, backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  suggestBtnOn: { borderStyle: 'solid', borderColor: PF.green, backgroundColor: PF.greenSoft },
  suggestText: { fontSize: 13, lineHeight: 18, color: t.neutral[700], ...font(400) },
  suggestTextOn: { color: PF.greenDark },

  check: {
    width: 18, height: 18, marginTop: 2, borderWidth: 1.5, borderColor: t.neutral[500], borderRadius: 3,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },

  dateRow: { flexDirection: 'row', gap: 8 },
  dateDay: { flex: 1.4 },
  dateTime: { flex: 1 },
});

export { s as partStyles };
