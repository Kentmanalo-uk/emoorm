import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { TruckIcon } from '../../lib/icons';
import apiClient from '../../api/client';
import { resolveImg } from '../../lib/media';
import { font, t, themed } from '../../theme';

/** "Brgy. Poblacion", without doubling a "Brgy." already there. */
const brgyLabel = (name) => (/^(brgy\.?|bgy\.?|barangay)\s/i.test(name) ? name : `Brgy. ${name}`);

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** A courier's logo, or its initial on a pale green tile (web CourierMark). */
function CourierMark({ courier, size = 24 }) {
  const name = courier?.name || 'Courier';
  const width = Math.round(size * 1.75);
  if (courier?.logoUrl) {
    return <Image source={{ uri: resolveImg(courier.logoUrl) }} style={[styles.mark, styles.markLogo, { width, height: size }]} resizeMode="contain" />;
  }
  return (
    <View style={[styles.mark, styles.markInitial, { width, height: size }]}>
      <Text style={[styles.markText, { fontSize: Math.round(size * 0.42) }]}>
        {name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'C'}
      </Text>
    </View>
  );
}

/**
 * What it costs to get one of this product delivered
 * (web/src/components/orders/ShippingEstimate.jsx): by the seller and by each
 * courier the shop ships with, with the total. onQuote gets the quote.
 */
export default function ShippingEstimate({ product, unitPrice, municipalityId, onQuote }) {
  const storeId = product?.store?.id || product?.storeId;
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!storeId || !product?.id) return undefined;
    let cancelled = false;
    apiClient.post('/couriers/quote', {
      storeId,
      items: [{ productId: product.id, quantity: 1 }],
      municipalityId: municipalityId || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setQuote(res.data || null);
        onQuote?.(res.data ? { ...res.data, productId: product.id } : null);
      })
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [storeId, product?.id, municipalityId, onQuote]);

  if (!quote) return null;
  const couriers = (quote.couriers || []).filter((c) => c.fee != null);
  const seller = quote.seller?.offered ? quote.seller : null;
  if (!couriers.length && !seller) return null;

  const rate = seller?.rate || {};
  // Before the buyer's town is known: free and one fee everywhere are known
  // already; a fee per town or barangay is "from" the lowest.
  const preTown = Boolean(seller) && seller.covered == null && seller.fee == null;
  const knownFee = !preTown ? null
    : rate.mode === 'FREE' ? 0
      : rate.mode === 'FLAT' && rate.flatFee != null ? Number(rate.flatFee) : null;
  const sellerFee = seller && seller.covered !== false && seller.fee != null ? Number(seller.fee) : knownFee;
  const byPlace = rate.mode === 'PER_TOWN' || rate.mode === 'PER_BARANGAY';
  const sellerFrom = sellerFee == null && preTown && byPlace && rate.minFee != null ? Number(rate.minFee) : null;
  // Priced by place: the barangay or town the fee is for.
  const place = seller?.place && seller.distanceKm == null && sellerFee != null
    ? (seller.place.barangay ? brgyLabel(seller.place.barangay) : seller.place.town)
    : null;
  const fees = [sellerFee ?? sellerFrom, ...couriers.map((c) => Number(c.fee))].filter((v) => v != null);
  const lowest = fees.length ? Math.min(...fees) : null;
  const isFrom = (!municipalityId && knownFee == null) || couriers.some((c) => c.from) || sellerFrom != null;

  return (
    <View style={styles.wrap}>
      <View style={styles.list}>
        {seller ? (
          <View style={styles.item}>
            <View style={styles.self}>
              <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 38 22" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="ship-self" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#34d399" />
                    <Stop offset="1" stopColor="#059669" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="38" height="22" fill="url(#ship-self)" />
              </Svg>
              <View><TruckIcon size={15} weight="fill" color="#fff" /></View>
            </View>
            <View style={styles.name}>
              <Text style={styles.nameText}>Delivered by the seller</Text>
              <Text style={styles.small}>
                {place ? `To ${place} · cash on delivery available`
                  : sellerFrom != null ? `Fee depends on your ${rate.mode === 'PER_TOWN' ? 'town' : 'barangay'} · cash on delivery available`
                    : 'Cash on delivery available'}
              </Text>
            </View>
            {seller.covered === false ? <Text style={styles.em}>Not to your town</Text>
              : sellerFee == null ? (sellerFrom != null
                ? <Text style={styles.fee}>from {peso(sellerFrom)}</Text>
                : <Text style={styles.em}>At checkout</Text>)
                : <Text style={styles.fee}>{sellerFee === 0 ? 'Free' : peso(sellerFee)}</Text>}
          </View>
        ) : null}
        {couriers.map((c) => (
          <View key={c.id} style={styles.item}>
            <CourierMark courier={c} size={24} />
            <View style={styles.name}>
              <Text style={styles.nameText}>{c.name}</Text>
              <Text style={styles.small}>Online payment only</Text>
            </View>
            <Text style={styles.fee}>{c.from ? 'from ' : ''}{peso(c.fee)}</Text>
          </View>
        ))}
      </View>
      {lowest != null && unitPrice > 0 ? (
        <Text style={styles.total}>
          With shipping: <Text style={styles.totalStrong}>{isFrom ? 'from ' : ''}{peso(Number(unitPrice) + lowest)}</Text>
          {!municipalityId ? ' · exact fee for your address at checkout' : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { gap: 8, width: '100%', maxWidth: 420 },
  list: { gap: 6 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  self: { width: 38, height: 22, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0 },
  nameText: { fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.neutral[800] },
  small: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  fee: { flexShrink: 0, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  em: { flexShrink: 0, fontSize: 12.5, lineHeight: 20, ...font(500), color: t.neutral[500] },
  // The 15px price makes the website's line box taller than 13px text alone.
  total: { fontSize: 13, lineHeight: 23, ...font(400), color: t.neutral[600] },
  totalStrong: { fontSize: 15, ...font(500), color: t.primary[700] },
  mark: { borderRadius: 8, backgroundColor: t.neutral[0] },
  markLogo: { borderWidth: 1, borderColor: t.neutral[200] },
  markInitial: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[100] },
  markText: { ...font(500), color: t.primary[700] },
}));
