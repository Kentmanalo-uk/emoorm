import { Share, StyleSheet, Text, View } from 'react-native';
import {
  ArrowSquareOutIcon, EyeIcon, EyeSlashIcon, PencilSimpleIcon, PlusIcon, ShareNetworkIcon, TrashIcon,
} from '../../lib/icons';
import { font, t, themed } from '../../theme';
import { isStockless, productKind } from '../seller/productKinds';
import { statusOf } from '../seller/products/productRules';
import { ProductPeekCard } from './ProductPeek';
import { peekProps } from '../Peek';

/*
 * A product's long-press preview in the Seller Center's My products: the
 * product as buyers see it, its status and stock, and the row's actions:
 * Edit, the stock action, Hide / Show, See it as a buyer, Share, Delete.
 *
 *   const peekMine = useSellerProductPeek();
 *   <Pressable {...peekMine(product, { onEdit, second, onToggleVisibility, onView, onDelete })}>
 *
 * `second`: the row's second button ({ label, onPress }: Add stock, Post today…).
 */
export function useSellerProductPeek() {
  return (product, {
    onEdit, second, onToggleVisibility, onView, onDelete,
  } = {}) => peekProps(() => {
    if (!product) return null;
    const canToggle = product.status === 'APPROVED' || product.status === 'HIDDEN';
    const hidden = product.status === 'HIDDEN';
    const share = async () => {
      try {
        const url = `https://emoorm.shop/product/${product.slug}`;
        await Share.share({ title: product.name, message: `${product.name} on E-MOORM ${url}`, url });
      } catch {
        // Closing the share menu needs no message.
      }
    };
    return {
      content: <SellerProductPeekCard product={product} />,
      onOpen: onEdit ? () => onEdit(product) : undefined,
      actions: [
        onEdit ? { key: 'edit', label: 'Edit', Icon: PencilSimpleIcon, onPress: () => onEdit(product) } : null,
        second ? { key: 'second', label: second.label, Icon: PlusIcon, onPress: second.onPress } : null,
        canToggle && onToggleVisibility ? {
          key: 'visibility', label: hidden ? 'Show to buyers again' : 'Hide from buyers', Icon: hidden ? EyeIcon : EyeSlashIcon,
          onPress: () => onToggleVisibility(product),
        } : null,
        product.slug && onView ? { key: 'view', label: 'See it as a buyer', Icon: ArrowSquareOutIcon, onPress: () => onView(product) } : null,
        product.slug && product.status === 'APPROVED' ? { key: 'share', label: 'Share', Icon: ShareNetworkIcon, onPress: share } : null,
        onDelete ? {
          key: 'delete', label: productKind(product) === 'PACKAGE' ? 'Delete package' : 'Delete product', Icon: TrashIcon, destructive: true,
          onPress: () => onDelete(product),
        } : null,
      ],
    };
  });
}

function SellerProductPeekCard({ product }) {
  const s = statusOf(product);
  const tone = s.tone || {};
  const stock = isStockless(product) ? null : Number(product.stock ?? 0);
  return (
    <View>
      <ProductPeekCard product={product} />
      <View style={styles.facts}>
        <View style={[styles.badge, tone.bg && { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, tone.fg && { color: tone.fg }]}>{s.label}</Text>
        </View>
        {stock != null ? <Text style={styles.stock}>{stock === 0 ? 'Out of stock' : `Stock ${stock}`}</Text> : null}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  facts: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 16, paddingBottom: 14, marginTop: -4,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: t.neutral[100] },
  badgeText: { fontSize: 12.5, lineHeight: 17, ...font(500), color: t.neutral[700] },
  stock: { fontSize: 13, lineHeight: 18, ...font(500), color: t.neutral[700] },
}));
