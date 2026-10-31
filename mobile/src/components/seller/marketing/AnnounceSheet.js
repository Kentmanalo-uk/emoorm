import { useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Sheet, { SheetButton } from '../../Sheet';
import Select from '../../Select';
import MkField, { fieldStyles } from './MkField';
import { font, t, themed } from '../../../theme';

/*
 * Marketing's composer (web/src/pages/SellerMarketing.jsx PhoneSheet +
 * SellerApp.css .smk-field/.smk-count/.smk-preview): tell followers
 * something new, either a shop announcement or one product to look at, with
 * a preview of what lands in their notifications.
 *
 * <AnnounceSheet mode="announce"|"promote"|null storeName products
 *   productId onProduct message onMessage followerCount sending onSend onClose />
 */

export const MESSAGE_MAX = 280;

export default function AnnounceSheet({
  mode, storeName, products = [], productId, onProduct, message, onMessage, followerCount = 0, sending = false, onSend, onClose,
}) {
  // Keep the last mode while the sheet slides away, so its title does not change.
  const last = useRef(mode);
  if (mode) last.current = mode;
  const promote = last.current === 'promote';
  const chosen = products.find((p) => p.id === productId);
  const tooLong = message.length > MESSAGE_MAX;
  const ready = message.trim().length >= 5 && !tooLong && (!promote || productId);

  return (
    <Sheet
      variant="seller"
      open={Boolean(mode)}
      title={promote ? 'Promote a product' : 'Announce to followers'}
      onClose={onClose}
      dismissible={!sending}
      footer={(
        <SheetButton
          variant="seller"
          primary
          label={sending ? 'Sending…' : `Send to ${followerCount} follower${followerCount === 1 ? '' : 's'}`}
          disabled={!ready || sending}
          onPress={onSend}
        />
      )}
    >
      {promote ? (
        products.length === 0 ? (
          <Text style={fieldStyles.note}>You need a live product to promote. Add one from My products first.</Text>
        ) : (
          <MkField label="Product">
            <Select
              title="Product"
              value={productId}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              onChange={onProduct}
              style={fieldStyles.select}
              textStyle={fieldStyles.selectText}
            />
          </MkField>
        )
      ) : null}
      <MkField label="Message">
        <TextInput
          value={message}
          onChangeText={onMessage}
          multiline
          maxLength={MESSAGE_MAX + 20}
          textAlignVertical="top"
          placeholder={promote
            ? 'e.g. Fresh harvest today! Order before 5 PM for same-day pickup.'
            : 'e.g. We are open this Sunday. New stock of mangoes arrived!'}
          placeholderTextColor={t.neutral[400]}
          style={styles.textarea}
        />
        <Text style={[styles.count, tooLong && styles.countOver]}>{message.length}/{MESSAGE_MAX}</Text>
      </MkField>
      <View style={styles.preview} accessibilityLabel="What followers will see">
        <Text style={styles.previewLabel}>Followers will see</Text>
        <Text style={styles.previewTitle}>{promote && chosen ? `${storeName}: ${chosen.name}` : storeName}</Text>
        <Text style={styles.previewText}>{message.trim() || 'Your message'}</Text>
      </View>
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  // .smk-field textarea (rows 4)
  textarea: {
    minHeight: 110, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 16, lineHeight: 23.2, ...font(400),
  },
  count: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  countOver: { color: t.danger[600] },
  // .smk-preview
  preview: { gap: 2, padding: 12, borderRadius: 12, backgroundColor: t.neutral[50] },
  previewLabel: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  previewTitle: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  previewText: { fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[700] },
}));
