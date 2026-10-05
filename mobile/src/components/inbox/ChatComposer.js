import { forwardRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageIcon, PaperPlaneTiltIcon, PushPinIcon, TagIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import InboxSpinner from './InboxSpinner';

/*
 * The chat's message box on phones (web Messenger.jsx .msgr-composer):
 * what goes with the next message (a photo, a product, an order), then the
 * product and photo buttons, the round grey input and the send arrow.
 */
const ChatComposer = forwardRef(function ChatComposer({
  draft, onChangeDraft, onSend, canSend, sending,
  pendingImage, onClearImage, pendingProduct, onClearProduct, attachedOrder, onClearOrder,
  onAttachProduct, attachProductDisabled, onPickPhoto,
}, inputRef) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(41.6);
  const hasAttachments = Boolean(attachedOrder || pendingImage || pendingProduct);

  return (
    <View style={[styles.composer, { paddingBottom: 8 + insets.bottom }]}>
      {hasAttachments ? (
        <View style={styles.attachments}>
          {pendingImage ? (
            <View style={styles.attachImage}>
              <Image source={{ uri: pendingImage.uri }} style={styles.fill} accessibilityLabel="Photo to send" />
              {sending ? (
                <View style={styles.attachBusy}><InboxSpinner size={18} color={t.primary[700]} /></View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={onClearImage} style={styles.attachImageX}>
                  <XIcon size={12} weight="bold" color="#fff" />
                </Pressable>
              )}
            </View>
          ) : null}
          {pendingProduct ? (
            <View style={styles.chip}>
              <TagIcon size={13} color={t.primary[800]} />
              <Text style={styles.chipText} numberOfLines={1}>{pendingProduct.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove product" onPress={onClearProduct} disabled={sending} style={styles.chipX}>
                <XIcon size={12} weight="bold" color={t.primary[800]} />
              </Pressable>
            </View>
          ) : null}
          {attachedOrder ? (
            <View style={styles.chip}>
              <PushPinIcon size={13} color={t.primary[800]} />
              <Text style={styles.chipText} numberOfLines={1}>Order #{attachedOrder.orderNumber}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove order" onPress={onClearOrder} disabled={sending} style={styles.chipX}>
                <XIcon size={12} weight="bold" color={t.primary[800]} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach product"
          onPress={onAttachProduct}
          disabled={sending || attachProductDisabled}
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed, (sending || attachProductDisabled) && styles.iconOff]}
        >
          <TagIcon size={20} color={t.neutral[500]} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a photo"
          onPress={onPickPhoto}
          disabled={sending}
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed, sending && styles.iconOff]}
        >
          <ImageIcon size={20} color={t.neutral[500]} />
        </Pressable>
        <TextInput
          ref={inputRef}
          multiline
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={pendingImage ? 'Add a caption…' : 'Type a message...'}
          placeholderTextColor={t.neutral[400]}
          maxLength={2000}
          editable={!sending}
          accessibilityLabel="Type a message"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onContentSizeChange={(e) => setHeight(Math.min(120, Math.max(41.6, e.nativeEvent.contentSize.height)))}
          // Enter sends on a keyboard, as on the website; Shift+Enter is a new line.
          onKeyPress={Platform.OS === 'web' ? (e) => {
            if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault?.(); onSend(); }
          } : undefined}
          style={[styles.input, { height: Platform.OS === 'web' ? height : undefined }, focused && styles.inputFocus]}
          underlineColorAndroid="transparent"
          textAlignVertical="center"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={onSend}
          disabled={!canSend}
          style={({ pressed }) => [styles.send, pressed && canSend && styles.sendPressed, !canSend && styles.sendOff]}
        >
          {sending
            ? <InboxSpinner size={18} color={t.success[500]} />
            : <PaperPlaneTiltIcon size={20} weight="fill" color={canSend ? t.success[500] : t.neutral[300]} />}
        </Pressable>
      </View>
    </View>
  );
});

export default ChatComposer;

const styles = StyleSheet.create({
  composer: {
    paddingTop: 8, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 2, paddingHorizontal: 4, paddingBottom: 8 },
  attachImage: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: t.neutral[100] },
  fill: { width: '100%', height: '100%' },
  attachImageX: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
  },
  attachBusy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.6)' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingVertical: 5, paddingLeft: 10, paddingRight: 6,
    borderRadius: 999, backgroundColor: t.primary[50],
  },
  chipText: { flexShrink: 1, fontSize: 12.5, lineHeight: 18.75, color: t.primary[800], ...font(400) },
  chipX: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6, 95, 70, 0.12)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconPressed: { backgroundColor: t.neutral[100] },
  iconOff: { opacity: 0.4 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    maxHeight: 120,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 9999,
    backgroundColor: t.neutral[100],
    color: t.neutral[900],
    fontSize: 16,
    lineHeight: 21.6,
    ...font(400),
    outlineStyle: 'none',
  },
  inputFocus: { boxShadow: `0px 0px 0px 1px ${t.primary[600]}` },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendPressed: { backgroundColor: 'rgba(34, 197, 94, 0.1)' },
  sendOff: { opacity: 0.35 },
});
