import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshTokens, STORAGE_KEYS } from '../../src/api/client';
import useAuthStore from '../../src/store/authStore';
import { BACKEND_URL } from '../../src/lib/media';
import { SellerBackBar } from '../../src/components/seller/SellerTopBars';
import { VideoCameraIcon } from '../../src/lib/icons';
import { font, t, themed } from '../../src/theme';

const KEEP_AWAKE_TAG = 'emoorm-live';

/**
 * Going live (the website's /seller/live). The camera is compressed by the
 * phone's web engine (WebCodecs), which the app has no native equal of, so
 * this screen shows the website's own Go live page (/app-live, the in-app
 * version: no site header) in a web view, signed in as this seller.
 *
 * The app keeps the session: the page gets the current access token, and
 * when it needs a fresh one it asks (window.EmoormApp.renewToken), the app
 * renews its own session and hands the new token over. The refresh token
 * never goes into the page (the server replaces it on every use, and the
 * app would be signed out). The page says when the live starts and ends,
 * so the back bar steps aside while the live fills the screen.
 */
export default function SellerLiveScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const web = useRef(null);
  const [phase, setPhase] = useState('setup');
  const [token, setToken] = useState(null);
  const [allowed, setAllowed] = useState(null);

  // The camera and microphone, asked for by the app (the web view can only
  // use what the app was given).
  const askPermissions = useCallback(async () => {
    const cam = await Camera.requestCameraPermissionsAsync();
    const mic = await Camera.requestMicrophonePermissionsAsync();
    setAllowed(cam.granted && mic.granted);
  }, []);

  useEffect(() => {
    askPermissions();
    AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN).then(setToken);
  }, [askPermissions]);

  // The screen stays on while this page is open.
  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

  // Android's back: while live, the page's own End button ends it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => phase === 'live' || phase === 'starting');
    return () => sub.remove();
  }, [phase]);

  // Before the page's own scripts: the session, and how to ask for more.
  const boot = useMemo(() => {
    if (!token || !user) return null;
    const session = {
      id: user.id, fullName: user.fullName, email: user.email, role: user.role, municipalityId: user.municipalityId ?? null,
    };
    return `(function () {
      try {
        var token = ${JSON.stringify(token)};
        var user = ${JSON.stringify(session)};
        localStorage.setItem('token', token);
        localStorage.setItem('accessToken', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('emoorm-auth', JSON.stringify({ state: { user: user, accessToken: token, isAuthenticated: true }, version: 0 }));
        localStorage.setItem('emoorm.langAsked', '1');
        var waiting = [];
        window.EmoormApp = {
          renewToken: function () {
            return new Promise(function (resolve, reject) {
              waiting.push({ resolve: resolve, reject: reject });
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token' }));
              setTimeout(function () { reject(new Error('No token')); }, 20000);
            });
          },
          setToken: function (fresh) {
            localStorage.setItem('token', fresh);
            localStorage.setItem('accessToken', fresh);
            waiting.splice(0).forEach(function (w) { fresh ? w.resolve(fresh) : w.reject(new Error('No token')); });
          },
        };
      } catch (e) {}
    })(); true;`;
  }, [token, user]);

  const onMessage = useCallback(async (event) => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'phase') setPhase(message.phase);
    if (message.type === 'close') router.back();
    if (message.type === 'token') {
      let fresh = null;
      try { fresh = await refreshTokens(); } catch { /* signed out */ }
      web.current?.injectJavaScript(`window.EmoormApp && window.EmoormApp.setToken(${JSON.stringify(fresh)}); true;`);
    }
  }, [router]);

  const fullScreen = phase === 'live' || phase === 'starting';

  return (
    <View style={styles.screen}>
      <StatusBar style={fullScreen ? 'light' : 'auto'} />
      {!fullScreen ? <SellerBackBar title="Go live" menu={false} /> : null}
      {allowed === false ? (
        <View style={styles.ask}>
          <VideoCameraIcon size={40} weight="fill" color={t.primary[600]} />
          <Text style={styles.askTitle}>Allow the camera and microphone</Text>
          <Text style={styles.askText}>Going live uses them only while you are live. Nothing is recorded.</Text>
          <Pressable style={styles.askBtn} onPress={askPermissions}><Text style={styles.askBtnText}>Try again</Text></Pressable>
          <Pressable onPress={() => Linking.openSettings()}><Text style={styles.askLink}>Open settings</Text></Pressable>
        </View>
      ) : null}
      {allowed && boot ? (
        <WebView
          ref={web}
          source={{ uri: `${BACKEND_URL}/app-live` }}
          injectedJavaScriptBeforeContentLoaded={boot}
          onMessage={onMessage}
          style={styles.web}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          overScrollMode="never"
          androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[50] },
  web: { flex: 1, backgroundColor: 'transparent' },
  ask: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32,
  },
  askTitle: { fontSize: 18, color: t.neutral[900], textAlign: 'center', ...font(600) },
  askText: { fontSize: 14, color: t.neutral[600], textAlign: 'center', lineHeight: 20, ...font(400) },
  askBtn: {
    marginTop: 8, height: 44, paddingHorizontal: 24, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f43f5e',
  },
  askBtnText: { color: '#fff', fontSize: 15, ...font(700) },
  askLink: { color: t.primary[700], fontSize: 14, marginTop: 6, ...font(600) },
}));
