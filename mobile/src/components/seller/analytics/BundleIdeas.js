import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PackageIcon, PlusIcon } from '../../../lib/icons';
import apiClient from '../../../api/client';
import EmptyState from '../../EmptyState';
import { parseImages } from '../../product/productLib';
import { font, ink, t, themed } from '../../../theme';
import { AnCard, Thumb } from './parts';
import { num } from './format';

/*
 * Seller Center › Analytics' "Bundle ideas" (GET /ml/bundles/mine): pairs of
 * the shop's own products that buyers take in the same order, each with a
 * way to sell them as one package. Hidden while the ML engine's bundles are
 * off, before the answer comes, and when the request fails. With nothing to
 * suggest yet: how many orders so far had two or more of the shop's products.
 *
 * refreshKey: changing it asks again (the page's pull and Refresh).
 * onData: told each answer, so the Insights section knows whether this card
 * shows (a failed request keeps the last answer, as the card does).
 */
export default function BundleIdeas({ refreshKey = 0, style, onData }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const told = useRef(onData);
  told.current = onData;

  useEffect(() => {
    let live = true;
    apiClient.get('/ml/bundles/mine')
      .then((res) => {
        if (!live) return;
        setData(res.data || null);
        told.current?.(res.data || null);
      })
      // The card stays out; the rest of the page is unaffected.
      .catch((err) => console.warn('Bundle ideas:', err?.message || err));
    return () => { live = false; };
  }, [refreshKey]);

  if (!data?.on) return null;
  const ideas = (data.ideas || []).filter((i) => Array.isArray(i.products) && i.products.length >= 2);
  // The package form opens on its first step, the shop's products to pick from.
  const makePackage = () => router.push({ pathname: '/seller/products/new', params: { type: 'package' } });

  return (
    <AnCard title="Bundle ideas" sub="Often bought together in your shop" style={style}>
      {ideas.length ? (
        <View>
          {ideas.map((idea, i) => {
            const [a, b] = idea.products;
            const n = Number(idea.orders || 0);
            return (
              <View key={`${a.id}-${b.id}`} style={[styles.row, i === ideas.length - 1 && styles.rowLast]}>
                <View style={styles.pair}>
                  <Thumb image={parseImages(a.images)[0] || null} />
                  <PlusIcon size={12} weight="bold" color={t.neutral[400]} />
                  <Thumb image={parseImages(b.images)[0] || null} />
                </View>
                <View style={styles.body}>
                  <Text style={styles.names} numberOfLines={2}>{a.name} + {b.name}</Text>
                  <Text style={styles.sub}>Bought together in {num(n)} {n === 1 ? 'order' : 'orders'}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Make a package of ${a.name} and ${b.name}`}
                    onPress={makePackage}
                    style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
                  >
                    <PackageIcon size={15} color={t.primary[700]} />
                    <Text style={styles.btnText}>Make a package</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          compact
          art="products"
          title="No bundle ideas yet"
          text={`Ideas come from orders with two or more of your products. So far: ${num(data.ordersWithTwoOrMore || 0)} ${Number(data.ordersWithTwoOrMore) === 1 ? 'order' : 'orders'}.`}
        />
      )}
    </AnCard>
  );
}

const styles = themed(() => StyleSheet.create({
  // .an-toplist's rows.
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: ink(0.05),
  },
  rowLast: { borderBottomWidth: 0 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  names: { fontSize: 13.5, lineHeight: 18, color: t.neutral[900], ...font(500) },
  sub: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  // My products' row buttons (.pm-actions), a size smaller.
  btn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, marginTop: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  btnPressed: { backgroundColor: t.neutral[50] },
  btnText: { fontSize: 13, lineHeight: 18, color: t.primary[700], ...font(500) },
}));
