import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MinusIcon, TrendDownIcon, TrendUpIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import SellerPage from '../../src/components/seller/SellerPage';
import {
  AnCard, GranularityToggle, KpiCard, PeriodActions, TopList, anStyles,
} from '../../src/components/seller/analytics/parts';
import { BarChart, StatusDonut, TrendLine } from '../../src/components/seller/analytics/charts';
import SalesTable from '../../src/components/seller/analytics/SalesTable';
import DayDetailSheet from '../../src/components/seller/analytics/DayDetailSheet';
import { defaultMonth } from '../../src/components/seller/analytics/DateRangePicker';
import {
  num, peso, shareCsv, shortDate, toCSV,
} from '../../src/components/seller/analytics/format';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';

/**
 * /seller/analytics (web/src/pages/SellerAnalytics.jsx, phone layout from
 * components/analytics/analytics.css and layout/SellerMobile.css): the
 * period, four figures, the growth line, sales by day/month/year, the
 * orders trend (phones leave out the revenue trend, which repeats Sales
 * analytics), daily sales (a day opens its orders), best sellers, sales by
 * category, views to orders, order status and low stock.
 */
export default function SellerAnalyticsScreen() {
  const [range, setRange] = useState(defaultMonth);
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [pulled, setPulled] = useState(false); // pull to refresh, not a chip or Refresh

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/analytics/seller', { params: { from: range.from, to: range.to, granularity } });
      setData(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range, granularity]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis || {};
  const buckets = data?.salesByBucket || [];
  const salesByDay = data?.salesByDay || [];

  const revenueValue = Number(k.revenue?.value || 0);
  const revenuePrevious = Number(k.revenue?.previous || 0);
  const hasGrowthData = revenueValue > 0 || revenuePrevious > 0;
  const revenueDelta = k.revenue?.delta ?? 0;
  const growthTrend = revenueDelta > 0 ? 'up' : revenueDelta < 0 ? 'down' : 'flat';
  const growthLabel = hasGrowthData ? `${revenueDelta > 0 ? '+' : ''}${revenueDelta}%` : '—';
  const growthTone = hasGrowthData ? growthTrend : 'flat';
  const growthColor = growthTone === 'up' ? t.primary[600] : growthTone === 'down' ? t.danger[600] : t.neutral[500];
  const unit = granularity === 'year' ? 'years' : granularity === 'month' ? 'months' : 'days';

  const exportCsv = async () => {
    if (!salesByDay.length) return;
    const csv = toCSV(salesByDay, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Total Orders', get: (r) => r.orders },
      { label: 'Total Revenue', get: (r) => Number(r.total || 0).toFixed(2) },
    ]);
    const ok = await shareCsv(`seller-sales-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
    if (!ok) toast.error('Export failed');
  };

  const bestSellers = useMemo(
    () => (data?.topProducts || []).map((p) => ({ ...p, subtitle: `${p.quantity} sold` })),
    [data],
  );

  return (
    <SellerPage refreshing={pulled} onRefresh={async () => { setPulled(true); await load(); setPulled(false); }}>
      <PeriodActions
        range={range}
        onRange={setRange}
        onRefresh={load}
        refreshing={loading}
        refreshDisabled={loading}
        onExport={exportCsv}
        exportDisabled={!data}
      />

      {error ? <AnCard><Text style={styles.error}>{error}</Text></AnCard> : null}

      <View style={anStyles.grid}>
        <KpiCard style={anStyles.half} loading={loading && !data} label="Completed Orders" value={num(k.orders?.value)} delta={k.orders?.delta} hint="Completed orders in period" />
        <KpiCard style={anStyles.half} loading={loading && !data} label="Total Orders" value={num(k.totalOrders?.value)} hint="All statuses in period" />
        <KpiCard style={anStyles.half} loading={loading && !data} label="Revenue" value={peso(k.revenue?.value)} delta={k.revenue?.delta} />
        <KpiCard
          style={anStyles.half}
          loading={loading && !data}
          label="Sales Growth"
          value={growthLabel}
          hint={hasGrowthData ? `vs previous ${range.preset || 'period'}` : 'Not enough data yet'}
        />
      </View>

      {/* Sales growth: a full-width band on phones. */}
      <View style={styles.growth}>
        <View style={styles.growthBody}>
          <Text style={styles.growthLine}>
            Previous period revenue: <Text style={styles.growthStrong}>{peso(k.revenue?.previous)}</Text>
          </Text>
          <Text style={styles.growthLine}>
            Current period revenue: <Text style={styles.growthStrong}>{peso(k.revenue?.value)}</Text>
          </Text>
        </View>
        <View style={styles.growthValue}>
          {hasGrowthData && growthTrend === 'up' ? <TrendUpIcon size={20} color={growthColor} /> : null}
          {hasGrowthData && growthTrend === 'down' ? <TrendDownIcon size={20} color={growthColor} /> : null}
          {hasGrowthData && growthTrend === 'flat' ? <MinusIcon size={20} color={growthColor} /> : null}
          <Text style={[styles.growthText, { color: growthColor }]}>{growthLabel}</Text>
        </View>
      </View>

      <AnCard title="Sales analytics" right={<GranularityToggle value={granularity} onChange={setGranularity} />}>
        <BarChart data={buckets} formatValue={(v) => peso(v)} labelKey="date" />
        <TrendLine data={buckets} />
      </AnCard>

      <AnCard title="Orders trend" sub={`${buckets.length} ${unit}`}>
        <BarChart data={buckets} valueKey="orders" formatValue={(v) => `${v} ${Number(v) === 1 ? 'order' : 'orders'}`} />
      </AnCard>

      <AnCard title="Daily sales" sub="Tap a date to see its orders">
        <SalesTable
          rows={salesByDay.slice().reverse()}
          onSelect={(row) => setSelectedDate(row.date)}
          formatLabel={(d) => shortDate(d)}
          formatValue={(v) => peso(v)}
        />
      </AnCard>

      <AnCard title="Best-selling products">
        <TopList items={bestSellers} renderMetric={(p) => peso(p.revenue)} emptyArt="products" emptyMessage="No products sold in this period." />
      </AnCard>

      <AnCard title="Sales by category">
        <TopList
          items={(data?.topCategories || []).map((c) => ({ id: c.id, name: c.name, subtitle: `${c.quantity} sold`, revenue: c.revenue }))}
          renderMetric={(c) => peso(c.revenue)}
          emptyArt="categories"
          emptyMessage="No category data yet."
        />
      </AnCard>

      <AnCard title="Views to orders" sub={`${num(data?.views || 0)} product page views in this period`}>
        <TopList
          items={(data?.productFunnel || []).map((p) => ({
            id: p.id,
            name: p.name,
            image: p.image,
            subtitle: `${num(p.views)} views · ${num(p.orders)} order${p.orders === 1 ? '' : 's'}`,
            conversion: p.conversion,
          }))}
          renderMetric={(p) => `${p.conversion}%`}
          emptyArt="analytics"
          emptyMessage="No product views yet in this period."
        />
      </AnCard>

      <AnCard title="Order status">
        <StatusDonut counts={data?.ordersByStatus || {}} />
      </AnCard>

      <AnCard title="Low stock" sub="At or below reorder threshold" style={styles.lastCard}>
        <TopList
          items={(data?.lowStock || []).map((p) => ({
            id: p.id,
            name: p.name,
            image: Array.isArray(p.images) ? p.images[0] : null,
            subtitle: String(p.status || '').toLowerCase(),
            stock: p.stock,
          }))}
          renderMetric={(p) => `${p.stock} left`}
          emptyArt="healthy"
          emptyMessage="All products well-stocked."
        />
      </AnCard>

      <DayDetailSheet date={selectedDate} onClose={() => setSelectedDate(null)} />
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  error: { padding: 16, fontSize: 13, lineHeight: 18, color: t.danger[600], ...font(400) },

  // .an-growth on Seller Center phones: edge to edge, an 8px grey band under it.
  growth: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: -12, paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: t.neutral[0], borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  growthBody: { flex: 1, gap: 2 },
  growthLine: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  growthStrong: { color: t.neutral[900], ...font(700) },
  growthValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  growthText: { fontSize: 20, lineHeight: 24, ...font(700) },

  lastCard: { marginBottom: 0 },
});
