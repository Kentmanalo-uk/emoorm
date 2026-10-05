import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretRightIcon, LockSimpleIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import { useSellerShell } from './SellerShell';
import { SellerBackBar, SellerTabHeader } from './SellerTopBars';
import { PHONE_OWN_HEADER, PHONE_TABS, cleanSellerPath, sellerHref } from './sellerRoutes';
import { setupNextTo } from './sellerSetup';

/*
 * One Seller Center page on phones (web .sc-content inside SellerLayout):
 * its top bar, then a white page with the website's 12px gutters
 * (padding 4px 12px; 16px under the content of a tab page, room for the
 * phone's home bar under an inner one), and the "Private until approved"
 * line while the shop waits for approval.
 *
 * <SellerPage>…</SellerPage>                    an inner page: SellerBackBar
 * <SellerPage header={<SellerChatHeader />}>   a tab page with its own bar
 * Props:
 *   header       the bar (default: SellerBackBar on inner pages, SellerTabHeader
 *                on tab pages); false for none
 *   title, action, menuItems, onBack   passed to the default SellerBackBar
 *   scroll       false: the body is a plain flex View (lists bring their own
 *                FlatList; give it contentContainerStyle={sellerPageStyles.content})
 *   refreshing, onRefresh   pull to refresh (scrolling pages)
 *   contentStyle  more style for the scrolling content
 *   privateLine  false hides the "Private until approved" line
 */
export default function SellerPage({
  header, title, action, menuItems, onBack, scroll = true, refreshing, onRefresh, contentStyle, privateLine = true, children,
}) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const path = cleanSellerPath(pathname);
  const isTab = PHONE_TABS.includes(path);
  const bar = header === undefined
    ? (isTab ? <SellerTabHeader /> : <SellerBackBar title={title} action={action} menuItems={menuItems} onBack={onBack} />)
    : header;
  const showPrivate = privateLine && !PHONE_OWN_HEADER.includes(path);
  const bottom = isTab ? 16 : 24 + insets.bottom;

  return (
    <View style={styles.screen}>
      {bar || null}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: bottom }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} colors={[t.primary[600]]} tintColor={t.primary[600]} /> : undefined}
        >
          {showPrivate ? <SellerPrivateLine /> : null}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          {showPrivate ? <View style={styles.privateWrap}><SellerPrivateLine /></View> : null}
          {children}
        </View>
      )}
    </View>
  );
}

/**
 * While the shop waits for approval: one short line that opens what to
 * finish first (web .scm-private). Renders nothing for an approved shop.
 */
export function SellerPrivateLine() {
  const router = useRouter();
  const { store, setup } = useSellerShell();
  if (!store || store.isApproved !== false) return null;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(sellerHref(setupNextTo(setup)))} style={styles.private}>
      <LockSimpleIcon size={15} weight="fill" color={t.warning[600]} />
      <Text style={styles.privateText}>Private until approved</Text>
      <CaretRightIcon size={14} weight="bold" color={t.neutral[300]} />
    </Pressable>
  );
}

/** For pages that bring their own list: the page background and gutters. */
export const sellerPageStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { paddingTop: 4, paddingHorizontal: 12, paddingBottom: 16 },
});

const styles = StyleSheet.create({
  screen: sellerPageStyles.screen,
  flex: { flex: 1 },
  content: sellerPageStyles.content,
  privateWrap: { paddingTop: 4, paddingHorizontal: 12 },
  private: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: t.neutral[0],
  },
  privateText: { flex: 1, fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(400) },
});
