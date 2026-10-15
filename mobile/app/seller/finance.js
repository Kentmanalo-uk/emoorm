import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { InfoIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import SellerPage from '../../src/components/seller/SellerPage';
import EmptyState from '../../src/components/EmptyState';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import { ActionButton, PeriodActions } from '../../src/components/seller/analytics/parts';
import { defaultMonth } from '../../src/components/seller/analytics/DateRangePicker';
import {
  exact, numericDate, peso, shareCsv, ymd,
} from '../../src/components/seller/analytics/format';
import {
  FinanceRow, FinanceTotal, PAYMENT_LABELS, StatTile, toRow,
} from '../../src/components/seller/finance/FinanceParts';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';
import { PageLoader } from '../../src/components/BrandLoader';

const PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 100;

// kpis entries are `{ value, change }`; tolerate a bare number too.
const kpiValue = (k) => (k && typeof k === 'object' ? Number(k.value || 0) : Number(k || 0));

/**
 * /seller/finance (web/src/pages/SellerFinance.jsx, the Earnings Summary;
 * phone layout from SellerDashboard.css and layout/SellerPhoneFit.css).
 * E-MOORM has no wallet: buyers pay the seller directly, so this adds up
 * real completed orders. The period, a note on how buyers pay, four
 * figures (lifetime ignores the period), then the completed orders as
 * cards with their total, a page at a time.
 */
export default function SellerFinanceScreen() {
  const router = useRouter();
  const [range, setRange] = useState(defaultMonth);
  const [kpis, setKpis] = useState(null);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasNext: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(null);
  const [pulled, setPulled] = useState(false); // pull to refresh, not the Refresh button

  // The orders endpoint takes `from`/`to` as local calendar days.
  const orderParams = { status: 'COMPLETED', from: ymd(range.from), to: ymd(range.to) };

  // Every setState sits after the await and behind the cancelled guard, so a
  // period changed mid-flight cannot land stale rows. Refresh bumps reloadKey.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [analyticsRes, ordersRes] = await Promise.all([
          apiClient.get('/analytics/seller', { params: { from: range.from, to: range.to } }),
          apiClient.get('/orders/store/orders', {
            params: {
              status: 'COMPLETED', from: ymd(range.from), to: ymd(range.to), page, pageSize: PAGE_SIZE,
            },
          }),
        ]);
        if (cancelled) return;
        setKpis(analyticsRes.data?.kpis || {});
        // Either `{ counts: {...} }` or the flat counts map.
        const byStatus = analyticsRes.data?.ordersByStatus || {};
        setOrdersByStatus(byStatus.counts || byStatus);
        setError(null);
        setOrders((ordersRes.data || []).map(toRow));
        if (ordersRes.pagination) setPagination(ordersRes.pagination);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load your earnings.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range, page, reloadKey]);

  useEffect(() => { if (!isRefreshing) setPulled(false); }, [isRefreshing]);

  const changeRange = (next) => {
    setPage(1);
    setRange(next);
  };

  const refresh = () => {
    setIsRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  // Everything that is neither finished nor cancelled is still in flight.
  const inProgressCount = Object.entries(ordersByStatus)
    .filter(([status]) => status !== 'COMPLETED' && status !== 'CANCELLED')
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);

  const periodTotal = kpiValue(kpis?.revenue);
  const periodRefunded = kpiValue(kpis?.refunded);
  const pageTotal = orders.reduce((sum, o) => sum + o.amount, 0);

  /** Plain CSV of every completed order in the period, to the share sheet. */
  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const all = [];
      let next = 1;
      for (;;) {
        const res = await apiClient.get('/orders/store/orders', { params: { ...orderParams, page: next, pageSize: EXPORT_PAGE_SIZE } });
        all.push(...(res.data || []).map(toRow));
        const pg = res.pagination;
        const more = pg ? (pg.hasNext ?? next < (pg.totalPages || 1)) : false;
        if (!more) break;
        next += 1;
      }
      const rows = [
        ['Date', 'Order', 'Buyer', 'Items', 'Payment', 'Refunded (PHP)', 'Rider fee to MoorMove (PHP)', 'Amount (PHP)'],
        ...all.map((o) => [
          numericDate(o.date),
          o.number,
          o.buyer,
          o.items,
          PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus,
          o.refunded === null ? '' : exact(o.refunded),
          o.riderFee > 0 ? exact(o.riderFee) : '',
          exact(o.amount),
        ]),
        [],
        ['Refunded', '', '', '', '', '', '', exact(periodRefunded)],
        ['Earned this period', '', '', '', '', '', '', exact(periodTotal)],
      ];
      // Quote every field: buyer names and order references may contain commas.
      const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const ok = await shareCsv(`emoorm-earnings-${ymd(range.from)}-to-${ymd(range.to)}.csv`, csv);
      if (!ok) toast.error('Export failed');
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SellerPage refreshing={pulled} onRefresh={() => { setPulled(true); refresh(); }}>
      <PeriodActions
        range={range}
        onRange={changeRange}
        onRefresh={refresh}
        refreshing={isLoading || isRefreshing}
        refreshDisabled={isLoading || isRefreshing}
        onExport={exportCsv}
        exportDisabled={isLoading || isExporting || pagination.total === 0}
        exportLabel={isExporting ? 'Exporting…' : 'Export'}
      />

      <View style={[styles.section, styles.note]}>
        <InfoIcon size={16} color={t.sky[600]} style={styles.noteIcon} />
        <Text style={styles.noteText}>
          Buyers pay you directly by cash, GCash or QR (set in{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => router.push('/seller/fulfillment')}>Delivery &amp; payment</Text>
          ). This page adds up your sales; it is not a wallet.
        </Text>
      </View>

      {error ? (
        <View style={styles.section}><Text style={styles.error}>{error}</Text></View>
      ) : null}

      <View style={styles.stats}>
        <StatTile
          style={styles.half}
          big
          label="Earned this period"
          value={isLoading ? '…' : peso(periodTotal)}
          hint={`${pagination.total} completed order${pagination.total === 1 ? '' : 's'}${periodRefunded > 0 ? ` · ${peso(periodRefunded)} refunded` : ''}`}
        />
        <StatTile style={styles.half} label="Lifetime earnings" value={isLoading ? '…' : peso(kpis?.lifetimeRevenue?.value)} hint="All completed orders" />
        <StatTile style={styles.half} label="Orders in progress" value={isLoading ? '…' : String(inProgressCount)} hint="Not yet earned" />
        <StatTile style={styles.half} label="Average order value" value={isLoading ? '…' : peso(kpis?.avgOrderValue?.value)} hint="Per completed order" />
      </View>

      <View style={[styles.section, styles.last]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Completed orders</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/seller/orders')}
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
          >
            {({ pressed }) => <Text style={[styles.outlineText, pressed && { color: t.primary[700] }]}>View all orders</Text>}
          </Pressable>
        </View>

        {isLoading ? (
          <PageLoader label="Loading" />
        ) : orders.length === 0 ? (
          <EmptyState art="revenue" text="No completed orders in this period." compact />
        ) : (
          <>
            {orders.map((o) => <FinanceRow key={o.id} order={o} />)}
            <FinanceTotal label={pagination.totalPages > 1 ? `Page ${page} total` : 'Total'} value={peso(pageTotal)} />
            {pagination.totalPages > 1 ? (
              <View style={styles.pager}>
                <ActionButton label="Prev" disabled={page <= 1 || isLoading} onPress={() => setPage((p) => Math.max(1, p - 1))} />
                <Text style={styles.pageText}>Page {page} of {pagination.totalPages}</Text>
                <ActionButton label="Next" disabled={page >= pagination.totalPages || isLoading} onPress={() => setPage((p) => p + 1)} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  // .seller-card on Seller Center phones: edge to edge, an 8px grey band under it.
  section: {
    marginHorizontal: -12, backgroundColor: t.neutral[0], borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  last: { borderBottomWidth: 0 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14, paddingHorizontal: 18 },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19.5, color: t.neutral[600], ...font(400) },
  link: { color: t.primary[600], textDecorationLine: 'underline' },
  error: { paddingVertical: 12, paddingHorizontal: 18, fontSize: 13, lineHeight: 19.5, color: t.danger[700], ...font(400) },

  // .sd-stats: two columns, 10px apart.
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  half: { flexBasis: '45%', flexGrow: 1 },

  cardHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52,
    paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  cardTitle: { flexShrink: 1, fontSize: 15, lineHeight: 19.5, color: t.neutral[900], ...font(500) },
  // .btn-seller-outline in a card head
  outlineBtn: {
    flexShrink: 0, minHeight: 36, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  outlineBtnPressed: { borderColor: t.primary[600] },
  outlineText: { fontSize: 13, lineHeight: 18, color: t.neutral[700], ...font(500) },

  loading: { gap: 14, padding: 16 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  pageText: { fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(400) },
});
