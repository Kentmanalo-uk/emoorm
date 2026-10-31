import { createElement, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { t, themed } from '../../theme';
import leafletHtml from './leafletHtml';
import { mapState } from './mapState';

/*
 * The web build's LeafletMap (react-native-webview has no web view): the same
 * page in an iframe, talking through postMessage. Same props as LeafletMap.js.
 */
let channels = 0;

export default function LeafletMap({ height = 300, style, ...props }) {
  const frameRef = useRef(null);
  const channel = useRef(null);
  if (channel.current === null) { channels += 1; channel.current = `lm${channels}`; }
  const ready = useRef(false);
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  const state = mapState({ ...props, channel: channel.current });
  const stateKey = JSON.stringify(state);
  const latest = useRef(state);
  latest.current = state;
  const html = useMemo(() => leafletHtml(state), []); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (next) => {
    const win = frameRef.current?.contentWindow;
    if (!ready.current || !win) return;
    win.postMessage({ __leafletMapState: true, state: next }, '*');
  };

  useEffect(() => { push(latest.current); }, [stateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMessage = (event) => {
      const d = event.data;
      if (!d || d.__leafletMap !== channel.current) return;
      if (d.data?.type === 'ready') {
        ready.current = true;
        push(latest.current);
      } else if (d.data?.type === 'pick') {
        onPickRef.current?.({ latitude: d.data.latitude, longitude: d.data.longitude });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.frame, { height }, style]}>
      {createElement('iframe', {
        ref: frameRef,
        srcDoc: html,
        title: 'Map',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[150] },
}));
