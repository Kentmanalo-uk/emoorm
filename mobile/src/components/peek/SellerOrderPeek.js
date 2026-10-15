import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRightIcon, EyeIcon, PhoneIcon, UserIcon,
} from 'phosphor-react-native';
import { font, t } from '../../theme';
import ProductImage from '../ProductImage';
import { variationImage } from '../../lib/variationImage';
import {
  ACTION_LABELS, STATUS_MAP, countLabel, lineKind, money, nextStep, orderNo, shortDate,
} from '../seller/orders/sellerOrderLib';
import { peekProps, peekText } from '../Peek';

/*
 * An order's long-press preview in the Seller Center: every item with its
 * quantity and price, the buyer and the total, with Details, the next step,
 * Call buyer and the buyer's profile under it.
 *
 *   const peekOrder = useSellerOrderPeek();
 *   <Pressable {...peekOrder(order, { statusColor, onDetails, onNext })}>
 */

const SHOWN = 5;

export function useSellerOrderPeek() {
  const router = useRouter();
  return (order, { statusColor, onDetails, onNext } = {}) => peekProps(() => {
    if (!order) return null;
    const next = nextStep(order);
    const phone = order.buyer?.contactNumber;
    return {
      content: <SellerOrderPeekCard order={order} statusColor={statusColor} />,
      onOpen: onDetails ? () => onDetails(order) : undefined,
      actions: [
        onDetails ? { key: 'details', label: 'Details', Icon: EyeIcon, onPress: () => onDetails(order) } : null,
        next && onNext ? { key: 'next', label: ACTION_LABELS[next]?.label || next, Icon: ArrowRightIcon, onPress: () => onNext(order, next) } : null,
        phone ? { key: 'call', label: 'Call buyer', Icon: PhoneIcon, onPress: () => Linking.openURL(`tel:${phone}`).catch(() => {}) } : null,
        order.buyer?.id ? { key: 'buyer', label: 'Buyer profile', Icon: UserIcon, onPress: () => router.push(`/u/${order.buyer.id}`) } : null,
      ],
    };
  });
}

function SellerOrderPeekCard({ order, statusColor }) {
  const s = STATUS_MAP[order.status] || { label: order.status };
  const items = order.items || [];
  return (
    <View>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={peekText.title}>#{orderNo(order)}</Text>
          {order.createdAt ? <Text style={peekText.sub}>{shortDate(order.createdAt)}</Text> : null}
        </View>
        <Text style={[styles.status, statusColor && { color: statusColor }]}>{s.label}</Text>
      </View>
      <View style={styles.items}>
        {items.slice(0, SHOWN).map((it, i) => (
          <View key={it.id || i} style={styles.item}>
            <View style={styles.thumb}><ProductImage src={variationImage(it.product, it.selectedVariations)} /></View>
            <View style={styles.itemText}>
              <Text style={styles.itemName} numberOfLines={2}>{it.productName || it.product?.name || 'Product'}</Text>
              <Text style={peekText.sub}>{['LIVESTOCK', 'PACKAGE'].includes(lineKind(it)) ? countLabel(it) : `Qty ${it.quantity}`}</Text>
            </View>
            <Text style={styles.itemPrice}>{money(it.price)}</Text>
          </View>
        ))}
        {items.length > SHOWN ? <Text style={peekText.sub}>+{items.length - SHOWN} more</Text> : null}
      </View>
      <View style={styles.foot}>
        <View style={styles.headText}>
          <Text style={styles.buyer} numberOfLines={1}>{order.buyer?.fullName || 'Buyer'}</Text>
          {order.buyer?.contactNumber ? <Text style={peekText.sub}>{order.buyer.contactNumber}</Text> : null}
        </View>
        <Text style={styles.total}>{money(order.total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  status: { fontSize: 14, lineHeight: 18, ...font(500), color: t.neutral[600] },
  items: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, overflow: 'hidden', borderRadius: 8, backgroundColor: t.neutral[100] },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 14, lineHeight: 18, ...font(400), color: t.neutral[900] },
  itemPrice: { fontSize: 14, lineHeight: 18, ...font(500), color: t.neutral[800] },
  foot: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: t.neutral[100], backgroundColor: t.neutral[50],
  },
  buyer: { fontSize: 15, lineHeight: 19, ...font(500), color: t.neutral[900] },
  total: { fontSize: 18, lineHeight: 22, ...font(500), color: t.primary[700] },
});
