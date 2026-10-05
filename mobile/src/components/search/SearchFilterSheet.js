import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Sheet, { SheetButton, SheetOption } from '../Sheet';
import { font, t } from '../../theme';

const TITLES = {
  all: 'Filters',
  municipality: 'Municipality',
  category: 'Category',
  price: 'Price',
};

/**
 * Phones: the search results' filters in a bottom sheet
 * (web/src/components/search/SearchFilterSheet.jsx). `focus` is the chip that
 * opened it ('municipality' | 'category' | 'price'), showing only that
 * choice, or 'all' (the Filter chip) for every one. A choice applies as soon
 * as it is tapped; a single-choice sheet then closes.
 *
 * value: { municipalityId, category, minPrice, maxPrice }
 * onChange(partial) applies part of it; onReset() clears every filter.
 */
export default function SearchFilterSheet({
  focus, onClose, municipalities = [], categories = [], value, onChange, onReset,
}) {
  const { width } = useWindowDimensions();
  // Each opening starts from the prices in force; the last section stays on
  // screen while the sheet slides away (focus is null by then).
  const [openedFor, setOpenedFor] = useState(focus);
  const [shown, setShown] = useState(focus);
  const [min, setMin] = useState(value.minPrice || '');
  const [max, setMax] = useState(value.maxPrice || '');
  const [focused, setFocused] = useState('');
  if (focus !== openedFor) {
    setOpenedFor(focus);
    if (focus) {
      setShown(focus);
      setMin(value.minPrice || '');
      setMax(value.maxPrice || '');
    }
  }

  const all = shown === 'all';
  // Two equal columns 8 apart inside the 20px sides (.sfs-options.is-grid).
  const cell = Math.floor((Math.min(width, 9999) - 40 - 8) / 2);
  const pick = (partial) => {
    onChange(partial);
    if (!all) onClose();
  };
  const option = (key, label, selected, partial) => (
    <SheetOption key={key} label={label} selected={selected} grid={all} onPress={() => pick(partial)} style={all ? { width: cell } : null} />
  );
  const options = (list) => (all ? <View style={styles.grid}>{list}</View> : <View>{list}</View>);
  const digits = (v) => v.replace(/[^0-9.]/g, '');

  return (
    <Sheet
      open={Boolean(focus)}
      title={TITLES[shown] || 'Filters'}
      onClose={onClose}
      variant="buyer"
      footer={all ? (
        <>
          <SheetButton label="Reset all" onPress={() => { setMin(''); setMax(''); onReset(); }} />
          <SheetButton label="Show results" primary onPress={onClose} />
        </>
      ) : null}
    >
      {all || shown === 'municipality' ? (
        <View>
          {all ? <Text style={styles.secTitle} accessibilityRole="header">Municipality</Text> : null}
          {options([
            option('m-all', 'All municipalities', !value.municipalityId, { municipalityId: '' }),
            ...municipalities.map((m) => option(m.id, m.name, value.municipalityId === m.id, { municipalityId: m.id })),
          ])}
        </View>
      ) : null}

      {all || shown === 'category' ? (
        <View style={all && styles.secNext}>
          {all ? <Text style={styles.secTitle} accessibilityRole="header">Category</Text> : null}
          {options([
            option('c-all', 'All categories', !value.category, { category: '' }),
            ...categories.map((c) => option(c.id, c.name, value.category === c.id, { category: c.id })),
          ])}
        </View>
      ) : null}

      {all || shown === 'price' ? (
        <View style={all && styles.secNext}>
          {all ? <Text style={styles.secTitle} accessibilityRole="header">Price</Text> : null}
          <View style={styles.price}>
            <View style={styles.priceInputs}>
              <TextInput
                style={[styles.input, focused === 'min' && styles.inputFocus]}
                value={min}
                onChangeText={(v) => setMin(digits(v))}
                onFocus={() => setFocused('min')}
                onBlur={() => setFocused('')}
                placeholder="₱ Min"
                placeholderTextColor={t.neutral[500]}
                keyboardType="numeric"
                inputMode="numeric"
                returnKeyType="done"
                onSubmitEditing={() => pick({ minPrice: min, maxPrice: max })}
                accessibilityLabel="Minimum price"
              />
              <Text style={styles.dash}>–</Text>
              <TextInput
                style={[styles.input, focused === 'max' && styles.inputFocus]}
                value={max}
                onChangeText={(v) => setMax(digits(v))}
                onFocus={() => setFocused('max')}
                onBlur={() => setFocused('')}
                placeholder="₱ Max"
                placeholderTextColor={t.neutral[500]}
                keyboardType="numeric"
                inputMode="numeric"
                returnKeyType="done"
                onSubmitEditing={() => pick({ minPrice: min, maxPrice: max })}
                accessibilityLabel="Maximum price"
              />
            </View>
            <View style={styles.priceActions}>
              <SheetButton label="Clear" onPress={() => { setMin(''); setMax(''); pick({ minPrice: '', maxPrice: '' }); }} />
              <SheetButton label="Apply price" primary onPress={() => pick({ minPrice: min, maxPrice: max })} />
            </View>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  secNext: { borderTopWidth: 8, borderTopColor: t.neutral[50] },
  secTitle: { paddingTop: 14, paddingHorizontal: 20, paddingBottom: 6, fontSize: 15, lineHeight: 17.25, ...font(500), color: t.neutral[900] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4, paddingHorizontal: 20, paddingBottom: 12 },
  price: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 4 },
  priceInputs: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dash: { fontSize: 16, lineHeight: 24, ...font(400), color: t.neutral[500] },
  input: {
    // Phones give every input 46px (web responsive.css min-height).
    flex: 1, minWidth: 0, height: 46, paddingHorizontal: 12, backgroundColor: t.neutral[100],
    fontSize: 16, ...font(400), color: t.neutral[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  inputFocus: {
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1.5, color: t.primary[500] }],
  },
  priceActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
