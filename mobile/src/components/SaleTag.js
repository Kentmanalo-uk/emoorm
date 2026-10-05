import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { LightningIcon } from 'phosphor-react-native';
import { saleInfo } from '../lib/variantPricing';
import { font, t } from '../theme';

/*
 * Sale prices as on the website (web/src/components/ui/SaleTag.jsx): the
 * regular price crossed out with the percent off, bulk prices, and a flash
 * sale's countdown. Weights are the website's phone weights (bold → 500).
 */

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** While a sale is on: the regular price crossed out and the percent off. */
export function SaleWas({ product, compact = false, style }) {
  const { price, regular } = saleInfo(product);
  if (!regular) return null;
  const off = Math.round((1 - price / regular) * 100);
  return (
    <View style={[styles.was, compact && styles.wasCompact, style]}>
      <Text style={[styles.wasOld, compact && styles.wasOldCompact]}>{peso(regular)}</Text>
      <Text style={[styles.wasOff, compact && styles.wasOffCompact]}>-{off}%</Text>
    </View>
  );
}

const left = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d >= 1) return `${d}d ${h}h`;
  return h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};

/** Bulk prices: "Buy more, pay less: 10+ ₱90.00 each · 50+ ₱80.00 each". */
export function BulkPrices({ tiers, style }) {
  return (
    <View style={[styles.bulk, style]}>
      <Text style={[styles.bulkText, styles.bulkLead]}>Buy more, pay less:</Text>
      {tiers.map((tier, i) => (
        <View key={tier.minQty} style={styles.bulkTier}>
          {i > 0 ? <Text style={styles.bulkDot}>·</Text> : null}
          <Text style={styles.bulkText}>{tier.minQty}+ {peso(tier.price)} each</Text>
        </View>
      ))}
    </View>
  );
}

/** A flash sale's countdown, shown in its last three days. */
export function SaleEnds({ product, style }) {
  const { endsAt } = saleInfo(product);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (!endsAt || endsAt.getTime() - now > 3 * 86400e3 || endsAt.getTime() <= now) return null;
  return (
    <View style={[styles.ends, style]} accessibilityRole="timer">
      {/* The website's red-to-orange gradient, drawn behind the text. */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 10">
          <Defs>
            <LinearGradient id="sale-ends" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={t.danger[600]} />
              <Stop offset="1" stopColor="#f97316" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="10" fill="url(#sale-ends)" />
        </Svg>
      </View>
      {/* In a View so the web build paints it above the gradient layer. */}
      <View><LightningIcon size={13} weight="fill" color="#fff" /></View>
      <Text style={styles.endsText}>Sale ends in {left(endsAt.getTime() - now)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  was: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wasCompact: { gap: 4 },
  wasOld: { fontSize: 13, lineHeight: 13, ...font(400), color: t.neutral[500], textDecorationLine: 'line-through' },
  wasOldCompact: { fontSize: 11, lineHeight: 11 },
  wasOff: {
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden',
    fontSize: 11, lineHeight: 11, ...font(500), color: t.danger[700], backgroundColor: t.danger[50],
  },
  wasOffCompact: { paddingVertical: 1, paddingHorizontal: 4 },

  bulk: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignSelf: 'flex-start', rowGap: 4, columnGap: 8,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.primary[50],
  },
  bulkTier: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulkText: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.primary[800] },
  bulkLead: { ...font(500) },
  bulkDot: { fontSize: 12.5, lineHeight: 20, color: t.primary[400] },

  ends: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
  },
  endsText: { fontSize: 12, lineHeight: 19, ...font(500), color: '#fff' },
});
