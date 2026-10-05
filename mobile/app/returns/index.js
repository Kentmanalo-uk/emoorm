import { useCallback, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import apiClient from '../../src/api/client';
import ScreenHeader from '../../src/components/ScreenHeader';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';
import { OrderCardsSkeleton, OrderTabs } from '../../src/components/orders/OrderBits';
import OrdersEmpty from '../../src/components/orders/OrdersEmpty';
import { RETURN_TABS, ReturnCard } from '../../src/components/returns/ReturnBits';

/*
 * Returns & Refunds (web/src/pages/Returns.jsx at phone size): "Start from an
 * order", the status tabs with counts, and one card per return request.
 */

// The list as it showed last time: shown at once while it is asked for again.
let cachedReturns = null;

export default function Returns() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [returns, setReturns] = useState(() => cachedReturns || []);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(() => !cachedReturns);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    let active = true;
    apiClient.get('/returns/my', { params: { pageSize: 50 } })
      .then((res) => {
        if (!active) return;
        cachedReturns = res.data || [];
        setReturns(cachedReturns);
      })
      .catch((err) => toast.error(err.message || 'Unable to load returns'))
      .finally(() => { if (active) { setLoading(false); setRefreshing(false); } });
    return () => { active = false; };
  }, []);

  useFocusEffect(load);

  const visible = tab === 'all' ? returns : returns.filter((item) => item.status === tab);
  const counts = Object.fromEntries(RETURN_TABS.map(({ key }) => [
    key, key === 'all' ? returns.length : returns.filter((item) => item.status === key).length,
  ]));

  const header = <ScreenHeader title="Returns & Refunds" backTo="/profile" />;

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.skeleton}><OrderCardsSkeleton count={2} /></View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[t.primary[600]]} />}
      >
        <View style={styles.head}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/orders')} style={styles.startLink}>
            <Text style={styles.startText}>Start from an order</Text>
          </Pressable>
        </View>

        <OrderTabs tabs={RETURN_TABS} active={tab} onChange={setTab} counts={counts} />

        {visible.length === 0 ? (
          <OrdersEmpty
            art="returns"
            title="No return requests found"
            hint="Completed orders can be returned within the seller's return policy window."
            button="View My Orders"
            onPress={() => router.push('/orders')}
          />
        ) : (
          <View style={styles.list}>
            {visible.map((item) => (
              <ReturnCard key={item.id} item={item} onPress={() => router.push(`/returns/${item.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { paddingTop: 12, paddingHorizontal: 12, gap: 12 },
  skeleton: { paddingTop: 12, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center' },
  startLink: { minHeight: 32, justifyContent: 'center' },
  startText: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.primary[600] },
  list: { gap: 12 },
});
