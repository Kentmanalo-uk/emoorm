import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StarIcon, StorefrontIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';
import { localDate } from './productLib';

/** Five stars, filled up to the (rounded) rating (web ReviewItem Stars). */
export function Stars({ rating, size = 14, gap = 1 }) {
  const filled = Math.round(Number(rating || 0));
  return (
    <View style={[styles.stars, { gap }]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon key={i} size={size} weight={i < filled ? 'fill' : 'regular'} color={i < filled ? t.warning[500] : t.neutral[300]} />
      ))}
    </View>
  );
}

/** A person's photo, or their initial on the pale green circle. */
function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  return (
    <View style={styles.avatar}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.avatarImg} onError={() => setFailed(true)} />
      ) : (
        <Text style={styles.avatarText}>{(name || 'U').trim().charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function ReviewVideo({ source }) {
  const player = useVideoPlayer(resolveImg(source) || source);
  return <VideoView player={player} style={styles.video} nativeControls contentFit="cover" />;
}

/**
 * One buyer review (web/src/components/reviews/ReviewItem.jsx): who wrote
 * it, the stars, the comment, photos or video, and (showReply) the shop's
 * reply. `last` drops the line under it.
 */
export default function ReviewItem({ review, showReply = false, last = false, onOpenImage }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reviewer = review.user || review.buyer || {};
  const images = Array.isArray(review.images) ? review.images : [];
  // Three columns, 8px apart, inside the card's padding.
  const [boxW, setBoxW] = useState(Math.max(0, width - 32));
  const tile = Math.floor((boxW - 16) / 3);
  return (
    <View style={[styles.review, last && styles.reviewLast]} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <Avatar src={reviewer.profilePhoto} name={reviewer.fullName || 'U'} />
        <View style={styles.who}>
          {reviewer.id ? (
            <Text style={[styles.name, styles.nameLink]} numberOfLines={1} onPress={() => router.push(`/u/${reviewer.id}`)}>
              {reviewer.fullName || 'Anonymous'}
            </Text>
          ) : (
            <Text style={styles.name} numberOfLines={1}>{reviewer.fullName || 'Anonymous'}</Text>
          )}
          <View style={styles.starLine}><Stars rating={review.rating} size={12} /></View>
        </View>
        <Text style={styles.date}>{localDate(review.createdAt)}</Text>
      </View>
      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
      {images.length > 0 || review.videoUrl ? (
        <View style={styles.media}>
          {images.map((src, i) => (
            <Pressable
              key={`${src}-${i}`}
              accessibilityRole="imagebutton"
              accessibilityLabel={`review media ${i + 1}`}
              onPress={() => {
                const uri = resolveImg(src) || src;
                if (onOpenImage) onOpenImage(uri); else Linking.openURL(uri).catch(() => {});
              }}
              style={[styles.mediaItem, { width: tile, height: tile }]}
            >
              <Image source={{ uri: resolveImg(src) || src }} style={styles.mediaImg} />
            </Pressable>
          ))}
          {review.videoUrl ? <View style={[styles.mediaItem, styles.videoBox]}><ReviewVideo source={review.videoUrl} /></View> : null}
        </View>
      ) : null}
      {showReply && review.sellerReply ? (
        <View style={styles.reply}>
          <View style={styles.replyHead}>
            <StorefrontIcon size={14} weight="fill" color={t.primary[700]} />
            <Text style={styles.replyHeadText}>Seller’s reply</Text>
          </View>
          <Text style={styles.replyText}>{review.sellerReply}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', alignItems: 'center' },
  review: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.neutral[150] },
  reviewLast: { borderBottomWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  avatar: {
    width: 32, height: 32, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
  },
  avatarImg: { width: 32, height: 32 },
  avatarText: { fontSize: 12, lineHeight: 19.2, ...font(500), color: t.primary[700] },
  who: { flex: 1, minWidth: 0 },
  name: { alignSelf: 'flex-start', fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.neutral[900] },
  nameLink: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  starLine: { height: 24, paddingTop: 4.4 },
  date: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  comment: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
  media: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  mediaItem: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[100] },
  mediaImg: { width: '100%', height: '100%' },
  videoBox: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  reply: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.neutral[100] },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  replyHeadText: { fontSize: 12.5, lineHeight: 20, ...font(500), color: t.primary[700] },
  replyText: { fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[700] },
});
