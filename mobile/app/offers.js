import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import { PageSubtitle } from '../src/components/profile/ProfileUI';
import DealList from '../src/components/offers/DealList';
import useAuthStore from '../src/store/authStore';
import { t, themed } from '../src/theme';
import { PullScrollView } from '../src/components/PullList';

/**
 * /profile/offers, My Offers (web/src/pages/ProfileOffers.jsx): the buyer's
 * offers on livestock. Each is talked over in its chat with the seller, so a
 * deal opens its chat.
 */
export default function ProfileOffersScreen() {
  const [pullKey, setPullKey] = useState(0);
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Sign-in only, as on the website.
  useEffect(() => {
    if (!isAuthenticated) router.replace(`/login?redirect=${encodeURIComponent('/offers')}`);
  }, [isAuthenticated, router]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Offers" backTo="/profile" />
      <PullScrollView onPull={() => setPullKey((key) => key + 1)} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content}>
        <PageSubtitle>Your offers on livestock. Talk them over in chat, meet the seller, and pay in person.</PageSubtitle>
        {isAuthenticated ? <DealList side="buyer" refreshKey={pullKey} /> : null}
      </PullScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { flexGrow: 1, gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
}));
