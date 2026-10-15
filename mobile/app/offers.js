import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import { PageSubtitle } from '../src/components/profile/ProfileUI';
import DealList from '../src/components/offers/DealList';
import useAuthStore from '../src/store/authStore';
import { t } from '../src/theme';

/**
 * /profile/offers, My Offers (web/src/pages/ProfileOffers.jsx): the buyer's
 * offers on livestock. Each is talked over in its chat with the seller, so a
 * deal opens its chat.
 */
export default function ProfileOffersScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Sign-in only, as on the website.
  useEffect(() => {
    if (!isAuthenticated) router.replace(`/login?redirect=${encodeURIComponent('/offers')}`);
  }, [isAuthenticated, router]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Offers" backTo="/profile" />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content}>
        <PageSubtitle>Your offers on livestock. Talk them over in chat, meet the seller, and pay in person.</PageSubtitle>
        {isAuthenticated ? <DealList side="buyer" /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { flexGrow: 1, gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
});
