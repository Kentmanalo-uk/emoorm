import { useCallback, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import apiClient from '../../../src/api/client';
import { getCacheEntry, setCachedData } from '../../../src/lib/dataCache';
import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerHomeHeader } from '../../../src/components/seller/SellerTopBars';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import HomeTips from '../../../src/components/seller/home/HomeTips';
import HomeSetupCard from '../../../src/components/seller/home/HomeSetupCard';
import {
  HomeLoadNote, HomeNotice, HomeNumbers, HomeRecentOrders, HomeRunningLow, HomeSales, HomeTools,
} from '../../../src/components/seller/home/HomeCards';
import {
  EMPTY_STATS, buildHome, homeNotice, liveProducts,
} from '../../../src/components/seller/home/homeLib';

/*
 * /seller (Home), the phone branch of web/src/pages/SellerDashboard.jsx
 * (PhoneHome) with SellerApp.css .sh-* as styles/phone-app.css draws it:
 * the shop header (SellerHomeHeader), then one notice, the counts that need
 * action, the shop tools, the tips, "Complete your shop", sales, recent
 * orders and what is running low. The first-visit guide sheet comes from
 * SellerPhoneGuide (mounted by app/seller/_layout.js).
 *
 * What Home showed last time is shown at once while it is asked for again
 * (the website's seller:home / seller:home-counts page cache).
 */
const HOME_KEY = 'seller:home';
const COUNTS_KEY = 'seller:home-counts';
const SITE = 'https://emoorm.shop';

export default function SellerHomeScreen() {
  const {
    store, setup, waiting, refreshSetup, refreshCounts,
  } = useSellerShell();

  const [saved] = useState(() => getCacheEntry(HOME_KEY)?.data || null);
  const [home, setHome] = useState(() => saved || {
    analyticsAvailable: true, recentOrders: [], lowStock: [], salesByDay: [], stats: EMPTY_STATS,
  });
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [loadError, setLoadError] = useState(false);
  const [counts, setCounts] = useState(() => getCacheEntry(COUNTS_KEY)?.data || {});
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const total = (res) => res.pagination?.total ?? (res.data || []).length;
    try {
      const [[analyticsRes, ordersRes, productsRes], countEntries] = await Promise.all([
        Promise.allSettled([
          apiClient.get('/analytics/seller'),
          apiClient.get('/orders/store/orders', { params: { pageSize: 5 } }),
          apiClient.get('/products/my/products', { params: { pageSize: 100 } }),
        ]),
        // The counts on Home: orders to confirm / ship, reviews to answer.
        Promise.all([
          apiClient.get('/orders/store/stages')
            .then((res) => ['stages', res.data || {}])
            .catch(() => ['stages', {}]),
          apiClient.get('/reviews/seller/mine', { params: { unrepliedOnly: true, pageSize: 1 } })
            .then((res) => ['reviews', total(res)])
            .catch(() => ['reviews', 0]),
        ]),
      ]);
      const { failed, next } = buildHome(analyticsRes, ordersRes, productsRes);
      setLoadError(failed);
      setHome(next);
      // A failed load is not remembered: the saved copy stays as it was.
      if (!failed) setCachedData(HOME_KEY, next);
      const nextCounts = Object.fromEntries(countEntries);
      setCounts(nextCounts);
      setCachedData(COUNTS_KEY, nextCounts);
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  }, []);

  // Asked again each time Home comes back into view (it stays mounted as a tab).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), refreshSetup?.(), refreshCounts?.()]);
    } finally {
      setRefreshing(false);
    }
  };

  const {
    analyticsAvailable, recentOrders, lowStock, salesByDay, stats,
  } = home;
  const notice = homeNotice(store, setup);
  const live = liveProducts(stats);
  const recentSales = salesByDay.reduce((sum, day) => sum + Number(day.total || 0), 0);
  const name = store?.name || 'My shop';
  const shareShop = () => {
    if (!store?.slug) return;
    const url = `${SITE}/store/${store.slug}`;
    Share.share({ title: name, message: `Shop at ${name} on Emoorm\n${url}`, url }).catch(() => {});
  };
  const numbers = [
    // The same counts as the Orders tabs they open.
    { label: 'To confirm', value: counts.stages?.byStatus?.PENDING || 0, to: '/seller/orders?status=PENDING' },
    { label: 'To ship', value: counts.stages?.byStatus?.TO_SHIP || 0, to: '/seller/orders?status=TO_SHIP' },
    { label: 'Returns', value: waiting?.['/seller/returns']?.count, to: '/seller/returns' },
    { label: 'Reviews', value: counts.reviews, to: '/seller/reviews?filter=reply' },
  ];
  const hasLow = lowStock.length > 0;

  return (
    <SellerPage header={<SellerHomeHeader />} refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      <View style={styles.body}>
        {notice ? <HomeNotice notice={notice} /> : null}
        {loadError ? <HomeLoadNote /> : null}
        <HomeNumbers numbers={numbers} />
        <HomeTools />
        <HomeTips onShare={shareShop} />
        {setup && !setup.complete ? <HomeSetupCard setup={setup} /> : null}
        <HomeSales
          isLoading={isLoading}
          analyticsAvailable={analyticsAvailable}
          stats={stats}
          recentSales={recentSales}
          salesByDay={salesByDay}
          live={live}
        />
        <HomeRecentOrders isLoading={isLoading} orders={recentOrders} last={!hasLow} />
        {hasLow ? <HomeRunningLow items={lowStock} last /> : null}
      </View>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  // On the website the shop header sits inside the page, so the first
  // section starts right under its hairline.
  content: { paddingTop: 0 },
  // .sh-body: 12px between the sections, 8px more under the last one.
  body: { gap: 12, paddingBottom: 8 },
});
