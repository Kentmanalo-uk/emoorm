import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRightIcon, LockSimpleIcon } from '../../src/lib/icons';
import SellerPage from '../../src/components/seller/SellerPage';
import { useSellerShell } from '../../src/components/seller/SellerShell';
import IdentityVerifier from '../../src/components/seller/verification/IdentityVerifier';
import { font, t, themed } from '../../src/theme';

/**
 * /seller/verification (web/src/pages/SellerVerification.jsx; SellerSetup.css
 * .sv): verify identity inside the Seller Center, after applying. A line on
 * privacy, then the shared ID check; once verified, Go to dashboard. The
 * result also arrives as a Seller Center notification, and Shop setup
 * refreshes so the dashboard stops reminding.
 */
export default function SellerVerificationScreen() {
  const router = useRouter();
  const { refreshSetup } = useSellerShell();
  const [status, setStatus] = useState(null);
  const verified = status?.status === 'VERIFIED';

  return (
    <SellerPage>
      <View style={styles.privacy}>
        <LockSimpleIcon size={15} weight="fill" color={t.primary[700]} />
        <Text style={styles.privacyText}>Your ID photo is only read, never stored. Only the result is kept.</Text>
      </View>

      <IdentityVerifier
        verifiedText="Your identity is verified. Thank you! The admin can see your shop is verified."
        supportPath="/seller/support"
        onStatus={setStatus}
        onVerified={() => refreshSetup?.()}
      />

      {verified ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/seller')}
          style={({ pressed }) => [styles.next, pressed && { backgroundColor: t.primary[700] }]}
        >
          <Text style={styles.nextText}>Go to dashboard</Text>
          <ArrowRightIcon size={17} weight="bold" color={t.neutral[0]} />
        </Pressable>
      ) : null}
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  // .sv-privacy on phones: a green band across the screen, 8px grey under it.
  privacy: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: -12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: t.primary[50], borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  privacyText: { flex: 1, fontSize: 13.5, lineHeight: 20.25, color: t.primary[700], ...font(400) },
  // .sv-after .ss-next-btn
  next: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginTop: 16,
    paddingHorizontal: 22, borderRadius: 999, backgroundColor: t.primary[600],
  },
  nextText: { fontSize: 15, lineHeight: 20, color: t.neutral[0], ...font(700) },
}));
