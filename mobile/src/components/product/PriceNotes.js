import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HandshakeIcon, LightningIcon, TagIcon } from '../../lib/icons';
import { saleInfo } from '../../lib/variantPricing';
import { font, t, themed } from '../../theme';
import { peso } from './productLib';

/*
 * What else to know about a product's price, one line each under it
 * (web/src/components/ui/SaleTag.jsx PriceNotes, SaleTag.css .price-note):
 * the sale's countdown, an asking price open to offers, bulk prices.
 * Weights are the website's phone weights (bold → 500).
 */

const left = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d >= 1) return `${d}d ${h}h`;
  return h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};

/** A flash sale's time left ("2d 14h"), in its last three days; else null. */
function useSaleEndsIn(product) {
  const { endsAt } = saleInfo(product);
  const [now, setNow] = useState(() => Date.now());
  const endsMs = endsAt ? endsAt.getTime() : null;
  useEffect(() => {
    if (!endsMs) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [endsMs]);
  if (!endsMs || endsMs - now > 3 * 86400e3 || endsMs <= now) return null;
  return left(endsMs - now);
}

function Note({ Icon, color, children, timer = false }) {
  return (
    <View style={styles.note} accessibilityRole={timer ? 'timer' : undefined}>
      <Icon size={15} weight="fill" color={color} style={styles.icon} />
      {children}
    </View>
  );
}

export default function PriceNotes({ product, tiers = [], negotiable = false, style }) {
  const endsIn = useSaleEndsIn(product);
  if (!endsIn && !negotiable && tiers.length === 0) return null;
  // Bulk prices: each tier stays on one line; the lines break between tiers
  // (the "·" stays at the end of the line before).
  const bulk = ['Buy more, pay less', ...tiers.map((tier) => `${tier.minQty}+ ${peso(tier.price)} each`)];
  return (
    <View style={[styles.notes, style]}>
      {endsIn ? (
        <Note Icon={LightningIcon} color={t.danger[600]} timer>
          <Text style={[styles.text, styles.b, styles.sale]}>Sale ends in {endsIn}</Text>
        </Note>
      ) : null}
      {negotiable ? (
        <Note Icon={HandshakeIcon} color={t.primary[600]}>
          <Text style={styles.text}>
            <Text style={styles.b}>Asking price</Text> · make an offer and agree on the price in chat
          </Text>
        </Note>
      ) : null}
      {tiers.length > 0 ? (
        <Note Icon={TagIcon} color={t.warning[500]}>
          <View style={styles.tiers}>
            {bulk.map((words, i) => (
              <Text key={words} style={[styles.text, i === 0 && styles.b]}>
                {words}
                {i < bulk.length - 1 ? <Text style={styles.dot}> ·</Text> : null}
              </Text>
            ))}
          </View>
        </Note>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  notes: { gap: 6 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { flexShrink: 0, marginTop: 2 },
  text: { flexShrink: 1, fontSize: 13.5, lineHeight: 18.9, ...font(400), color: t.neutral[700] },
  b: { ...font(500), color: t.neutral[900] },
  sale: { color: t.danger[600] },
  dot: { ...font(400), color: t.neutral[700] },
  // A space's width between the tiers, as the inline text has on the website.
  tiers: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', columnGap: 3.5 },
}));
