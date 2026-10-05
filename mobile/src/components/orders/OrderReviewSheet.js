import { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ImageIcon, StarIcon, TrashIcon, VideoIcon,
} from 'phosphor-react-native';
import apiClient from '../../api/client';
import { resolveImg } from '../../lib/media';
import { toast } from '../../lib/toast';
import { uploadReview } from '../../lib/upload';
import { font, t } from '../../theme';
import OrderSheetFrame from './OrderSheetFrame';

const MAX_IMAGES = 5;
const MAX_VIDEO_MB = 50;
const WORDS = ['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent'];

/**
 * Rate & review a product (web/src/components/ReviewModal.jsx, its phone
 * bottom sheet). `target`: { product: { id, name, images }, orderId,
 * initialRating?, intro?, existing? } or null when closed.
 */
export default function OrderReviewSheet({ target, onClose, onSuccess }) {
  return (
    <OrderSheetFrame
      open={Boolean(target)}
      onClose={onClose}
      title={target?.existing?.id ? 'Edit your review' : 'Rate & Review'}
      headerStyle={styles.head}
      scroll={false}
    >
      {target ? <ReviewForm key={`${target.product?.id}-${target.orderId}`} target={target} onClose={onClose} onSuccess={onSuccess} /> : null}
    </OrderSheetFrame>
  );
}

function ReviewForm({ target, onClose, onSuccess }) {
  const { product = {}, orderId, initialRating = 0, intro, existing } = target;
  const editing = Boolean(existing?.id);
  const [rating, setRating] = useState(existing?.rating || initialRating || 0);
  const [comment, setComment] = useState(existing?.comment || '');
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const photo = product.images?.[0];

  const pickImages = async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_IMAGES} photos`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.85,
    });
    if (!result.canceled) setImages((cur) => [...cur, ...result.assets].slice(0, MAX_IMAGES));
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`Video must be under ${MAX_VIDEO_MB} MB`);
      return;
    }
    setVideo(asset);
  };

  const submit = async () => {
    if (!rating) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await apiClient.put(`/reviews/${existing.id}`, { rating, comment: comment.trim() });
        toast.success('Review updated');
      } else {
        await uploadReview({
          productId: product.id, orderId, rating, comment: comment.trim(), images, video,
        });
        toast.success('Thanks for your review!');
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View style={styles.scrollWrap}>
        <ScrollBody>
          {intro ? <Text style={styles.intro}>{intro}</Text> : null}
          <View style={styles.product}>
            {photo ? <Image source={{ uri: resolveImg(photo) }} style={styles.productImg} accessibilityLabel={product.name} /> : null}
            <Text style={styles.productName}>{product.name}</Text>
          </View>

          <Text style={styles.label}>Your rating</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = n <= rating;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                  onPress={() => setRating(n)}
                  style={[styles.star, on && styles.starOn]}
                >
                  <StarIcon size={32} weight={on ? 'fill' : 'regular'} color={on ? t.warning[500] : t.neutral[300]} />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.word}>{WORDS[rating] || ''}</Text>

          <TextInput
            style={styles.comment}
            placeholder="Share your experience (optional)"
            placeholderTextColor={t.neutral[400]}
            value={comment}
            onChangeText={setComment}
            maxLength={1000}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.count}>{comment.length}/1000</Text>

          {!editing ? (
            <View style={styles.media}>
              <View style={styles.mediaHead}>
                <Text style={styles.mediaTitle}>Add photos / video</Text>
                <Text style={styles.mediaHint}>Max {MAX_IMAGES} photos · 1 video up to {MAX_VIDEO_MB} MB</Text>
              </View>
              <View style={styles.grid}>
                {images.map((img, idx) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <View key={`${img.uri}-${idx}`} style={styles.cell}>
                    <View style={styles.tile}>
                      <Image source={{ uri: img.uri }} style={styles.tileImg} accessibilityLabel={`upload ${idx + 1}`} />
                      <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setImages((cur) => cur.filter((_, i) => i !== idx))} style={styles.remove}>
                        <TrashIcon size={14} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                ))}
                {video ? (
                  <View style={styles.cell}>
                    <View style={styles.tile}>
                      {video.thumbnail || video.uri ? <Image source={{ uri: video.thumbnail || video.uri }} style={styles.tileImg} /> : null}
                      <Pressable accessibilityRole="button" accessibilityLabel="Remove video" onPress={() => setVideo(null)} style={styles.remove}>
                        <TrashIcon size={14} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {images.length < MAX_IMAGES ? (
                  <View style={styles.cell}>
                    <Pressable accessibilityRole="button" onPress={pickImages} style={styles.add}>
                      <ImageIcon size={20} color={t.neutral[500]} />
                      <Text style={styles.addText}>Photo</Text>
                    </Pressable>
                  </View>
                ) : null}
                {!video ? (
                  <View style={styles.cell}>
                    <Pressable accessibilityRole="button" onPress={pickVideo} style={styles.add}>
                      <VideoIcon size={20} color={t.neutral[500]} />
                      <Text style={styles.addText}>Video</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollBody>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.btn, styles.cancel]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={submitting || !rating}
          onPress={submit}
          style={[styles.btn, styles.submit, (submitting || !rating) && styles.off]}
        >
          {submitting ? <ActivityIndicator size={14} color="#fff" style={{ marginRight: 6 }} /> : null}
          <Text style={styles.submitText}>{submitting ? 'Saving…' : editing ? 'Save changes' : 'Submit Review'}</Text>
        </Pressable>
      </View>
    </>
  );
}

/* The form scrolls between the sticky title and the sticky buttons. */
function ScrollBody({ children }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 12, paddingBottom: 12, paddingLeft: 16, paddingRight: 8, borderBottomColor: t.neutral[100] },
  scrollWrap: { flexShrink: 1 },
  scroll: { flexGrow: 0 },
  body: { paddingTop: 12, paddingHorizontal: 16 },
  intro: { marginTop: -8, marginBottom: 16, fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[600] },
  product: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 14, borderRadius: 10, backgroundColor: t.neutral[50],
  },
  productImg: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: t.neutral[200] },
  productName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19.6, ...font(500), color: t.neutral[700] },
  label: { marginBottom: 8, fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[700] },
  stars: { flexDirection: 'row', gap: 2, marginBottom: 4 },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  starOn: { transform: [{ scale: 1.1 }] },
  word: { height: 20, marginBottom: 12, fontSize: 13, lineHeight: 20, ...font(500), color: t.warning[500] },
  comment: {
    minHeight: 108, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10,
    fontSize: 16, lineHeight: 24, ...font(400), color: t.neutral[700],
  },
  count: { marginTop: 4, marginBottom: 4, textAlign: 'right', fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  media: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  mediaHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8, rowGap: 2, marginBottom: 10 },
  mediaTitle: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[700] },
  mediaHint: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '33.333%', padding: 4 },
  tile: { aspectRatio: 1, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[900] },
  tileImg: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  add: {
    aspectRatio: 1, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], backgroundColor: t.neutral[50],
  },
  addText: { fontSize: 11.5, lineHeight: 18.4, ...font(500), color: t.neutral[500] },
  actions: {
    flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: t.neutral[100], backgroundColor: t.neutral[0],
  },
  btn: { flex: 1, flexDirection: 'row', minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0] },
  cancelText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[700] },
  submit: { backgroundColor: t.primary[600] },
  submitText: { fontSize: 14, lineHeight: 20, ...font(500), color: '#fff' },
  off: { opacity: 0.5 },
});
