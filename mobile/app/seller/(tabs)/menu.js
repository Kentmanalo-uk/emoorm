import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowsLeftRightIcon, CaretRightIcon, SignOutIcon, StorefrontIcon, TruckIcon } from 'phosphor-react-native';
import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';
import { SellerMeHeader } from '../../../src/components/seller/SellerTopBars';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import { font, t } from '../../../src/theme';

// /seller/menu (Me). STUB: the header is done (SellerMeHeader: Share shop,
// Shop settings, ⋯). Port the body from web/src/pages/SellerMenu.jsx +
// SellerApp.css (.sme-*). Until then a few rows keep the way to the shop
// pages and out of the Seller Center (switch account, log out).
export default function SellerMeScreen() {
  const router = useRouter();
  const { store, switchToPersonal, requestLogout } = useSellerShell();
  const name = store?.name || 'My shop';
  const canShare = Boolean(store?.slug && store?.isApproved !== false);
  const share = () => Share.share({ title: name, message: `Shop at ${name} on Emoorm` }).catch(() => {});
  const rows = [
    { key: 'store', label: 'Shop profile', Icon: StorefrontIcon, onPress: () => router.push('/seller/store') },
    { key: 'fulfillment', label: 'Delivery & payment', Icon: TruckIcon, onPress: () => router.push('/seller/fulfillment') },
    { key: 'switch', label: 'Switch to Personal Account', Icon: ArrowsLeftRightIcon, onPress: switchToPersonal },
    { key: 'logout', label: 'Log out', Icon: SignOutIcon, onPress: requestLogout, danger: true },
  ];
  return (
    <SellerPage header={<SellerMeHeader onShare={canShare ? share : undefined} />}>
      <SellerPlaceholder source="web/src/pages/SellerMenu.jsx" />
      <View style={styles.list}>
        {rows.map(({ key, label, Icon, onPress, danger }) => (
          <Pressable key={key} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Icon size={19} weight="fill" color={danger ? t.danger[600] : t.neutral[700]} />
            <Text style={[styles.label, danger && { color: t.danger[600] }]}>{label}</Text>
            <CaretRightIcon size={16} color={t.neutral[300]} />
          </Pressable>
        ))}
      </View>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: 1, borderBottomColor: t.neutral[100] },
  pressed: { backgroundColor: t.neutral[50] },
  label: { flex: 1, fontSize: 15, lineHeight: 22, color: t.neutral[800], ...font(400) },
});
