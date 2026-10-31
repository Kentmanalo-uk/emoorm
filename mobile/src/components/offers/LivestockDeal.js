import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChatCircleDotsIcon, HandshakeIcon } from '../../lib/icons';
import apiClient from '../../api/client';
import useAuthStore from '../../store/authStore';
import { toast } from '../../lib/toast';
import { font, t, themed } from '../../theme';
import { PriceSheet } from './DealSheets';
import { chatPath, dealStatus, peso } from './offerText';

/*
 * A live animal's way to buy on the product page's bottom bar
 * (web/src/components/offers/LivestockDeal.jsx, variant="bar"): no cart and
 * no fixed price. "Send offer" opens the offer sheet; sent, the deal goes on
 * in the chat with the seller. Once there is a deal, the button says where it
 * stands and opens the chat. The shop's own listing points to its Offers.
 *
 * children(chatTo): the bar's Shop and Chat buttons, drawn by the page; Chat
 * opens the deal's chat once there is one.
 */
export default function LivestockDeal({
  product, listPrice, cannotBuy = false, closedLabel = 'Not available', children,
}) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [deal, setDeal] = useState(null);
  const [making, setMaking] = useState(false);
  const own = Boolean(user?.id && (product?.store?.owner?.id === user.id || product?.store?.ownerId === user.id));
  const productId = product?.id;

  // The buyer's open deal on this animal, looked up again when the page shows.
  useFocusEffect(useCallback(() => {
    if (!isAuthenticated || own || !productId) return undefined;
    let live = true;
    apiClient.get('/offers/mine', { params: { productId, status: 'open' } })
      .then((res) => { if (live) setDeal(res.data?.offers?.[0] || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [isAuthenticated, own, productId]));

  const start = () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(`/product/${product.slug}`)}`);
      return;
    }
    if (deal) { router.push(chatPath(deal)); return; }
    setMaking(true);
  };

  const send = async (body) => {
    const res = await apiClient.post('/offers', { productId, ...body });
    setMaking(false);
    toast.success('Offer sent. Talk it over with the seller here.');
    router.push(chatPath(res.data));
  };

  const status = deal ? dealStatus(deal, 'buyer') : null;
  const messageSeller = product?.store ? `/messages?store=${product.store.id}` : '/messages';

  let button;
  if (own) {
    // The seller's own listing: buyers' offers are in Seller Center › Offers.
    button = (
      <OfferButton Icon={HandshakeIcon} label="See offers" small="Your listing" onPress={() => router.push('/seller/offers')} />
    );
  } else if (cannotBuy && !deal) {
    button = (
      <View style={[styles.offer, styles.closed]} accessibilityState={{ disabled: true }}>
        <Text style={[styles.offerText, styles.closedText]} numberOfLines={1}>{closedLabel}</Text>
      </View>
    );
  } else {
    button = (
      <OfferButton
        Icon={deal ? ChatCircleDotsIcon : HandshakeIcon}
        label={deal ? 'Continue in chat' : 'Send offer'}
        small={deal ? status.label : `Asking ${peso(listPrice)} a head`}
        onPress={start}
      />
    );
  }

  return (
    <>
      {children(deal ? chatPath(deal) : messageSeller)}
      {button}
      {making ? (
        <PriceSheet
          deal={{
            productId,
            name: product.name,
            image: Array.isArray(product.images) ? product.images[0] : null,
            listPrice,
            stock: product.stock,
            weightKg: product.details?.weightKg,
          }}
          onSubmit={send}
          onClose={() => setMaking(false)}
        />
      ) : null}
    </>
  );
}

/** The big button of the bar (.of-bar-offer): icon, the words, a small line under them. */
function OfferButton({
  Icon, label, small, onPress,
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.offer, pressed && styles.offerOn]}>
      <Icon size={20} weight="fill" color="#fff" />
      <View style={styles.offerWords}>
        <Text style={styles.offerText} numberOfLines={1}>{label}</Text>
        <Text style={styles.offerSmall} numberOfLines={1}>{small}</Text>
      </View>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  offer: {
    flex: 1, minWidth: 0, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 10, borderRadius: 14, backgroundColor: t.primary[600],
  },
  offerOn: { backgroundColor: t.primary[700] },
  offerWords: { flexShrink: 1, minWidth: 0 },
  offerText: { fontSize: 16, lineHeight: 18.4, ...font(500), color: t.onBrand },
  offerSmall: { fontSize: 12, lineHeight: 13.8, ...font(500), color: t.onBrand, opacity: 0.9 },
  closed: { backgroundColor: t.neutral[200] },
  closedText: { color: t.neutral[600], textAlign: 'center' },
}));
