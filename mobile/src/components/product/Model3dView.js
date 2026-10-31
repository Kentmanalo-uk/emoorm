import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { themed } from '../../theme';
import { WebView } from 'react-native-webview';
import { BACKEND_URL } from '../../lib/media';
import model3dHtml, { STAGE_BG } from './model3dHtml';

/*
 * A product's 3D model, to turn round and pinch closer: the website's
 * <model-viewer> in a WebView. The web build has its own file
 * (Model3dView.web.js, an iframe) with the same props.
 *
 *   <Model3dView src poster alt onLoad onError />
 *
 * The page runs at the backend's address, so model files under /uploads are
 * fetched from the same place the page is (no cross-origin rules to meet).
 */

const BASE_URL = `${BACKEND_URL}/`;

export default function Model3dView({ src, poster = null, alt, onLoad, onError, style }) {
  const html = useMemo(() => model3dHtml({ src, poster, alt }), [src, poster, alt]);

  const onMessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg?.type === 'load') onLoad?.();
    else if (msg?.type === 'error') onError?.();
  };

  // Nothing in the view goes anywhere else.
  const onShouldStart = (req) => {
    const url = req?.url || '';
    return !url || url === BASE_URL || url.startsWith('about:') || url.startsWith('data:') || req.isTopFrame === false;
  };

  return (
    <View style={[styles.frame, style]}>
      <WebView
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={() => onError?.()}
        onShouldStartLoadWithRequest={onShouldStart}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        setBuiltInZoomControls={false}
        mixedContentMode="always"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // Android: a WebView in a view that animates away can crash the
        // renderer at full opacity (react-native-webview's known workaround).
        style={[styles.web, Platform.OS === 'android' && styles.androidWeb]}
        containerStyle={styles.web}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden', backgroundColor: STAGE_BG },
  web: { flex: 1, backgroundColor: STAGE_BG },
  androidWeb: { opacity: 0.99 },
}));
