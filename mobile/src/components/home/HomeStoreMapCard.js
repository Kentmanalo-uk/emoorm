import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPinIcon, NavigationArrowIcon, StorefrontIcon, XIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';

/*
 * The pieces of Home's "Discover Stores" map that every phone draws the same
 * (HomeStoresMap.js on Android and the web, HomeStoresMap.ios.js on Apple
 * Maps): a shop's round profile pin and the tapped shop's card docked to the
 * bottom of the map.
 */

// Directions in the phone's own maps app: Apple Maps on iPhones, Google Maps elsewhere.
export const directionsUrl = (store) => (Platform.OS === 'ios'
  ? `https://maps.apple.com/?daddr=${store.latitude},${store.longitude}`
  : `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`);

/**
 * A shop's round profile pin (its initial under the picture), 44 × 54, its
 * tip at the bottom middle. A shop placed from its address (store.pinned ===
 * false) gets a dashed amber ring: its spot is about right, not exact. The
 * selected shop's ring turns pink.
 */
export function StoreMapPinFace({ store, selected = false }) {
  const logo = resolveImg(store.logo);
  const approx = store.pinned === false;
  return (
    <View style={styles.pin}>
      <View style={[styles.pinTip, approx && styles.pinTipApprox, selected && styles.pinTipSelected]} />
      <View style={[styles.avatar, approx && styles.avatarApprox, selected && styles.avatarSelected]}>
        <Text style={styles.avatarInitial}>{(store.name || '?').charAt(0).toUpperCase()}</Text>
        {logo ? <Image source={{ uri: logo }} style={styles.avatarImage} /> : null}
      </View>
    </View>
  );
}

/** The tapped shop's card, docked to the bottom of the map. */
export function StoreMapCard({ store, onClose, onOpen }) {
  const logo = resolveImg(store.logo);
  const address = [store.pickupAddress, store.municipality?.name, store.province || 'Oriental Mindoro'].filter(Boolean).join(', ');
  return (
    <View style={styles.card} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.cardClose}>
        <XIcon size={18} color={t.neutral[500]} />
      </Pressable>
      <View style={styles.cardAvatar}>
        {logo ? <Image source={{ uri: logo }} style={styles.fill} /> : <StorefrontIcon size={34} color={t.primary[600]} />}
      </View>
      <Text style={styles.cardName} numberOfLines={1}>{store.name}</Text>
      <View style={styles.cardAddress}>
        <MapPinIcon size={14} color={t.neutral[500]} style={styles.cardAddressIcon} />
        <Text style={styles.cardAddressText}>{address}</Text>
      </View>
      {store.description ? <Text style={styles.cardDesc} numberOfLines={2}>{store.description}</Text> : null}
      <View style={styles.cardActions}>
        {/* Directions only to a real pin: a shop placed from its address is about right, not exact. */}
        {store.pinned === false ? null : (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(directionsUrl(store)).catch(() => {})}
            style={[styles.cardBtn, styles.cardBtnPrimary]}
          >
            <NavigationArrowIcon size={16} weight="fill" color={t.neutral[0]} />
            <Text style={[styles.cardBtnText, styles.cardBtnTextPrimary]} numberOfLines={1}>Get directions</Text>
          </Pressable>
        )}
        {store.slug ? (
          <Pressable accessibilityRole="link" onPress={onOpen} style={styles.cardBtn}>
            <StorefrontIcon size={16} color={t.primary[700]} />
            <Text style={styles.cardBtnText} numberOfLines={1}>View store profile</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },

  pin: { width: 44, height: 54 },
  pinTip: {
    position: 'absolute', left: 15, bottom: 2, width: 14, height: 14, backgroundColor: t.primary[600],
    transform: [{ rotate: '45deg' }],
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: t.primary[600], backgroundColor: t.neutral[0],
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 6, color: 'rgba(15, 23, 42, 0.3)' }],
  },
  pinTipApprox: { backgroundColor: '#f59e0b' },
  pinTipSelected: { backgroundColor: t.accent[500] },
  avatarApprox: { borderColor: '#f59e0b', borderStyle: 'dashed' },
  avatarSelected: { borderColor: t.accent[500], borderStyle: 'solid' },
  avatarInitial: { fontSize: 17, lineHeight: 22, ...font(500), color: t.primary[600] },
  avatarImage: { ...StyleSheet.absoluteFill, backgroundColor: t.neutral[0] },

  card: {
    position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center',
    paddingTop: 16, paddingHorizontal: 14, paddingBottom: 14, borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(15, 23, 42, 0.2)' }],
  },
  cardClose: { position: 'absolute', top: 4, right: 4, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  cardAvatar: {
    width: 52, height: 52, marginBottom: 8, borderRadius: 26, borderWidth: 2, borderColor: t.primary[600],
    backgroundColor: t.primary[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  cardName: { maxWidth: '100%', paddingHorizontal: 28, marginBottom: 6, fontSize: 16, lineHeight: 22, ...font(500), color: t.secondary[950] },
  cardAddress: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  cardAddressIcon: { marginTop: 2 },
  cardAddressText: { flexShrink: 1, fontSize: 12, lineHeight: 16.8, ...font(400), color: t.neutral[500], textAlign: 'center' },
  cardDesc: { marginTop: 6, fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[600], textAlign: 'center' },
  cardActions: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 12 },
  cardBtn: {
    flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, borderColor: t.primary[600], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  cardBtnPrimary: { backgroundColor: t.primary[600] },
  cardBtnText: { fontSize: 13, lineHeight: 18, ...font(500), color: t.primary[700] },
  cardBtnTextPrimary: { color: t.neutral[0] },
});
