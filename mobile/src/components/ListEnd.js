import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t, themed } from '../theme';

/**
 * Under a list from useInfiniteList (web/src/components/ui/ListEnd.jsx +
 * .css): a spinner while the next batch loads, a quiet "Try again" when one
 * failed, and a note once everything is shown. The same look as the end of
 * Home's Explore Products.
 *
 *   <FlatList … {...list.endProps} ListFooterComponent={<ListEnd list={list} />} />
 *
 * @param {Object} list - What useInfiniteList returned
 * @param {String} [done] - The note at the end (null/'' : no note)
 * @param {String} [loadingLabel] - Read out while the next batch loads
 * @param {Object} [style] - Extra style for the footer box
 */
export default function ListEnd({
  list, done = 'You’ve seen everything for now', loadingLabel = 'Loading more products', style,
}) {
  const {
    hasMore, loadingMore, failed, loadMore, items,
  } = list;
  const showDone = Boolean(done) && !hasMore && !loadingMore && items.length > 0;
  return (
    <View style={[styles.end, style]} accessibilityLiveRegion="polite">
      {loadingMore ? <ActivityIndicator size="small" color={t.primary[600]} accessibilityLabel={loadingLabel} /> : null}
      {!loadingMore && failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Couldn’t load more. Try again"
          onPress={loadMore}
          hitSlop={8}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Couldn’t load more · <Text style={styles.retryLink}>Try again</Text></Text>
        </Pressable>
      ) : null}
      {showDone ? <Text style={styles.done}>{done}</Text> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .list-end: a centred row, at least 56 tall, 12 above and 20 below.
  end: {
    width: '100%', minHeight: 56, paddingTop: 12, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  retry: { paddingVertical: 6, paddingHorizontal: 8 },
  retryText: { fontSize: 13.5, lineHeight: 18, ...font(400), color: t.neutral[500] },
  retryLink: { ...font(500), color: t.primary[600] },
  done: { fontSize: 13, lineHeight: 17, ...font(400), color: t.neutral[500], textAlign: 'center' },
}));
