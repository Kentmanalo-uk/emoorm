import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';

const native = Platform.OS !== 'web';

/**
 * Picks a photo to search with: the camera or the gallery on a phone (the
 * website's file input offers both there), a file chooser on the web.
 * Resolves with an expo-image-picker asset, or null.
 */
export async function pickSearchImage({ source } = {}) {
  const choose = source || (native ? await new Promise((resolve) => {
    Alert.alert('Search by image', undefined, [
      { text: 'Take photo', onPress: () => resolve('camera') },
      { text: 'Choose from gallery', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  }) : 'library');
  if (!choose) return null;
  try {
    if (choose === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        toast.error('Camera permission is required');
        return null;
      }
    }
    const options = { mediaTypes: ['images'], quality: 0.85 };
    const result = choose === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return null;
    // Images only, as the website's file input (accept="image/*").
    const type = asset.mimeType || asset.file?.type || '';
    if (type && !type.startsWith('image/')) return null;
    return asset;
  } catch {
    return null;
  }
}

/**
 * The website's "Search by image" box (web/src/components/layout/
 * ImageSearchModal.jsx) as it shows on phones: a bottom sheet with a dashed
 * drop area and "Browse files". onFile(asset) gets the picked photo.
 */
export default function ImageSearchSheet({ open, onClose, onFile }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      const anim = Animated.timing(progress, {
        toValue: 1, duration: 450, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native,
      });
      anim.start();
      return () => anim.stop();
    }
    if (!mounted) return undefined;
    const anim = Animated.timing(progress, {
      toValue: 0, duration: 240, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native,
    });
    anim.start(({ finished }) => { if (finished) setMounted(false); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  const browse = async () => {
    const asset = await pickSearchImage();
    if (asset) onFile(asset);
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            { maxHeight: screenH * 0.9, paddingBottom: 20 + insets.bottom, opacity: progress, transform: [{ translateY }] },
          ]}
        >
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>

          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">Search by image</Text>
            <Text style={styles.sub}>Find visually similar products from local sellers.</Text>
          </View>

          <Pressable style={styles.drop} onPress={browse} accessibilityRole="button" accessibilityLabel="Upload or drop image">
            <Text style={styles.dropTitle}>Upload or drop image</Text>
            <Text style={styles.dropHint}>PNG, JPG or WebP · up to 8 MB</Text>
            <View style={styles.dropBtn}>
              <Text style={styles.dropBtnText}>Browse files</Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  card: {
    width: '100%',
    paddingTop: 28,
    paddingHorizontal: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 24, blurRadius: 70, color: 'rgba(0, 0, 0, 0.18)' }],
  },
  close: { position: 'absolute', top: 14, right: 16, zIndex: 1, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, lineHeight: 24, ...font(400), color: t.neutral[500] },
  head: { marginBottom: 28 },
  title: { marginBottom: 6, fontSize: 20, lineHeight: 23, letterSpacing: -0.2, ...font(500), color: t.neutral[900] },
  sub: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
  drop: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.neutral[300],
    borderRadius: 2,
    backgroundColor: t.neutral[50],
  },
  dropTitle: { fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900], textAlign: 'center' },
  dropHint: { marginTop: 6, marginBottom: 22, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500], textAlign: 'center' },
  dropBtn: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 2, backgroundColor: t.neutral[900] },
  dropBtnText: { fontSize: 13, lineHeight: 20.8, letterSpacing: 0.13, ...font(500), color: '#fff' },
});
