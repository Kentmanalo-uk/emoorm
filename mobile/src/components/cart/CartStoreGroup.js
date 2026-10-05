import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CaretDownIcon, CaretRightIcon, CheckIcon, MinusIcon, PlusIcon, StorefrontIcon, TrashIcon,
} from 'phosphor-react-native';
import CartProductImage from './CartProductImage';
import { font, t } from '../../theme';
import { cartPeso } from './cartSettings';

/*
 * The phone cart's shop groups (web/src/pages/Cart.jsx .cart-m-store, Cart.css
 * "Phone cart (≤768px)"): a white band per shop with a round check and the
 * shop name ›, then its lines: round check, square photo, one-line name,
 * options pill, price, and a − qty + stepper (a bin at quantity 1).
 */

/** The round selection check (web RoundCheck .cart-m-check): 30px target, 22px circle. */
export function CartRoundCheck({ checked, disabled, onPress, label }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: Boolean(checked), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.check, disabled && styles.checkDisabled]}
    >
      <View style={[styles.checkDot, checked && styles.checkDotOn]}>
        {checked ? <CheckIcon size={14} weight="bold" color={t.neutral[0]} /> : null}
      </View>
    </Pressable>
  );
}

function CartLine({ item, selected, onToggle, onQuantity, onRemove, onRemoveNow }) {
  const router = useRouter();
  const open = () => router.push(`/product/${item.slug || item.productId || item.id}`);
  const options = item.selectedVariations && Object.keys(item.selectedVariations).length > 0
    ? Object.values(item.selectedVariations).join(', ')
    : null;
  const atOne = item.quantity <= 1;
  const maxed = item.quantity >= (item.stock || 999);
  return (
    <View style={styles.item}>
      <CartRoundCheck
        checked={!item.unavailable && selected}
        disabled={Boolean(item.unavailable)}
        onPress={onToggle}
        label={`Select ${item.name}`}
      />
      <Pressable onPress={open} style={[styles.img, item.unavailable && styles.dim]} accessibilityLabel={item.name}>
        <CartProductImage src={item.image} style={styles.imgFill} />
      </Pressable>
      <View style={styles.body}>
        <Pressable onPress={open} style={styles.nameWrap}>
          <Text style={[styles.name, item.unavailable && styles.dim]} numberOfLines={1}>{item.name}</Text>
        </Pressable>
        {options ? (
          <Pressable onPress={open} style={styles.options} accessibilityLabel={`Change options: ${options}`}>
            <Text style={styles.optionsText} numberOfLines={1}>{options}</Text>
            <CaretDownIcon size={12} weight="bold" color={t.neutral[600]} />
          </Pressable>
        ) : null}
        <View style={styles.foot}>
          <Text style={styles.price} numberOfLines={1}>{cartPeso(item.price)}</Text>
          {item.unavailable ? (
            <Pressable accessibilityRole="button" onPress={onRemoveNow} style={styles.remove}>
              <TrashIcon size={15} color={t.danger[600]} />
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          ) : (
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={atOne ? `Remove ${item.name}` : 'Decrease quantity'}
                onPress={() => (atOne ? onRemove() : onQuantity(item.quantity - 1))}
                style={styles.stepBtn}
              >
                {atOne ? <TrashIcon size={15} color={t.neutral[700]} /> : <MinusIcon size={15} color={t.neutral[700]} />}
              </Pressable>
              <Text style={styles.qty}>{item.quantity}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                accessibilityState={{ disabled: maxed }}
                disabled={maxed}
                onPress={() => onQuantity(item.quantity + 1)}
                style={styles.stepBtn}
              >
                <PlusIcon size={15} color={maxed ? t.neutral[300] : t.neutral[700]} />
              </Pressable>
            </View>
          )}
        </View>
        {!item.unavailable && item.stock !== undefined && item.stock !== null && item.stock < 10 && item.stock > 0 ? (
          <Text style={styles.note}>Only {item.stock} left</Text>
        ) : null}
        {item.unavailable ? (
          <Text style={[styles.note, styles.noteBad]}>{item.unavailableReason || 'Unavailable'}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * group: { storeId, storeName, items }
 * slug: the shop's page (looked up by the screen); without it the name is plain.
 */
export default function CartStoreGroup({
  group, slug, selectedSet, onToggleStore, onToggleItem, onQuantity, onRemove, onRemoveNow,
}) {
  const router = useRouter();
  const purchasable = group.items.filter((it) => !it.unavailable);
  const allOn = purchasable.length > 0 && purchasable.every((it) => selectedSet.has(it.id));
  const nameInner = (
    <>
      <StorefrontIcon size={17} weight="fill" color={t.primary[600]} />
      <Text style={styles.storeName} numberOfLines={1}>{group.storeName}</Text>
      {slug ? <CaretRightIcon size={14} weight="bold" color={t.neutral[500]} /> : null}
    </>
  );
  return (
    <View style={styles.store}>
      <View style={styles.storeHead}>
        <CartRoundCheck
          checked={allOn}
          disabled={purchasable.length === 0}
          onPress={() => onToggleStore(group.items)}
          label={`Select all items from ${group.storeName}`}
        />
        {slug ? (
          <Pressable style={styles.storeLink} onPress={() => router.push(`/store/${slug}`)} accessibilityRole="link">
            {nameInner}
          </Pressable>
        ) : (
          <View style={styles.storeLink}>{nameInner}</View>
        )}
      </View>
      {group.items.map((item) => (
        <CartLine
          key={item.id}
          item={item}
          selected={selectedSet.has(item.id)}
          onToggle={() => onToggleItem(item.id)}
          onQuantity={(q) => onQuantity(item.id, q)}
          onRemove={() => onRemove(item.id)}
          onRemoveNow={() => onRemoveNow(item.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  check: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkDisabled: { opacity: 0.4 },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: t.neutral[300],
    backgroundColor: t.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },

  store: { paddingTop: 4, paddingBottom: 8, backgroundColor: t.neutral[0] },
  storeHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, paddingRight: 12, paddingBottom: 6, paddingLeft: 8 },
  storeLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 },
  storeName: { flexShrink: 1, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[900] },

  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingRight: 12, paddingBottom: 10, paddingLeft: 8 },
  img: { width: 88, height: 88, borderRadius: 6, overflow: 'hidden', backgroundColor: t.neutral[100], flexShrink: 0 },
  imgFill: { width: '100%', height: '100%' },
  dim: { opacity: 0.5 },
  body: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 6 },
  nameWrap: { alignSelf: 'stretch' },
  name: { fontSize: 14.5, lineHeight: 18.85, ...font(400), color: t.neutral[900] },
  options: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: t.neutral[100],
  },
  optionsText: { flexShrink: 1, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[600] },
  foot: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  price: { fontSize: 16.5, lineHeight: 26.4, ...font(500), color: t.primary[700] },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 8,
  },
  stepBtn: { width: 32, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0] },
  qty: {
    minWidth: 30,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: t.neutral[200],
    fontSize: 14,
    lineHeight: 30,
    ...font(400),
    color: t.neutral[900],
    textAlign: 'center',
  },
  note: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.warning[600] },
  noteBad: { color: t.danger[600] },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: t.danger[200],
    borderRadius: 8,
  },
  removeText: { fontSize: 13, lineHeight: 15.6, ...font(400), color: t.danger[600] },
});
