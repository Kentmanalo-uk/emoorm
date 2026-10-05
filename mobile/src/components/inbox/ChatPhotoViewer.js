import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';

/** A sent photo full screen (web .msgr-viewer): tap outside or × to close. */
export default function ChatPhotoViewer({ image, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={Boolean(image)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Photo">
        {image ? (
          <View style={styles.frame} pointerEvents="box-none">
            <Image source={{ uri: resolveImg(image) || image }} style={styles.img} resizeMode="contain" accessibilityLabel="Sent photo" />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={onClose}
          style={[styles.close, { top: 12 + insets.top }]}
        >
          <XIcon size={20} weight="bold" color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.9)' },
  frame: { width: '100%', height: '100%' },
  img: { width: '100%', height: '100%', borderRadius: 6 },
  close: {
    position: 'absolute', right: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
