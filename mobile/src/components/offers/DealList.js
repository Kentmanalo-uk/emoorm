import { useCallback, useState } from 'react';
import {
  Image, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChatCircleDotsIcon, PhoneIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import EmptyState from '../EmptyState';
import ProductImage from '../ProductImage';
import { resolveImg } from '../../lib/media';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import {
  chatPath, dealStatus, heads, orderPath, peso, telHref, when,
} from './offerText';
import { DealBadge, DealButton, dealWeight } from './DealCard';

/*
 * Livestock deals in tabs, for the seller (Offers) or the buyer (My Offers):
 * web/src/components/offers/DealList.jsx with Offers.css at phone size.
 * Each deal is talked over in its chat, so a row opens it.
 */

const TABS = {
  seller: [
    { key: 'answer', label: 'To answer' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'agreed', label: 'Agreed' },
    { key: 'sold', label: 'Sold' },
    { key: 'closed', label: 'Closed' },
  ],
  buyer: [
    { key: 'talking', label: 'Talking' },
    { key: 'agreed', label: 'Agreed' },
    { key: 'sold', label: 'Bought' },
    { key: 'closed', label: 'Closed' },
  ],
};

// The tabs that ask something of this side get a count.
const NEEDS_YOU = { seller: ['answer', 'agreed'], buyer: ['talking', 'agreed'] };

// An empty tab: what is missing, then what brings the first one.
const EMPTY = {
  answer: ['No offers to answer', 'Buyers make offers on your livestock listings. New ones show up here.'],
  waiting: ['No prices waiting', 'When you answer an offer with your price, it waits here for the buyer.'],
  talking: ['No offers yet', 'On a live animal’s page, tap Make an offer and agree on the price in chat.'],
  agreed: ['No agreed deals yet', 'Deals you and the other side agree on wait here until you meet.'],
  sold: ['Nothing sold through offers yet', 'Deals marked as done after you meet show up here.'],
  closed: ['No closed deals', 'Declined and cancelled offers are kept here.'],
};

/** The buyer's photo, or the first letter of their name (UserAvatar .of-mini-avatar). */
function MiniAvatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  if (uri && !failed) return <Image source={{ uri }} style={styles.mini} onError={() => setFailed(true)} />;
  return (
    <View style={[styles.mini, styles.miniFallback]}>
      <Text style={styles.miniText}>{(name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function DealList({ side }) {
  const router = useRouter();
  const tabs = TABS[side];
  const [tab, setTab] = useState(tabs[0].key);
  const [data, setData] = useState(null);
  const W = (n) => dealWeight(side, n);

  // Each time the page shows (back from a chat too), and on a tab change.
  useFocusEffect(useCallback(() => {
    let live = true;
    apiClient.get(side === 'seller' ? '/offers/store' : '/offers/mine', { params: { status: tab } })
      .then((res) => { if (live) setData(res.data); })
      .catch((err) => {
        if (!live) return;
        setData({ offers: [], counts: {} });
        toast.error(err?.message || 'Could not load the deals');
      });
    return () => { live = false; };
  }, [side, tab]));

  const offers = data?.offers || [];
  const counts = data?.counts || {};
  const call = (phone) => Linking.openURL(telHref(phone)).catch(() => toast.error('Could not start the call'));

  return (
    // Grows with its page, so an empty tab can centre in the room left.
    <View style={styles.wrap}>
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={[styles.tabsBox, side === 'buyer' && styles.tabsBoxProfile]} accessibilityRole="tablist">
        {tabs.map((tb) => {
          const on = tab === tb.key;
          return (
            <Pressable
              key={tb.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => { if (!on) { setData(null); setTab(tb.key); } }}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, W(600), on && styles.tabTextOn]}>{tb.label}</Text>
              {NEEDS_YOU[side].includes(tb.key) && counts[tb.key] > 0 ? (
                <View style={styles.count}><Text style={[styles.countText, W(700)]}>{counts[tb.key]}</Text></View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {data === null ? (
        <Text style={styles.loading}>Loading…</Text>
      ) : offers.length === 0 ? (
        <EmptyState page art="offers" title={EMPTY[tab][0]} text={EMPTY[tab][1]} />
      ) : (
        <View style={styles.list}>
          {offers.map((d) => {
            const st = dealStatus(d, side);
            const phone = side === 'buyer' ? d.sellerPhone : d.buyerPhone;
            return (
              <View key={d.id} style={styles.row}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={d.product?.name}
                  disabled={!d.product?.slug}
                  onPress={() => router.push(`/product/${d.product.slug}`)}
                  style={styles.img}
                >
                  <ProductImage src={d.product?.image} />
                </Pressable>
                <View style={styles.body}>
                  <View style={styles.top}>
                    <Text style={[styles.title, W(700)]} numberOfLines={1}>{d.product?.name}</Text>
                    <DealBadge status={st} side={side} style={styles.badge} />
                  </View>
                  {side === 'seller' ? (
                    <View style={styles.buyer}>
                      <MiniAvatar src={d.buyer?.profilePhoto} name={d.buyer?.fullName} />
                      <Text style={styles.meta} numberOfLines={1}>{d.buyer?.fullName || 'A buyer'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.meta} numberOfLines={1}>{d.store?.name}</Text>
                  )}
                  <View style={styles.prices}>
                    {d.finalTotal != null ? (
                      <Text style={[styles.priceText, styles.total, W(700)]}>{`${heads(d.finalQuantity)} · ${peso(d.finalTotal)} paid in person`}</Text>
                    ) : (
                      <>
                        <Text style={styles.priceText}>{`${heads(d.quantity)} × ${peso(d.price)}`}</Text>
                        <Text style={[styles.priceText, styles.total, W(700)]}>{peso(d.total)}</Text>
                        {d.price < d.listPrice ? <Text style={[styles.priceText, styles.was]}>{`${peso(d.listPrice)} asked`}</Text> : null}
                      </>
                    )}
                  </View>
                  {d.meetAt && ['ACCEPTED', 'CONFIRMING'].includes(d.status) ? (
                    <Text style={styles.meta}>{`Meetup: ${when(d.meetAt)} · ${d.meetPlace}`}</Text>
                  ) : null}
                  <View style={styles.actions}>
                    <DealButton side={side} variant="primary" Icon={ChatCircleDotsIcon} label="Open chat" onPress={() => router.push(chatPath(d, side))} />
                    {phone ? <DealButton side={side} Icon={PhoneIcon} label="Call" onPress={() => call(phone)} /> : null}
                    {d.status === 'SOLD' && d.orderId ? (
                      <DealButton side={side} label="See the order" onPress={() => router.push(orderPath(d, side))} />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  tabsBox: { flexGrow: 0, marginBottom: 14 },
  // My Offers: the tabs and the list are items of the profile page column
  // (.profile-page-wrap, a 12px gap on phones) on top of the tabs' 14px margin.
  tabsBoxProfile: { marginBottom: 26 },
  tabs: { gap: 6 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  tabOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  tabText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[700] },
  tabTextOn: { color: '#fff' },
  count: { minWidth: 18, paddingHorizontal: 5, borderRadius: 999, backgroundColor: t.danger[500] },
  countText: { fontSize: 11, lineHeight: 18, color: '#fff', textAlign: 'center' },

  loading: { paddingVertical: 36, paddingHorizontal: 12, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[500], textAlign: 'center' },

  list: { gap: 10 },
  row: {
    flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(15, 23, 42, 0.06)' }],
  },
  img: { width: 56, height: 56, overflow: 'hidden', borderRadius: 10, backgroundColor: t.neutral[100] },
  body: { flex: 1, minWidth: 0, gap: 3 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontSize: 15, lineHeight: 24, color: t.neutral[900] },
  badge: { alignSelf: 'center', flexShrink: 0 },
  buyer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  mini: { width: 20, height: 20, borderRadius: 10 },
  miniFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[100] },
  miniText: { fontSize: 11, lineHeight: 14, ...font(700), color: t.primary[700] },
  prices: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, columnGap: 12 },
  priceText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[800] },
  total: { color: t.neutral[900] },
  was: { color: t.neutral[400], textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
});
