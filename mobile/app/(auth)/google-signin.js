import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AuthSheet from '../../src/components/auth/AuthSheet';
import { BusyLabel } from '../../src/components/auth/AuthForm';
import { finishGoogleSignIn, hasGoogleListener } from '../../src/components/auth/googleSignIn';
import { font, t } from '../../src/theme';

/**
 * Where the phone's browser comes back after "Continue with Google"
 * (shop.emoorm.app://google-signin?ticket=… or ?error=…, see
 * src/components/auth/googleSignIn.js) when it comes by the app's link
 * (Android, an older app's browser): swaps the pass for Google's answer and
 * hands it to the Log in / Sign up sheet that asked, which carries on as the
 * website's does (signed in, or "Complete your account"). An answer the
 * sign-in browser already brought back is not used twice.
 */
export default function GoogleSignInReturn() {
  const params = useLocalSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const { after, again } = await finishGoogleSignIn({
        ticket: typeof params.ticket === 'string' ? params.ticket : '',
        error: typeof params.error === 'string' ? params.error : '',
      });

      // Already finished by the sign-in browser: just leave this screen.
      if (again) {
        if (router.canGoBack()) router.back();
        else router.replace('/');
        return;
      }
      // Back to the sheet that started it, or open it when the app was closed.
      if (hasGoogleListener() && router.canGoBack()) {
        router.back();
        return;
      }
      const pathname = after.from === 'register' ? '/register' : after.seller ? '/seller-login' : '/login';
      router.replace({ pathname, params: after.redirect ? { redirect: after.redirect } : {} });
    })();
  }, [params.ticket, params.error]);

  return (
    <AuthSheet>
      <View style={styles.busy}>
        <BusyLabel color={t.neutral[500]} textStyle={styles.busyText}>Signing in…</BusyLabel>
      </View>
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  busy: { paddingTop: 48, alignItems: 'center' },
  busyText: { fontSize: 15, lineHeight: 22.5, color: t.neutral[500], ...font(400) },
});
