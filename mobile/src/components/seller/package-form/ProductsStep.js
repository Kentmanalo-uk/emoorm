import { forwardRef, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { MagnifyingGlassIcon, PackageIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import EmptyState from '../../EmptyState';
import { productKind } from '../productKinds';
import { KIND_TAGS, P, peso } from './pkfLib';
import { FieldError, Hint, Section } from './PkfBits';
import PickRow, { PickLoading } from './PickRow';

/*
 * Step 1 · What's in the package? (web PackageForm.jsx shows(1), PackageForm.css
 * .pkf-search, .pkf-picks, .pkf-empty, .pkf-total, ≤768px).
 */
const ProductsStep = forwardRef(function ProductsStep({
  query, onQuery, shopProducts, choices, lineFor, lineIssue, onToggle, onQuantity,
  leftOut, lines, units, worth, error, totalRef, onTotalLayout, totalFloating,
}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Section
      ref={ref}
      title="What's in the package?"
      hint="Choose from the products you already sell, then set how many of each."
      invalid={!!error}
    >
      <View style={[styles.search, focused && styles.searchFocus]}>
        <MagnifyingGlassIcon size={18} color={P.muted} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Search your products"
          placeholderTextColor={t.neutral[400]}
          accessibilityLabel="Search your products"
          returnKeyType="search"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onQuery('')} style={styles.clear}>
            <XIcon size={12} weight="bold" color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {shopProducts === null ? (
        <View style={styles.picks} accessibilityState={{ busy: true }}>
          {[0, 1, 2].map((i) => <PickLoading key={i} first={i === 0} />)}
        </View>
      ) : choices.length === 0 ? (
        query ? (
          <EmptyState compact text={`No products match “${query}”.`} />
        ) : (
          <EmptyState
            compact
            icon={PackageIcon}
            title="Add the products you sell first"
            text="Then come back and put some of them together here."
          />
        )
      ) : (
        <View style={styles.picks}>
          {choices.map((p, i) => {
            const line = lineFor(p.id);
            const issue = line ? lineIssue(line) : null;
            return (
              <PickRow
                key={p.id}
                first={i === 0}
                product={p}
                line={line}
                tag={KIND_TAGS[productKind(p)] || (p.status === 'HIDDEN' ? 'Hidden' : '')}
                warning={issue === 'gone'
                  ? 'No longer in your shop. Take it out.'
                  : issue === 'hidden' ? 'Buyers can\'t see this product now.' : ''}
                onToggle={() => onToggle(p)}
                onQuantity={(n) => onQuantity(p.id, n)}
              />
            );
          })}
        </View>
      )}
      {leftOut > 0 && !query ? (
        <Hint>Live animals and other packages can&apos;t go in a package.</Hint>
      ) : null}

      {/* While it floats above Back / Next, its place here stays (invisible). */}
      <View
        ref={totalRef}
        collapsable={false}
        onLayout={onTotalLayout}
        style={totalFloating ? styles.hidden : null}
        accessibilityElementsHidden={totalFloating}
        importantForAccessibility={totalFloating ? 'no-hide-descendants' : 'auto'}
      >
        <PackageTotal lines={lines} units={units} worth={worth} />
      </View>
      <FieldError text={error} />
    </Section>
  );
});

export default ProductsStep;

/** What the chosen products add up to (.pkf-total). */
export function PackageTotal({ lines, units, worth, style }) {
  const on = lines > 0;
  return (
    <View style={[styles.total, on && styles.totalOn, style]} accessibilityLiveRegion="polite">
      {on ? (
        <>
          <Text style={[styles.totalText, styles.totalTextOn]}>{units} {units === 1 ? 'item' : 'items'} in the package</Text>
          <Text style={styles.totalStrong}>Worth {peso(worth)} if bought separately</Text>
        </>
      ) : (
        <Text style={styles.totalText}>Nothing chosen yet. Tap the products that go in it.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 12,
    backgroundColor: t.neutral[100],
  },
  searchFocus: { boxShadow: [{ inset: true, offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: P.green }] },
  searchInput: {
    flex: 1, minWidth: 0, height: 46, padding: 0, color: P.ink, fontSize: 16, ...font(400),
  },
  clear: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[300],
  },

  picks: {
    marginHorizontal: -4, overflow: 'hidden', borderWidth: 1, borderColor: P.line, borderRadius: 14,
  },

  hidden: { opacity: 0 },
  total: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 4,
    columnGap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: t.neutral[50],
  },
  // Phones: a hairline of green and a soft shadow, as it floats above Back / Next.
  totalOn: {
    backgroundColor: P.greenSoft,
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: t.primary[100] },
      { offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(15, 23, 42, 0.08)' },
    ],
  },
  totalText: { fontSize: 13.5, lineHeight: 21.6, color: P.muted, ...font(400) },
  totalTextOn: { color: t.neutral[700] },
  totalStrong: { fontSize: 14.5, lineHeight: 23.2, color: P.greenDark, ...font(500) },
});
