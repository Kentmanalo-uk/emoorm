import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlusIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import ChoiceGroup from './ChoiceGroup';
import Model3dNote from './Model3dNote';
import {
  Checkbox, DateTimeField, Field, FieldError, Hint, MoneyInput, MoreRow, PF, PfInput, Radio, RadioCards, UnitInput,
} from './parts';
import {
  CHOICE_TYPES, FOOD_CHOICE_TYPES, RETURN_POLICIES, MAX_GROUPS, peso,
} from './formState';

const FOOD = ['READY_TO_EAT', 'COOK_TO_ORDER'];

/*
 * Step 3 (web product-form/MoreStep.jsx): extras most products don't need,
 * each closed until opened: choices, a sale, bulk prices, weight and
 * returns (only those that fit the kind).
 */
export default function MoreStep({
  form, set, errors, kind, offers, by, couriersOn, open, onToggleRow,
  hasOptions, onHasOptions, groupActions, policyMode, onPolicy, onClearPolicy, product = null,
}) {
  const food = FOOD.includes(kind);
  const groups = hasOptions ? form.variations.filter((g) => g.name.trim() || g.choices.length) : [];
  const choicesSummary = groups.length
    ? groups.map((g) => `${g.name.trim() || 'Choice'}: ${g.choices.join(', ') || '…'}`).join(' · ')
    : 'None. It comes in one kind only.';
  const saleSummary = form.saleOn && Number(form.salePrice) > 0 ? `On sale at ${peso(form.salePrice)}` : 'Off';
  const tiers = form.priceTiers.filter((x) => x.minQty !== '' && x.price !== '');
  const bulkSummary = tiers.length ? tiers.map((x) => `${x.minQty}+ at ${peso(x.price)}`).join(', ') : 'Off';
  const policy = RETURN_POLICIES.find((p) => p.key === policyMode);
  const returnsSummary = policy ? policy.title : policyMode === 'custom' ? 'In your own words' : 'No return policy';
  const choiceErr = errors.options || Object.keys(errors).some((k) => k.startsWith('group-') && errors[k]);
  // The other choice type with photos per choice (only one can have them).
  const photosOn = (g) => {
    const other = form.variations.find((x) => x.key !== g.key && x.choices.some((c) => x.images?.[c]));
    return other ? other.name.trim() || 'the other choice type' : null;
  };
  const setTier = (i, field, v) => set('priceTiers', form.priceTiers.map((x, j) => (j === i ? { ...x, [field]: v } : x)));

  return (
    <View style={styles.list}>
      {offers.choices ? (
        <MoreRow
          title="Choices"
          summary={choicesSummary}
          open={open.includes('choices')}
          onToggle={() => onToggleRow('choices')}
          invalid={!!choiceErr}
        >
          <Hint>{food ? 'Does it come in different flavors or styles?' : 'Does it come in different sizes, weights or colors?'}</Hint>
          <RadioCards
            label="Does it come in different choices?"
            value={hasOptions}
            onChange={onHasOptions}
            options={[
              { key: false, label: 'No', hint: 'It comes in one kind only' },
              { key: true, label: 'Yes', hint: food ? 'e.g. Original and Spicy' : 'e.g. 250g and 1kg, or Small and Large' },
            ]}
          />
          <FieldError text={errors.options} />
          {hasOptions ? (
            <View style={styles.groups}>
              {form.variations.map((g, index) => (
                <ChoiceGroup
                  key={g.key}
                  group={g}
                  index={index}
                  count={form.variations.length}
                  error={errors[`group-${g.key}`]}
                  types={food ? FOOD_CHOICE_TYPES : CHOICE_TYPES}
                  noPrice={!offers.choicePrices}
                  noStock={!offers.choiceStock}
                  onChange={(change) => groupActions.update(g.key, change)}
                  onAddChoices={(raw) => groupActions.addChoices(g.key, raw)}
                  onRemoveChoice={(c) => groupActions.removeChoice(g.key, c)}
                  onToggle={(flag) => groupActions.toggleFlag(g.key, flag)}
                  onRemove={() => groupActions.remove(g.key)}
                  onPhoto={(c, url) => groupActions.setPhoto(g.key, c, url)}
                  photosOn={photosOn(g)}
                />
              ))}
              {form.variations.length < MAX_GROUPS ? (
                <Pressable accessibilityRole="button" onPress={groupActions.add} style={styles.addGroup}>
                  <PlusIcon size={16} color={PF.greenDark} />
                  <Text style={styles.addGroupText}>Add another choice type</Text>
                  <Text style={styles.addGroupSmall}>{food ? 'e.g. Rice as well as Flavor' : 'e.g. Color as well as Size'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </MoreRow>
      ) : null}

      {by ? (
        <Hint style={styles.note}>
          {by === 'sizes' ? 'Each size has its own price,' : 'Each choice has its own price,'} so there is no sale or bulk price. Lower those prices instead.
        </Hint>
      ) : (
        <>
          <MoreRow
            title="Sale price"
            summary={saleSummary}
            open={open.includes('sale')}
            onToggle={() => onToggleRow('sale')}
            invalid={!!errors.salePrice}
          >
            <View style={[styles.sale, form.saleOn && styles.saleOn]}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.saleOn }}
                onPress={() => set('saleOn', !form.saleOn)}
                style={styles.saleToggle}
              >
                <Checkbox checked={form.saleOn} />
                <View style={styles.saleToggleText}>
                  <Text style={styles.saleTitle}>Put it on sale</Text>
                  <Text style={styles.saleSub}>Buyers see the lower price with the regular one crossed out. Saved by buyers? They are told.</Text>
                </View>
              </Pressable>
              {form.saleOn ? (
                <View style={styles.grid}>
                  <Field label="Sale price" required error={errors.salePrice}>
                    <MoneyInput
                      value={form.salePrice}
                      onChange={(v) => set('salePrice', v)}
                      invalid={!!errors.salePrice}
                      placeholder={form.price ? `Lower than ${form.price}` : '0.00'}
                    />
                  </Field>
                  <Field label="Starts" optional hint="Empty: right away.">
                    <DateTimeField title="Starts" value={form.saleStartsAt} onChange={(v) => set('saleStartsAt', v)} />
                  </Field>
                  <Field label="Ends" optional hint="Empty: until you turn it off. Set it for a flash sale.">
                    <DateTimeField title="Ends" value={form.saleEndsAt} onChange={(v) => set('saleEndsAt', v)} />
                  </Field>
                </View>
              ) : null}
            </View>
          </MoreRow>

          <MoreRow
            title="Bulk prices"
            summary={bulkSummary}
            open={open.includes('bulk')}
            onToggle={() => onToggleRow('bulk')}
            invalid={!!errors.priceTiers}
          >
            <View style={styles.tiers}>
              <Hint>Lower prices when a buyer orders more, like 10 or more at ₱90 each.</Hint>
              {form.priceTiers.map((x, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <View style={styles.tier} key={i}>
                  <View style={styles.tierLabel}>
                    <Text style={styles.tierWord}>From</Text>
                    <PfInput
                      keyboardType="number-pad"
                      value={x.minQty}
                      placeholder="10"
                      accessibilityLabel={`Bulk price ${i + 1}: from how many`}
                      onChangeText={(v) => setTier(i, 'minQty', v)}
                      style={styles.tierQty}
                    />
                    <Text style={styles.tierWord}>{kind === 'LIVESTOCK' ? 'heads' : 'units'}</Text>
                  </View>
                  <MoneyInput
                    value={x.price}
                    label={`Bulk price ${i + 1}: price each`}
                    onChange={(v) => setTier(i, 'price', v)}
                    style={styles.tierMoney}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove this bulk price"
                    onPress={() => set('priceTiers', form.priceTiers.filter((_, j) => j !== i))}
                    style={styles.tierRemove}
                  >
                    <Text style={styles.tierRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
              {errors.priceTiers ? <Text style={styles.tierError}>{errors.priceTiers}</Text> : null}
              {form.priceTiers.length < 4 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => set('priceTiers', [...form.priceTiers, { minQty: '', price: '' }])}
                  style={styles.tierAdd}
                >
                  <Text style={styles.tierAddText}>+ Add a bulk price</Text>
                </Pressable>
              ) : null}
            </View>
          </MoreRow>
        </>
      )}

      {offers.weight && !couriersOn ? (
        <MoreRow
          title="Weight with packaging"
          summary={form.weightKg ? `${form.weightKg} kg` : 'Not set. Needed only if you ship with couriers.'}
          open={open.includes('weight')}
          onToggle={() => onToggleRow('weight')}
          invalid={!!errors.weightKg}
        >
          <Field label="Weight with packaging" optional error={errors.weightKg} hint="Needed if you ship with couriers: they charge by weight.">
            <UnitInput value={form.weightKg} onChange={(v) => set('weightKg', v)} placeholder="e.g. 0.5" invalid={!!errors.weightKg} />
          </Field>
        </MoreRow>
      ) : null}

      <MoreRow
        title="Returns"
        summary={returnsSummary}
        open={open.includes('returns')}
        onToggle={() => onToggleRow('returns')}
      >
        <Hint>What can buyers do if something is wrong with it?</Hint>
        <View style={styles.policies} accessibilityRole="radiogroup" accessibilityLabel="Return policy">
          {[...RETURN_POLICIES, { key: 'custom', title: 'Write my own', hint: 'In your own words' }].map((p) => {
            const on = policyMode === p.key;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onPolicy(p.key)}
                style={[styles.policy, on && styles.policyOn]}
              >
                <Radio on={on} />
                <View style={styles.policyText}>
                  <Text style={styles.policyTitle}>{p.title}</Text>
                  <Text style={styles.policyHint}>{p.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {policyMode ? (
          <View style={styles.policyBox}>
            <Text style={styles.policyLabel}>What buyers will see</Text>
            <PfInput
              multiline
              maxLength={2000}
              value={form.returnPolicy}
              onChangeText={(v) => set('returnPolicy', v)}
              placeholder="e.g. Returns accepted within 7 days for damaged or wrong items."
              accessibilityLabel="What buyers will see"
            />
            <Hint>Buyers can ask for a return for as many days as your words say (for example “within 14 days”); 7 days when they don’t say.</Hint>
            <Pressable accessibilityRole="button" onPress={onClearPolicy} style={styles.link}>
              <Text style={styles.linkText}>No return policy</Text>
            </Pressable>
          </View>
        ) : null}
      </MoreRow>
      <Model3dNote product={product} kind={kind} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { gap: 10 },
  groups: { gap: 12 },
  addGroup: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 6, rowGap: 4,
    minHeight: 52, paddingVertical: 8, paddingHorizontal: 16,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 14,
  },
  addGroupText: { fontSize: 14, lineHeight: 22.4, color: PF.greenDark, ...font(600) },
  addGroupSmall: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(400) },
  note: { paddingVertical: 2, paddingHorizontal: 4 },

  sale: {
    gap: 14, padding: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 12,
  },
  saleOn: { borderStyle: 'solid', borderColor: t.danger[200], backgroundColor: t.danger[50] },
  saleToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  saleToggleText: { flex: 1, minWidth: 0 },
  saleTitle: { fontSize: 14, lineHeight: 22.4, color: t.neutral[900], ...font(600) },
  saleSub: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  grid: { gap: 16 },

  tiers: { gap: 8 },
  tier: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierWord: { fontSize: 13, lineHeight: 20.8, color: t.neutral[600], ...font(400) },
  tierQty: { width: 80 },
  tierMoney: { flex: 1, minWidth: 0 },
  tierRemove: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: t.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  tierRemoveText: { fontSize: 18, lineHeight: 22, color: t.neutral[500], ...font(400) },
  tierError: { fontSize: 12.5, lineHeight: 20, color: t.danger[700], ...font(400) },
  tierAdd: { alignSelf: 'flex-start', paddingVertical: 6 },
  tierAddText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(600) },

  policies: { gap: 10 },
  policy: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: PF.line, borderRadius: 14, backgroundColor: t.neutral[0],
  },
  policyOn: { borderColor: PF.green, backgroundColor: PF.greenSoft },
  policyText: { flex: 1, minWidth: 0, gap: 2 },
  policyTitle: { fontSize: 14.5, lineHeight: 23.2, color: PF.ink, ...font(600) },
  policyHint: { fontSize: 12.5, lineHeight: 17.5, color: PF.muted, ...font(400) },
  policyBox: { gap: 6 },
  policyLabel: { fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(600) },
  link: { alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 2, justifyContent: 'center' },
  linkText: { fontSize: 13, lineHeight: 20.8, color: PF.muted, textDecorationLine: 'underline', ...font(500) },
}));
