import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

/*
 * What a person sees instead of "E-MOORM keeps stopping".
 *
 * Without it, one screen that throws while drawing (2.3.0: a gradient on
 * Home) closes the whole app on every phone. The root layout exports this
 * as expo-router's ErrorBoundary, so the error stays on screen with a way
 * back, and the rest of the app keeps working.
 *
 * Plain colours only: the theme itself may be what broke.
 */
export function AppErrorScreen({ error, retry }) {
  return (
    <View style={styles.screen} accessibilityRole="alert">
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>This page could not open. Try again, or go back and open it once more.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      {__DEV__ && error?.message ? <Text style={styles.detail}>{String(error.message)}</Text> : null}
    </View>
  );
}

// Errors outside drawing (a tap, a timer) are fatal in a release build, and
// a fatal error closes the app. Once the app is up, they are reported and
// shown as a short notice instead; before that (the app still starting),
// they go to React Native as before, since there is nothing to keep open.
let appIsUp = false;
export const markAppUp = () => { appIsUp = true; };

export function keepAppOpenOnErrors() {
  const handler = globalThis.ErrorUtils?.getGlobalHandler?.();
  if (!handler || __DEV__ || globalThis.__emoormErrorsHandled) return;
  globalThis.__emoormErrorsHandled = true;
  globalThis.ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (!appIsUp) {
      handler(error, isFatal);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[app] kept open after an error:', error);
    try {
      Toast.show({ type: 'error', text1: 'Something went wrong', text2: 'Please try that again.' });
    } catch {
      // No notice then; the app stays open either way.
    }
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#ffffff',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  body: { marginTop: 10, fontSize: 15, lineHeight: 22, color: '#4b5563', textAlign: 'center' },
  button: {
    marginTop: 24, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 999, backgroundColor: '#055D07',
  },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  detail: { marginTop: 18, fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});
