import {
  Image, Linking, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowSquareOutIcon, XIcon } from '../../../lib/icons';
import { font, themed } from '../../../theme';

/**
 * A proof photo on the whole screen. The website opens the picture in a new
 * tab ("Click to open"); the app shows it here, with a way out to the full
 * file in the browser. <PhotoViewer uri={…} title="Payment proof" onClose />
 */
export default function PhotoViewer({ uri, title, onClose }) {
  const insets = useSafeAreaInsets();
  if (!uri) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <Image source={{ uri }} style={styles.img} resizeMode="contain" accessibilityLabel={title} />
        <View style={[styles.bar, { paddingTop: 8 + insets.top }]} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={styles.btns}>
            <Pressable accessibilityRole="link" accessibilityLabel="Open full photo" onPress={() => Linking.openURL(uri).catch(() => {})} style={styles.btn}>
              <ArrowSquareOutIcon size={18} weight="bold" color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.btn}>
              <XIcon size={18} weight="bold" color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', justifyContent: 'center' },
  img: { width: '100%', height: '80%' },
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingBottom: 8,
  },
  title: { flex: 1, fontSize: 15, lineHeight: 22, ...font(500), color: '#fff' },
  btns: { flexDirection: 'row', gap: 8 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
}));
