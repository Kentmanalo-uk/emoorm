import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import apiClient from '../../../api/client';
import { font, t, themed } from '../../../theme';
import BundleIdeas from './BundleIdeas';
import InsightsForecast from './InsightsForecast';
import InsightsStock from './InsightsStock';
import InsightsBuyers from './InsightsBuyers';
import InsightsViewed from './InsightsViewed';
import InsightsReviews from './InsightsReviews';

/*
 * Seller Center › Analytics › Insights: what the ML engine (Phase 3) works
 * out for the shop from its own data, in one answer (GET /ml/insights/mine):
 * the sales forecast, stock risk, buyer groups and products viewed but not
 * bought, and what buyers say in their reviews (Phase 4), with Bundle
 * ideas (Phase 2, its own request) last. Each card is left out while its part is switched off or could not be worked out; the
 * section shows only when at least one card does.
 *
 * It sits at the end of the page and appears once the answer is in, so
 * nothing above it moves; a refresh keeps the cards until the new answer
 * replaces them. A failed request leaves the insight cards out (console
 * only). refreshKey: changing it asks again (the page's pull and Refresh,
 * not a change of period: insights are not for a period).
 */

const shows = (part) => Boolean(part && part.status && part.status !== 'off' && part.status !== 'unavailable');

export default function SellerInsights({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [settled, setSettled] = useState(false);
  const [bundlesOn, setBundlesOn] = useState(false);

  useEffect(() => {
    let live = true;
    apiClient.get('/ml/insights/mine')
      .then((res) => { if (live) setData(res.data || null); })
      .catch((err) => console.warn('Insights:', err?.message || err))
      .finally(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, [refreshKey]);

  const parts = [data?.forecast, data?.stock, data?.buyers, data?.performance, data?.reviews];
  const visible = settled && (parts.some(shows) || bundlesOn);

  return (
    // Bundle ideas asks from the start but stays out of sight until the
    // insights have answered, so the cards come in together.
    <View style={visible ? styles.section : styles.hidden}>
      {visible ? (
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">Insights</Text>
          <Text style={styles.sub}>Worked out from your shop's own sales, views, stock and reviews. They are estimates to plan with; nothing is changed for you.</Text>
        </View>
      ) : null}
      <InsightsForecast part={data?.forecast} />
      <InsightsStock part={data?.stock} />
      <InsightsBuyers part={data?.buyers} />
      <InsightsViewed part={data?.performance} />
      <InsightsReviews part={data?.reviews} />
      <BundleIdeas refreshKey={refreshKey} onData={(d) => setBundlesOn(Boolean(d?.on))} style={styles.lastCard} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  section: { marginTop: 20 },
  hidden: { display: 'none' },
  head: { gap: 4, paddingHorizontal: 4, marginBottom: 12 },
  title: { fontSize: 17, lineHeight: 22, color: t.neutral[900], ...font(500) },
  sub: { fontSize: 12.5, lineHeight: 18, color: t.neutral[500], ...font(400) },
  lastCard: { marginBottom: 0 },
}));
