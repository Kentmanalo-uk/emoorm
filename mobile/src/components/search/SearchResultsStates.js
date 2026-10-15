import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WarningCircleIcon } from 'phosphor-react-native';
import Chip from '../Chip';
import EmptyState from '../EmptyState';
import { POPULAR_SUGGESTIONS } from '../../lib/shellSearch';
import { font, t } from '../../theme';
import { PageLoader } from '../BrandLoader';

/**
 * The phone results page's "nothing found" card (web Products.jsx
 * .srch-m-empty): the search picture, what was searched, a hint, Clear
 * filters when any are on, and popular words to try instead.
 */
export function SearchResultsEmpty({ searchQuery, showClear, onClear, onSearch }) {
  return (
    <View style={styles.empty}>
      <EmptyState
        art="search"
        style={styles.emptyState}
        title={searchQuery ? `No results for “${searchQuery}”` : 'No products found'}
        text={searchQuery
          ? 'Check the spelling, or try a shorter or more general word.'
          : 'Try another category or price range.'}
        actions={showClear ? [{ label: 'Clear filters', onPress: onClear, variant: 'outline' }] : []}
      />
      <View style={styles.tryBox}>
        <Text style={styles.tryLabel}>Try searching for</Text>
        <View style={styles.tryChips}>
          {POPULAR_SUGGESTIONS.map((term) => (
            <Chip key={term} variant="suggest" label={term} onPress={() => onSearch(term)} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** The list failed to load (web .products-empty.products-error). */
export function SearchResultsError({ message, onRetry }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <WarningCircleIcon size={64} weight="fill" color={t.danger[500]} />
      <Text style={styles.errorTitle}>Couldn't load products</Text>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

/** A grey loading bar that shimmers like the website's .sk. */
export function SkeletonBar({ width = '100%', height = 12, radius = 6, style }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: t.neutral[150], opacity }, style]} />;
}

/** The results' loading cards (web Skeleton.Cards: one column on a phone). */
export function SearchSkeletonCards({ count = 12 }) {
  return <PageLoader minHeight={320} label="Loading products" />;
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24,
    borderRadius: 16, backgroundColor: t.neutral[0],
  },
  // The card gives the sides; the suggestions follow straight after.
  emptyState: { paddingHorizontal: 0, paddingBottom: 0 },
  tryBox: { width: '100%', marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  tryLabel: { marginBottom: 10, fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[500], textAlign: 'center' },
  tryChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },

  error: {
    alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 32, paddingHorizontal: 16,
    borderRadius: 12, backgroundColor: t.neutral[0],
  },
  errorTitle: { fontSize: 20, lineHeight: 24, ...font(500), color: t.neutral[700], textAlign: 'center' },
  errorText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  retry: {
    minHeight: 44, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  retryPressed: { backgroundColor: t.primary[700] },
  retryText: { fontSize: 14, lineHeight: 20, ...font(500), color: '#fff' },

  skCards: { gap: 16 },
  skCard: { overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: t.neutral[150], backgroundColor: t.neutral[0] },
  skBody: { gap: 8, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 },
  skFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
