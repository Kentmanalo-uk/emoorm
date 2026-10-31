import { useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { t, themed } from '../../theme';
import leafletHtml from './leafletHtml';
import { mapState } from './mapState';

/*
 * A Leaflet map with OpenStreetMap tiles, drawn in a WebView (the website's
 * react-leaflet maps: web/src/components/maps/StoreLocationMap.jsx and
 * PickupRoute.jsx). The web build has its own file (LeafletMap.web.js, an
 * iframe) with the same props.
 *
 * <LeafletMap
 *   height={300}
 *   pickable pin={{ latitude, longitude }} onPick={({ latitude, longitude }) => …}
 *   lockToPhilippines
 *   shop={{ latitude, longitude, name, logo }} me={[lat, lng]}
 *   route={{ line: [[lat, lng]…], byRoad }} fitPoints={[[lat, lng]…]}
 * />
 *
 * The map is a native view inside its own clipped frame, so it never draws
 * over the screen's header or bars. Inside a ScrollView a drag moves the map,
 * not the page (Android: nestedScrollEnabled keeps the touch in the map).
 */

// Tiles and logos are fetched as from the website (its address as the referrer).
const BASE_URL = 'https://emoorm.shop/';

export default function LeafletMap({ height = 300, style, ...props }) {
  const webRef = useRef(null);
  const ready = useRef(false);
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  const state = mapState(props);
  const stateKey = JSON.stringify(state);
  const latest = useRef(state);
  latest.current = state;

  // The page starts from the first state; later ones are sent to it.
  const html = useMemo(() => leafletHtml(state), []); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (next) => {
    if (!ready.current || !webRef.current) return;
    webRef.current.injectJavaScript(`window.__lmApply && window.__lmApply(${JSON.stringify(next).replace(/</g, '\\u003c')}); true;`);
  };

  useEffect(() => { push(latest.current); }, [stateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg?.type === 'ready') {
      ready.current = true;
      push(latest.current);
    } else if (msg?.type === 'pick') {
      onPickRef.current?.({ latitude: msg.latitude, longitude: msg.longitude });
    }
  };

  // Links in the map (the OpenStreetMap credit) open in the browser.
  const onShouldStart = (req) => {
    const url = req?.url || '';
    if (!url || url === BASE_URL || url.startsWith('about:') || url.startsWith('data:')) return true;
    if (req.isTopFrame === false) return true;
    Linking.openURL(url).catch(() => {});
    return false;
  };

  return (
    <View style={[styles.frame, { height }, style]}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        setBuiltInZoomControls={false}
        mixedContentMode="compatibility"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // Android: a WebView in a screen that animates away can crash the
        // renderer at full opacity (react-native-webview's known workaround).
        style={[styles.web, Platform.OS === 'android' && styles.androidWeb]}
        containerStyle={styles.web}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[150] },
  web: { flex: 1, backgroundColor: t.neutral[150] },
  androidWeb: { opacity: 0.99 },
}));
