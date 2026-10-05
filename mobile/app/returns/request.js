import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  CheckIcon, MinusIcon, PlusIcon, UploadSimpleIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import ScreenHeader from '../../src/components/ScreenHeader';
import { toast } from '../../src/lib/toast';
import { uploadImage } from '../../src/lib/upload';
import { font, t } from '../../src/theme';
import { cardShadow } from '../../src/components/orders/OrderBits';
import { ReturnsPrimary } from '../../src/components/returns/ReturnBits';

/*
 * Return an order (web/src/pages/ReturnRequest.jsx at phone size): which
 * items and how many, what went wrong, details and photos. Photos are
 * uploaded once; trying again after an error reuses them.
 */

const REASONS = [['DAMAGED', 'Damaged item'], ['WRONG_ITEM', 'Wrong item'], ['NOT_AS_DESCRIBED', 'Not as described'], ['MISSING', 'Missing item'], ['OTHER', 'Other']];

export default function ReturnRequest() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const orderId = params.orderId || null;
  const [order, setOrder] = useState(null);
  const [loadState, setLoadState] = useState(orderId ? 'loading' : 'none'); // loading | ready | error | none
  const [selected, setSelected] = useState({}); // orderItemId -> quantity
  const [reason, setReason] = useState('DAMAGED');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const uploadedRef = useRef(new Map()); // photo uri -> uploaded URL

  const fetchOrder = useCallback(() => apiClient.get(`/orders/${orderId}`)
    .then((res) => { setOrder(res.data); setLoadState('ready'); })
    .catch(() => setLoadState('error')), [orderId]);

  useEffect(() => {
    if (orderId) fetchOrder();
    else setLoadState('none');
  }, [orderId, fetchOrder]);

  const loadOrder = () => {
    setLoadState('loading');
    fetchOrder();
  };

  const toggle = (id) => setSelected((cur) => ({ ...cur, [id]: cur[id] ? 0 : 1 }));
  const setQty = (id, qty, max) => setSelected((cur) => ({ ...cur, [id]: Math.max(1, Math.min(max, qty)) }));

  // "Add photos": up to five, a new pick replaces the last one (as the
  // website's file input does).
  const pickPhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.9,
      });
      if (result.canceled) return;
      setPhotos((result.assets || []).slice(0, 5));
    } catch {
      toast.error('Could not open your photos');
    }
  };

  const submit = async () => {
    const items = Object.entries(selected).filter(([, qty]) => qty > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!order || !items.length) {
      toast.error('Select at least one item');
      return;
    }
    setSaving(true);
    try {
      const urls = [];
      for (const photo of photos) {
        if (!uploadedRef.current.has(photo.uri)) {
          // eslint-disable-next-line no-await-in-loop
          const result = await uploadImage(photo);
          uploadedRef.current.set(photo.uri, result?.url);
        }
        urls.push(uploadedRef.current.get(photo.uri));
      }
      const result = await apiClient.post('/returns', {
        orderId: order.id, items, reason, buyerNote: note, photos: urls.filter(Boolean),
      });
      toast.success('Return request submitted');
      router.replace(`/returns/${result.data.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not submit return request');
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (loadState === 'none') {
    body = (
      <Text style={styles.muted}>
        Open My Orders and tap <Text style={styles.mutedStrong}>Request return</Text> on the order that needs help.
      </Text>
    );
  } else if (loadState === 'loading') {
    body = <Text style={styles.muted}>Loading the order…</Text>;
  } else if (loadState === 'error') {
    body = (
      <View style={styles.mutedBox}>
        <Text style={styles.mutedP}>{'This order couldn’t be loaded.'}</Text>
        <ReturnsPrimary label="Try again" onPress={loadOrder} />
      </View>
    );
  } else {
    body = (
      <View style={styles.form}>
        <View style={styles.summary}>
          <Text style={styles.summaryStrong}>Order #{order.orderNumber}</Text>
          <Text style={styles.summaryStore}>{order.store?.name}</Text>
        </View>

        <View>
          <Text style={styles.legend}>Which items need help?</Text>
          {order.items?.map((item) => {
            const qty = selected[item.id] || 0;
            return (
              <View key={item.id} style={styles.itemRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: qty > 0 }}
                  onPress={() => toggle(item.id)}
                  style={styles.requestItem}
                >
                  <View style={styles.checkCell}>
                    <View style={[styles.checkbox, qty > 0 && styles.checkboxOn]}>
                      {qty > 0 ? <CheckIcon size={10} weight="bold" color="#fff" /> : null}
                    </View>
                  </View>
                  <View style={styles.requestText}>
                    <Text style={styles.requestName}>{item.productName}</Text>
                    <Text style={styles.requestSmall}>Qty {item.quantity} · ₱{Number(item.price).toFixed(2)}</Text>
                  </View>
                </Pressable>
                {qty > 0 && item.quantity > 1 ? (
                  <View style={styles.qty} accessibilityRole="none" accessibilityLabel={`How many of ${item.productName}`}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Fewer"
                      disabled={qty <= 1}
                      onPress={() => setQty(item.id, qty - 1, item.quantity)}
                      style={[styles.qtyBtn, qty <= 1 && styles.qtyOff]}
                    >
                      <MinusIcon size={14} color={t.neutral[800]} />
                    </Pressable>
                    <Text style={styles.qtyText}>{qty} of {item.quantity}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="More"
                      disabled={qty >= item.quantity}
                      onPress={() => setQty(item.id, qty + 1, item.quantity)}
                      style={[styles.qtyBtn, qty >= item.quantity && styles.qtyOff]}
                    >
                      <PlusIcon size={14} color={t.neutral[800]} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View>
          <Text style={styles.legend}>What went wrong?</Text>
          {/* Two equal columns; an odd one out keeps its column's width. */}
          <View style={styles.reasonGrid}>
            {[0, 2, 4].map((start) => (
              <View key={start} style={styles.reasonRow}>
                {REASONS.slice(start, start + 2).map(([value, label]) => {
                  const on = reason === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setReason(value)}
                      style={[styles.reason, on && styles.reasonOn]}
                    >
                      <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
                {REASONS.slice(start, start + 2).length === 1 ? <View style={styles.reasonSpacer} /> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.detailsLabel}>
          <Text style={styles.legendText}>Additional details</Text>
          <TextInput
            multiline
            maxLength={2000}
            value={note}
            onChangeText={setNote}
            placeholder="Tell the seller what happened"
            placeholderTextColor="#757575"
            textAlignVertical="top"
            style={styles.textarea}
          />
        </View>

        <Pressable accessibilityRole="button" onPress={pickPhotos} style={styles.photo}>
          <View style={styles.photoRow}>
            <UploadSimpleIcon size={18} color={t.secondary[700]} />
            <Text style={styles.photoText}>Add photos</Text>
          </View>
          <Text style={styles.photoSmall}>{photos.length ? `${photos.length} photo(s) selected` : 'Optional, up to 5 photos'}</Text>
        </Pressable>

        <ReturnsPrimary label={saving ? 'Submitting…' : 'Submit return request'} disabled={saving} onPress={submit} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Return an order" backTo="/orders" />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>{body}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { paddingTop: 12, paddingHorizontal: 12 },
  card: { padding: 14, borderRadius: 12, backgroundColor: t.neutral[0], ...cardShadow },

  muted: { marginTop: 6, fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[500] },
  mutedStrong: { ...font(500) },
  mutedBox: { marginTop: 6 },
  mutedP: { marginBottom: 14, fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[500] },

  form: { marginTop: 16, gap: 18 },
  summary: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4, columnGap: 12,
    padding: 12, borderRadius: 10, backgroundColor: t.neutral[100],
  },
  summaryStrong: { fontSize: 15, lineHeight: 24, ...font(500), color: t.secondary[950] },
  summaryStore: { fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[600] },

  legend: { marginBottom: 10, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.secondary[950] },
  legendText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.secondary[950] },

  itemRow: { gap: 6 },
  requestItem: {
    flexDirection: 'row', alignItems: 'flex-start', columnGap: 10, minHeight: 48, marginTop: 7, padding: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10,
  },
  checkCell: { width: 20, height: 24, justifyContent: 'center' },
  // The browser's own checkbox (13px, grey edge; blue when ticked).
  checkbox: {
    width: 13, height: 13, marginLeft: 3.5, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#767676', borderRadius: 2.5, backgroundColor: '#fff',
  },
  checkboxOn: { borderColor: '#0075ff', backgroundColor: '#0075ff' },
  requestText: { flex: 1, minWidth: 0, gap: 4 },
  requestName: { fontSize: 15, lineHeight: 24, ...font(400), color: t.secondary[950] },
  requestSmall: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },

  qty: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 10, marginLeft: 28, marginBottom: 8 },
  qtyBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  qtyOff: { opacity: 0.4 },
  qtyText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[700] },

  reasonGrid: { gap: 8 },
  reasonRow: { flexDirection: 'row', gap: 8 },
  // Same padding and edge as a button, so both columns come out equal.
  reasonSpacer: { flex: 1, paddingHorizontal: 10, borderWidth: 1, borderColor: 'transparent' },
  reason: {
    flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  reasonOn: { borderColor: t.secondary[700], backgroundColor: t.secondary[50] },
  reasonText: { textAlign: 'center', fontSize: 14, lineHeight: 17.5, ...font(400), color: t.neutral[600] },
  reasonTextOn: { ...font(500), color: t.secondary[700] },

  // The label's own 10px bottom margin sits on top of the form's 18px gap.
  detailsLabel: { marginBottom: 10 },
  textarea: {
    height: 100, marginTop: 7, padding: 11, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10,
    fontSize: 16, lineHeight: 25.6, ...font(500), color: '#000', backgroundColor: t.neutral[0],
  },

  photo: {
    minHeight: 56, padding: 14, gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 10,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoText: { fontSize: 15, lineHeight: 24, ...font(500), color: t.secondary[700] },
  photoSmall: { paddingLeft: 26, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
});
