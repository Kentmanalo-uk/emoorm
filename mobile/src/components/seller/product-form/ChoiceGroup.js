import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlusIcon, TrashIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import {
  FieldError, Hint, MoneyInput, PF, PfInput, Suggest, Switch, useInvalidTarget,
} from './parts';
import ChoicePhotos from './ChoicePhotos';

/*
 * One choice type (like Weight: 250g, 1kg) with its choices, and optionally
 * a price and a stock count for each (web product-form/ChoiceGroup.jsx).
 * types: the usual choice types to tap (CHOICE_TYPES)
 * noPrice: the kind has one price for every choice
 * noStock: the kind keeps no stock per choice
 * onPhoto(choice, url | null): a photo per choice; photosOn: the other type that has them
 */
export default function ChoiceGroup({
  group, index, count, error, types, onChange, onAddChoices, onRemoveChoice, onToggle, onRemove,
  onPhoto, photosOn = null, noPrice = false, noStock = false,
}) {
  const ref = useInvalidTarget(!!error);
  const type = types.find((x) => x.name.toLowerCase() === group.name.trim().toLowerCase());
  const suggestions = (type?.suggestions || []).filter(
    (x) => !group.choices.some((c) => c.toLowerCase() === x.toLowerCase()),
  );
  const typeLabel = group.name.trim() || 'choice';
  const priced = group.priced && !noPrice;
  const stocked = group.stocked && !noStock;
  const showTable = (priced || stocked) && group.choices.length > 0;
  const canAdd = !!group.draft.trim();

  return (
    <View ref={ref} style={[styles.group, error && styles.groupInvalid]}>
      <View style={styles.top}>
        <Text style={styles.title}>{count > 1 ? `Choice type ${index + 1}` : 'Choice type'}</Text>
        <Pressable accessibilityRole="button" onPress={onRemove} style={styles.remove}>
          <TrashIcon size={14} color={PF.danger} />
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.typeChips} accessibilityLabel="Common choice types">
        {types.map((x) => {
          const on = x.name.toLowerCase() === group.name.trim().toLowerCase();
          return (
            <Pressable
              key={x.name}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange({ name: x.name })}
              style={[styles.typeChip, on && styles.typeChipOn]}
            >
              <Text style={[styles.typeChipText, on && styles.typeChipTextOn]}>{x.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <PfInput
        value={group.name}
        maxLength={80}
        onChangeText={(v) => onChange({ name: v })}
        placeholder="Or type your own, e.g. Flavor"
        accessibilityLabel="Choice type name"
      />

      <View style={styles.choices}>
        <Text style={styles.label}>Choices</Text>
        {group.choices.length > 0 ? (
          <View style={styles.chips}>
            {group.choices.map((c) => (
              <View style={styles.chip} key={c}>
                <Text style={styles.chipText}>{c}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${c}`} onPress={() => onRemoveChoice(c)} style={styles.chipX}>
                  <XIcon size={12} weight="bold" color={PF.greenDark} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.addRow}>
          <PfInput
            value={group.draft}
            maxLength={200}
            onChangeText={(v) => onChange({ draft: v })}
            onSubmitEditing={() => onAddChoices()}
            submitBehavior="submit"
            returnKeyType="done"
            placeholder={`Type one, e.g. ${type?.example || types[0]?.example || '250g'}`}
            accessibilityLabel="Add a choice"
            style={styles.addInput}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!canAdd}
            onPress={() => onAddChoices()}
            style={[styles.addBtn, !canAdd && styles.addBtnOff]}
          >
            <PlusIcon size={15} weight="bold" color={canAdd ? '#fff' : t.neutral[500]} />
            <Text style={[styles.addBtnText, !canAdd && styles.addBtnTextOff]}>Add</Text>
          </Pressable>
        </View>
        {suggestions.length > 0 ? (
          <Suggest label="Tap to add:" items={suggestions} plus onPick={(x) => onAddChoices(x)} />
        ) : null}
      </View>

      {!(noPrice && noStock) ? (
        <View style={styles.switches}>
          {!noPrice ? (
            <Switch
              checked={!!group.priced}
              onChange={() => onToggle('priced')}
              label="Each choice has its own price"
              sub="e.g. 250g ₱100, 1kg ₱300"
            />
          ) : null}
          {!noStock ? (
            <Switch
              checked={!!group.stocked}
              onChange={() => onToggle('stocked')}
              label="Each choice has its own stock"
              sub="Count how many of each you have"
            />
          ) : null}
        </View>
      ) : null}

      {(priced || stocked) && !group.choices.length ? (
        <Hint>Add the choices first, then fill in each one here.</Hint>
      ) : null}

      {showTable ? (
        <View style={styles.table}>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.headText, styles.nameCol]}>{typeLabel}</Text>
            {priced ? <Text style={[styles.headText, priced && stocked ? styles.priceColBoth : styles.priceCol]}>Price</Text> : null}
            {stocked ? <Text style={[styles.headText, priced ? styles.stockColBoth : styles.priceCol]}>Stock</Text> : null}
          </View>
          {group.choices.map((c) => (
            <View style={styles.row} key={c}>
              <Text style={[styles.name, styles.nameCol]}>{c}</Text>
              {priced ? (
                <MoneyInput
                  small
                  value={group.prices[c] ?? ''}
                  onChange={(v) => onChange((g) => ({ prices: { ...g.prices, [c]: v } }))}
                  label={`Price for ${c}`}
                  style={stocked ? styles.priceColBoth : styles.priceCol}
                />
              ) : null}
              {stocked ? (
                <PfInput
                  small
                  keyboardType="number-pad"
                  value={group.stocks[c] ?? ''}
                  onChangeText={(v) => onChange((g) => ({ stocks: { ...g.stocks, [c]: v } }))}
                  placeholder="0"
                  accessibilityLabel={`Stock for ${c}`}
                  style={priced ? styles.stockColBoth : styles.priceCol}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {onPhoto ? <ChoicePhotos group={group} onPhoto={onPhoto} photosOn={photosOn} /> : null}

      <FieldError text={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 12, minWidth: 0, paddingVertical: 14, paddingHorizontal: 12,
    borderWidth: 1, borderColor: PF.line, borderRadius: 14, backgroundColor: t.neutral[50],
  },
  groupInvalid: { borderColor: t.danger[300] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 14, lineHeight: 22.4, color: PF.ink, ...font(500) },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 2 },
  removeText: { fontSize: 13, lineHeight: 20.8, color: PF.danger, ...font(500) },

  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    minHeight: 38, paddingHorizontal: 16, borderWidth: 1.5, borderColor: PF.line, borderRadius: 999,
    backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  typeChipOn: { borderColor: PF.green, backgroundColor: PF.green },
  typeChipText: { fontSize: 14, lineHeight: 20, color: t.neutral[700], ...font(500) },
  typeChipTextOn: { color: '#fff' },

  choices: { gap: 8, minWidth: 0 },
  label: { fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(600) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', minHeight: 34,
    paddingLeft: 12, paddingRight: 4, borderRadius: 999, backgroundColor: PF.greenSoft,
  },
  chipText: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: PF.greenDark, ...font(600) },
  chipX: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8, minWidth: 0 },
  addInput: { flex: 1, width: 'auto' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 46, paddingHorizontal: 16,
    borderRadius: 12, backgroundColor: PF.green,
  },
  addBtnOff: { backgroundColor: t.neutral[200] },
  addBtnText: { fontSize: 14, lineHeight: 20, color: '#fff', ...font(600) },
  addBtnTextOff: { color: t.neutral[500] },

  switches: { gap: 2, paddingVertical: 4, borderTopWidth: 1, borderTopColor: PF.line },

  table: { borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[0], borderWidth: 1, borderColor: PF.line },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  head: { borderTopWidth: 0, paddingTop: 10, paddingBottom: 6, backgroundColor: t.neutral[50] },
  headText: { fontSize: 12, lineHeight: 19.2, color: PF.muted, textTransform: 'capitalize', ...font(600) },
  nameCol: { flex: 1, minWidth: 0 },
  priceCol: { width: 130 },
  priceColBoth: { width: 112 },
  stockColBoth: { width: 76 },
  name: { fontSize: 14.5, lineHeight: 23.2, color: PF.ink, ...font(600) },
});
