import { useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  CheckIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon,
} from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { PACKAGE_KINDS } from '../productKinds';
import {
  NAME_MAX, P, STOCK_MAX, aheadText, peso,
} from './pkfLib';
import {
  Field, Hint, PkfInput, Section,
} from './PkfBits';
import NoticeSelect from './NoticeSelect';

/*
 * Step 2 · Name and price (web PackageForm.jsx shows(2), PackageForm.css
 * .pkf-kinds, .pkf-money, .pkf-save, .pkf-count, .pkf-ways, .pkf-fixed,
 * ≤768px): what it is for, a name, one price and the saving, how many,
 * how early buyers must order, how buyers get it.
 */
export default function NamePriceStep({
  form, errors, set, onPickKind, worth, saved, percent, stockNumber, noticeChoices,
  askWay, shopMode, wayChoices, wayOn, courierNote, onSubmit, anchor,
}) {
  return (
    <Section title="Name and price" hint="Give it a name and one price for everything inside.">
      <Field label="What is the package for?" tag="Optional" hint="Pick one and we'll suggest a name.">
        <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="What the package is for">
          {PACKAGE_KINDS.map((k) => {
            const on = form.packageKind === k.key;
            return (
              <Pressable
                key={k.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onPickKind(k.key)}
                style={[styles.kind, on && styles.kindOn]}
              >
                <Text style={[styles.kindText, on && styles.kindTextOn]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field ref={anchor('name')} label="Package name" tag="Required" error={errors.name}>
        <PkfInput
          value={form.name}
          maxLength={NAME_MAX}
          onChangeText={(v) => set('name', v)}
          placeholder="e.g. Fiesta Food Package"
          autoComplete="off"
          returnKeyType="next"
          onSubmitEditing={onSubmit}
          error={!!errors.name}
        />
      </Field>

      <Field ref={anchor('price')} label="Package price" tag="Required" error={errors.price}>
        <MoneyInput value={form.price} onChange={(v) => set('price', v)} error={!!errors.price} onSubmit={onSubmit} />
        {!errors.price && worth > 0 ? (
          saved === null ? (
            <Hint>Bought one by one, these cost {peso(worth)}.</Hint>
          ) : saved > 0 ? (
            <View style={styles.save}>
              <CheckIcon size={15} weight="bold" color={P.greenDark} style={styles.saveIcon} />
              <Text style={[styles.saveText, styles.saveGood]}>
                Buyers save {peso(saved)}{percent >= 1 ? ` (${percent}%)` : ''} compared with buying each one ({peso(worth)}).
              </Text>
            </View>
          ) : saved === 0 ? (
            <Text style={styles.saveText}>Same as buying each one. A lower price gives buyers a reason to choose the package.</Text>
          ) : (
            <View style={styles.save}>
              <WarningIcon size={15} weight="fill" color={t.warning[700]} style={styles.saveIcon} />
              <Text style={[styles.saveText, styles.saveWarn]}>
                That is {peso(-saved)} more than buying each one ({peso(worth)}).
              </Text>
            </View>
          )
        ) : null}
      </Field>

      <Field
        ref={anchor('stock')}
        label="How many packages can you sell?"
        tag="Required"
        error={errors.stock}
        hint="Counted on its own: selling a package doesn't lower your products' stock."
      >
        <View style={styles.count}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="One less"
            accessibilityState={{ disabled: stockNumber <= 0 }}
            disabled={stockNumber <= 0}
            onPress={() => set('stock', String(Math.max(0, stockNumber - 1)))}
            style={styles.countBtn}
          >
            <MinusIcon size={18} weight="bold" color={stockNumber <= 0 ? t.neutral[300] : t.neutral[800]} />
          </Pressable>
          <CountInput value={form.stock} onChange={(v) => set('stock', v)} error={!!errors.stock} onSubmit={onSubmit} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="One more"
            onPress={() => set('stock', String(Math.min(STOCK_MAX, stockNumber + 1)))}
            style={styles.countBtn}
          >
            <PlusIcon size={18} weight="bold" color={t.neutral[800]} />
          </Pressable>
        </View>
      </Field>

      <Field label="How early must buyers order?" tag="Optional" hint="Useful for food you cook for the order.">
        <NoticeSelect
          value={form.noticeHours}
          onChange={(v) => set('noticeHours', v)}
          options={[
            { value: '', label: 'No need: buyers can order any time' },
            ...noticeChoices.map((h) => ({ value: h, label: `At least ${aheadText(h)} ahead` })),
          ]}
        />
      </Field>

      <Field
        label="How buyers get it"
        tag={askWay ? 'Optional' : null}
        hint={askWay ? null : `Your shop offers ${shopMode === 'PICKUP' ? 'pickup' : 'delivery'} only.`}
      >
        {askWay ? (
          <View style={styles.ways} accessibilityRole="radiogroup" accessibilityLabel="How buyers get it">
            {wayChoices.map((w) => {
              const on = wayOn(w.key);
              return (
                <Pressable
                  key={w.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => set('fulfillment', w.key)}
                  style={[styles.way, on && styles.wayOn]}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.wayText}>
                    <Text style={styles.wayLabel}>{w.label}</Text>
                    <Text style={styles.wayHint}>{w.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.fixed}>
            <Text style={styles.fixedText}>{shopMode === 'PICKUP' ? 'Buyers pick it up from you.' : 'You deliver it to buyers.'}</Text>
          </View>
        )}
        {courierNote ? (
          <View style={styles.note}>
            <InfoIcon size={14} color={t.info[700]} style={styles.noteIcon} />
            <Text style={styles.noteText}>
              Couriers can&apos;t take this package: it has cooked food or items with no weight. Buyers get it by pickup or your own delivery.
            </Text>
          </View>
        ) : null}
      </Field>
    </Section>
  );
}

/** ₱ then the price (.pkf-money): green while typing, red on an error. */
function MoneyInput({ value, onChange, error, onSubmit }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.money, focused && styles.focus, error && styles.bad]}>
      <Text style={styles.moneySign}>₱</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="e.g. 2500"
        placeholderTextColor={t.neutral[400]}
        accessibilityLabel="Package price"
        returnKeyType="next"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.moneyInput}
      />
    </View>
  );
}

/** The big count box between − and + (.pkf-count input). */
function CountInput({ value, onChange, error, onSubmit }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="number-pad"
      placeholder="e.g. 5"
      placeholderTextColor={t.neutral[400]}
      accessibilityLabel="How many packages can you sell?"
      returnKeyType="next"
      onSubmitEditing={onSubmit}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.countInput, focused && styles.focus, error && styles.bad]}
    />
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1.5,
    borderColor: P.line,
    borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  kindOn: { borderColor: P.green, backgroundColor: P.green },
  kindText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700], ...font(500) },
  kindTextOn: { color: '#fff' },

  money: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  moneySign: { paddingLeft: 14, fontSize: 16, lineHeight: 25.6, color: P.muted, ...font(600) },
  moneyInput: {
    flex: 1, minWidth: 0, height: 44, paddingVertical: 0, paddingLeft: 6, paddingRight: 14, color: P.ink, fontSize: 16, ...font(400),
  },
  focus: { borderColor: P.green },
  bad: { borderColor: P.danger },

  save: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  saveIcon: { marginTop: 2 },
  saveText: { flex: 1, fontSize: 13, lineHeight: 18.85, color: P.muted, ...font(400) },
  saveGood: { color: P.greenDark, ...font(500) },
  saveWarn: { color: t.warning[700] },

  count: { flexDirection: 'row', gap: 8 },
  countBtn: {
    width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: t.neutral[100],
  },
  countInput: {
    flex: 1,
    minWidth: 0,
    height: 52,
    paddingVertical: 0,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 12,
    color: P.ink,
    fontSize: 18,
    textAlign: 'center',
    ...font(600),
  },

  ways: { gap: 8 },
  way: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: P.line,
    borderRadius: 14,
    backgroundColor: t.neutral[0],
  },
  wayOn: { borderColor: P.green, backgroundColor: P.greenSoft },
  radio: {
    width: 20, height: 20, marginTop: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.neutral[300], borderRadius: 10, backgroundColor: '#fff',
  },
  radioOn: { borderColor: P.green },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: P.green },
  wayText: { flex: 1, minWidth: 0, gap: 2 },
  wayLabel: { fontSize: 14, lineHeight: 22.4, color: P.ink, ...font(500) },
  wayHint: { fontSize: 12.5, lineHeight: 16.875, color: P.muted, ...font(400) },

  fixed: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.neutral[50] },
  fixedText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700], ...font(400) },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.info[50],
  },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18.125, color: t.info[700], ...font(400) },
});
