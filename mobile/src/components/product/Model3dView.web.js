import { createElement, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import model3dHtml, { STAGE_BG } from './model3dHtml';

/*
 * The web build's Model3dView (react-native-webview has no web view): the
 * same page in an iframe, answering through postMessage. Same props as
 * Model3dView.js.
 */
let channels = 0;

export default function Model3dView({ src, poster = null, alt, onLoad, onError, style }) {
  const channel = useRef(null);
  if (channel.current === null) { channels += 1; channel.current = `m3d${channels}`; }
  const handlers = useRef({ onLoad, onError });
  handlers.current = { onLoad, onError };
  const html = useMemo(() => model3dHtml({ src, poster, alt, channel: channel.current }), [src, poster, alt]);

  useEffect(() => {
    const onMessage = (event) => {
      const d = event.data;
      if (!d || d.__model3d !== channel.current) return;
      if (d.data?.type === 'load') handlers.current.onLoad?.();
      else if (d.data?.type === 'error') handlers.current.onError?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={[styles.frame, style]}>
      {createElement('iframe', {
        srcDoc: html,
        title: alt || '3D view of the product',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: STAGE_BG },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden', backgroundColor: STAGE_BG },
});
