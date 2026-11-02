import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import {
  Animated, Easing, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  ChatCircleDotsIcon, ChatTextIcon, CheckIcon, EnvelopeSimpleIcon, FacebookLogoIcon,
  InstagramLogoIcon, LinkSimpleIcon, MessengerLogoIcon, TelegramLogoIcon, WhatsappLogoIcon,
  XLogoIcon,
} from '../lib/icons';
import { toast } from '../lib/toast';
import BrandDisc from './BrandDisc';
import { font, t, themed } from '../theme';

/*
 * Sharing a link, as the website does it (web/src/components/ShareSheet.jsx).
 *
 * The app used to hand everything to the phone's own share sheet. That
 * works, but it is a long alphabetical list of every app installed, and
 * the two things people actually do here -- send it to someone on
 * Messenger, or copy the link -- are buried in it. This is the website's
 * row of named places instead, with the system sheet still one tap away
 * under "More".
 *
 *   const { share, shareSheet } = useShare();
 *   <Pressable onPress={() => share({ title, text, url })}>…
 *   {shareSheet}
 *
 * With `preview` (a file:// image of the page, from lib/useScreenshot)
 * the sheet shows what was captured above the row, so it is obvious what
 * is about to be sent -- and the picture itself goes with the link.
 *
 * Instagram is deliberately absent: it has no way to receive a link from
 * another app -- no share URL, no scheme that accepts one -- so a button
 * for it could only open Instagram and lose what you were sharing. Copy
 * link is what people use for it, and it is the first thing in the row.
 */

/** Where each one sends the link. */
const targets = ({ url, title, text }) => {
  const u = encodeURIComponent(url);
  const line = encodeURIComponent(`${text || title} ${url}`.trim());
  const words = encodeURIComponent(text || title);
  return [
    { key: 'copy', label: 'Copy link', Icon: LinkSimpleIcon, color: '#334155', copy: true },
    { key: 'messenger', label: 'Messenger', Icon: MessengerLogoIcon, color: '#0084FF', gradient: 'messenger', href: `fb-messenger://share/?link=${u}` },
    { key: 'facebook', label: 'Facebook', Icon: FacebookLogoIcon, color: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    // Not a link button: see openInstagram below.
    { key: 'instagram', label: 'Instagram', Icon: InstagramLogoIcon, color: '#E1306C', gradient: 'instagram', instagram: true },
    { key: 'viber', label: 'Viber', Icon: ChatCircleDotsIcon, color: '#7360F2', href: `viber://forward?text=${line}` },
    { key: 'whatsapp', label: 'WhatsApp', Icon: WhatsappLogoIcon, color: '#25D366', href: `https://wa.me/?text=${line}` },
    { key: 'telegram', label: 'Telegram', Icon: TelegramLogoIcon, color: '#229ED9', gradient: 'telegram', href: `https://t.me/share/url?url=${u}&text=${words}` },
    { key: 'x', label: 'X', Icon: XLogoIcon, color: '#000000', href: `https://twitter.com/intent/tweet?url=${u}&text=${words}` },
    { key: 'sms', label: 'Messages', Icon: ChatTextIcon, color: '#16a34a', href: `sms:?&body=${line}` },
    { key: 'email', label: 'Email', Icon: EnvelopeSimpleIcon, color: '#6b7280', href: `mailto:?subject=${encodeURIComponent(title)}&body=${line}` },
  ];
};

// Long enough to read as a movement, short enough not to be in the way.
// Out is quicker than in, as a sheet being dismissed should be.
const IN_MS = 260;
const OUT_MS = 180;

export function ShareSheetView({ payload, heading = 'Share to', preview, onClose }) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  // One value drives the dim, the preview and the sheet together, so they
  // arrive and leave as one thing rather than three.
  const show = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(show, {
      toValue: 1,
      duration: IN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [show]);

  /** Fades everything out, then unmounts: closing should not just vanish. */
  const close = useCallback(() => {
    Animated.timing(show, {
      toValue: 0,
      duration: OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished) onClose(); });
  }, [onClose, show]);

  // The sheet slides its own full height, so it comes from below the
  // edge of the screen rather than nudging up 28px. Measured on layout
  // because it depends on the row, the buttons and the home bar; until
  // it is measured a sensible guess keeps it off screen rather than
  // flashing in place.
  const [sheetH, setSheetH] = useState(320);
  const rise = show.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] });
  const grow = show.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  /**
   * Instagram takes pictures, not links -- it has no share URL and no
   * scheme that accepts one. With a picture, the system sheet lists
   * Instagram and can hand it over. Without one, the link goes to the
   * clipboard and Instagram opens, so it can be pasted into a message
   * or a profile rather than being lost.
   */
  const openInstagram = async () => {
    if (preview) {
      try {
        const Sharing = require('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(preview, { dialogTitle: payload.title, mimeType: 'image/png' });
          close();
          return;
        }
      } catch { /* falls through to the link below */ }
    }
    await Clipboard.setStringAsync(payload.url).catch(() => {});
    toast.success('Link copied — paste it in Instagram');
    try {
      if (await Linking.canOpenURL('instagram://app')) await Linking.openURL('instagram://app');
    } catch { /* not installed; the link is on the clipboard either way */ }
    close();
  };

  const open = async (target) => {
    if (target.instagram) { await openInstagram(); return; }
    if (target.copy) {
      await Clipboard.setStringAsync(payload.url).catch(() => {});
      setCopied(true);
      toast.success('Link copied');
      setTimeout(close, 450);
      return;
    }
    try {
      const can = await Linking.canOpenURL(target.href);
      // A scheme for an app that is not installed (fb-messenger://,
      // viber://) cannot be opened, and opening it anyway shows the
      // person an error from the system rather than from us.
      if (!can) { toast.error(`${target.label} is not installed`); return; }
      await Linking.openURL(target.href);
      close();
    } catch {
      toast.error(`Could not open ${target.label}`);
    }
  };

  /** The phone's own sheet, with the picture attached when there is one. */
  const more = async () => {
    close();
    const message = `${payload.text || payload.title} ${payload.url}`.trim();
    try {
      if (preview) {
        const Sharing = require('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(preview, { dialogTitle: payload.title, mimeType: 'image/png' });
          return;
        }
      }
      await Share.share({ title: payload.title, message, url: payload.url });
    } catch {
      // Closing the share menu needs no message.
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[styles.scrim, { opacity: show }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close sharing" />
      </Animated.View>

      {preview ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.previewWrap, { opacity: show, transform: [{ scale: grow }] }]}
        >
          <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />
        </Animated.View>
      ) : null}

      <Animated.View
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== sheetH) setSheetH(h);
        }}
        style={[
          styles.sheet,
          { paddingBottom: Math.max(12, insets.bottom), transform: [{ translateY: rise }] },
        ]}
      >
        <Text style={styles.heading}>{heading}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          keyboardShouldPersistTaps="handled"
        >
          {targets(payload).map((target) => (
            <Pressable
              key={target.key}
              accessibilityRole="button"
              accessibilityLabel={target.label}
              onPress={() => open(target)}
              style={({ pressed }) => [styles.target, pressed && styles.targetPressed]}
            >
              <BrandDisc gradient={target.gradient} color={target.color}>
                {target.copy && copied
                  ? <CheckIcon size={24} weight="bold" color="#fff" />
                  : <target.Icon size={26} weight="fill" color="#fff" />}
              </BrandDisc>
              <Text style={styles.targetText} numberOfLines={1}>
                {target.copy && copied ? 'Copied' : target.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable accessibilityRole="button" onPress={more} style={({ pressed }) => [styles.more, pressed && styles.morePressed]}>
          <Text style={styles.moreText}>{preview ? 'Send the picture…' : 'More…'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.cancel, pressed && styles.morePressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

/*
 * The same sheet, openable from anywhere.
 *
 * Sharing is offered from peek menus and overlays that are not screens
 * and have nowhere of their own to render a modal, so the sheet is
 * hosted once in app/_layout (as AccountSheet and Peek are) and opened
 * by calling openShare(). Screens that hold their own state -- the
 * product and shop pages, which also pass a screenshot -- keep using
 * the hook below.
 */
const useShareStore = create((set) => ({
  state: null,
  // Every mounted host, in the order they mounted. The last of them is the
  // innermost, and the only one that draws.
  hosts: [],
  addHost: (id) => set((st) => ({ hosts: [...st.hosts, id] })),
  dropHost: (id) => set((st) => ({ hosts: st.hosts.filter((h) => h !== id) })),
  show: (payload, options = {}) => set({
    state: { payload, heading: options.heading || 'Share to', preview: options.preview || null },
  }),
  hide: () => set({ state: null }),
}));

/**
 * Opens the share sheet from anywhere.
 * @param {Object} payload - { title, text, url }
 * @param {Object} [options] - { heading, preview }
 */
export const openShare = (payload, options) => useShareStore.getState().show(payload, options);

/**
 * The sheet, wherever it is asked for.
 *
 * Mounted at the app's root, and again inside anything that covers the
 * screen with a Modal of its own -- the review viewer, the product photo
 * viewer. A Modal presented from the root cannot come up over another
 * Modal that is already presented; on iOS it simply does not appear, which
 * is why sharing from inside a viewer used to look like nothing happening.
 *
 * They share the one store and only the last-mounted draws, which is
 * always the innermost: the viewer while it is open, the root when it is
 * not. Anything else full screen can drop a <ShareSheetHost /> in and
 * needs to know nothing more than that.
 */
export function ShareSheetHost() {
  const id = useId();
  const { state, hide, hosts, addHost, dropHost } = useShareStore();
  useEffect(() => {
    addHost(id);
    return () => dropHost(id);
  }, [id, addHost, dropHost]);
  if (!state || hosts[hosts.length - 1] !== id) return null;
  return (
    <ShareSheetView
      payload={state.payload}
      heading={state.heading}
      preview={state.preview}
      onClose={hide}
    />
  );
}

/**
 * share({ title, text, url }, { heading, preview }) opens the sheet;
 * render `shareSheet` once in the screen.
 */
export default function useShare() {
  const [state, setState] = useState(null);

  const share = useCallback((payload, options = {}) => {
    setState({ payload, heading: options.heading || 'Share to', preview: options.preview || null });
  }, []);

  const shareSheet = state
    ? (
      <ShareSheetView
        payload={state.payload}
        heading={state.heading}
        preview={state.preview}
        onClose={() => setState(null)}
      />
    )
    : null;

  return { share, shareSheet };
}

const styles = themed(() => StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  // The captured page, floating above the sheet. Sized to leave the row
  // and the buttons room; contain, so a tall page is shown whole rather
  // than cropped to its middle.
  previewWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '6%',
    bottom: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  preview: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: t.neutral[0],
  },
  heading: { paddingHorizontal: 18, paddingBottom: 12, fontSize: 15, lineHeight: 24, ...font(600), color: t.neutral[900] },
  row: { paddingHorizontal: 14, gap: 14, paddingBottom: 4 },
  target: { width: 68, alignItems: 'center', gap: 6 },
  targetPressed: { opacity: 0.6 },
  targetText: { fontSize: 11.5, lineHeight: 15, ...font(400), color: t.neutral[700], textAlign: 'center' },
  more: { marginTop: 12, marginHorizontal: 14, paddingVertical: 13, borderRadius: 12, backgroundColor: t.neutral[100], alignItems: 'center' },
  morePressed: { opacity: 0.7 },
  moreText: { fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[800] },
  cancel: { marginTop: 8, marginHorizontal: 14, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 15, lineHeight: 24, ...font(600), color: t.neutral[600] },
}));
