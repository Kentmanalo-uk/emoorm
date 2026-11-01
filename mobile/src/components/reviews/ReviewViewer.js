import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, Image, Modal, Pressable, Share, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ChatCircleDotsIcon, GridFourIcon, ShareNetworkIcon, StarIcon, ThumbsUpIcon, XIcon,
} from '../../lib/icons';
import { resolveImg } from '../../lib/media';
import { peso } from '../product/productLib';
import { font, t, themed } from '../../theme';
import ReviewComments from './ReviewComments';

/**
 * The review photo viewer: one shopper's photo, full screen, with the
 * review it belongs to underneath and what you can do about it down the
 * right-hand side (web/src/components/reviews/ReviewViewer.jsx).
 *
 * It pages across *every* photo on the product, not just the one
 * review's, which is why the counter reads "3/22". Each item remembers
 * the review it came from, so the name, the words and the three buttons
 * change as you swipe. Reviews with photos are what people actually look
 * at before spending money, and until now tapping one opened the phone's
 * browser.
 *
 * The helpful marks come in from useReviewSocial, shared with the list
 * behind this, so liking something here still shows there once it closes.
 */
function Shot({ item, width, height }) {
  if (item.kind === 'video') return <ShotVideo source={item.src} width={width} height={height} />;
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={{ uri: resolveImg(item.src) || item.src }}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityLabel={item.review?.comment || 'Review photo'}
      />
    </View>
  );
}

function ShotVideo({ source, width, height }) {
  const player = useVideoPlayer(resolveImg(source) || source, (p) => { p.loop = true; });
  return <VideoView player={player} style={{ width, height }} nativeControls contentFit="contain" />;
}

export default function ReviewViewer({ items, index, product, social, onClose }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);

  const [at, setAt] = useState(Math.min(Math.max(index, 0), Math.max(items.length - 1, 0)));
  const [grid, setGrid] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const current = items[at];
  const review = current?.review;

  // The photo gets whatever the chrome above and below it does not --
  // and while the comment sheet is up it gets only the strip above the
  // sheet, so the picture being talked about stays in sight. A sheet that
  // hides the photo may as well have been a separate screen.
  const stage = social.commentsFor
    ? Math.max(140, Math.round(height * 0.26))
    : Math.max(220, height - insets.top - insets.bottom - 250);

  useEffect(() => { setExpanded(false); }, [at]);

  const onShare = () => {
    if (!product) return;
    Share.share({
      message: review?.comment
        ? `"${review.comment.slice(0, 120)}" — a review of ${product.name}`
        : `A review of ${product.name}`,
    }).catch(() => {});
  };

  const openProduct = () => {
    onClose();
    if (product?.slug) router.push(`/product/${product.slug}`);
  };

  const tile = useMemo(() => Math.floor((width - 24 - 18) / 4), [width]);

  if (!items.length || !current) return null;

  const { liked, count } = social.likeOf(review);
  const comments = social.commentsOf(review);

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.icon}>
            <XIcon size={22} color="#fff" />
          </Pressable>
          <Text style={styles.count}>{at + 1}/{items.length}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={grid ? 'Back to the photo' : 'All photos'}
            onPress={() => setGrid((g) => !g)}
            style={styles.icon}
          >
            <GridFourIcon size={20} weight={grid ? 'fill' : 'regular'} color="#fff" />
          </Pressable>
        </View>

        {grid ? (
          <FlatList
            data={items}
            numColumns={4}
            keyExtractor={(item, i) => `${item.review?.id}-${i}`}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item, index: i }) => (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo ${i + 1} of ${items.length}`}
                onPress={() => {
                  setAt(i);
                  setGrid(false);
                  listRef.current?.scrollToIndex({ index: i, animated: false });
                }}
                style={[styles.cell, { width: tile, height: tile }, i === at && styles.cellOn]}
              >
                <Image source={{ uri: resolveImg(item.src) || item.src }} style={styles.cellImg} />
              </Pressable>
            )}
          />
        ) : (
          <>
            <View style={styles.captionRow}>
              {review?.rating ? (
                <>
                  <StarIcon size={12} weight="fill" color={t.warning[400]} />
                  <Text style={styles.caption}>{review.rating}.0 · bought this</Text>
                </>
              ) : null}
            </View>

            <View style={{ height: stage }}>
              <FlatList
                ref={listRef}
                data={items}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={at}
                getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                keyExtractor={(item, i) => `${item.review?.id}-${i}`}
                onMomentumScrollEnd={(e) => {
                  setAt(Math.round(e.nativeEvent.contentOffset.x / width));
                }}
                renderItem={({ item }) => <Shot item={item} width={width} height={stage} />}
              />

              <View style={styles.rail}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={liked ? 'Remove your helpful mark' : 'Mark this review helpful'}
                  onPress={() => social.toggle(review)}
                  style={styles.act}
                >
                  <ThumbsUpIcon size={26} weight={liked ? 'fill' : 'regular'} color={liked ? t.primary[400] : '#fff'} />
                  <Text style={[styles.actText, liked && styles.actTextOn]}>{count || 'Helpful'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Comments on this review"
                  onPress={() => social.openComments(review)}
                  style={styles.act}
                >
                  <ChatCircleDotsIcon size={26} color="#fff" />
                  <Text style={styles.actText}>{comments || 'Comment'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={onShare} style={styles.act}>
                  <ShareNetworkIcon size={26} color="#fff" />
                  <Text style={styles.actText}>Share</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.said}>
              <Text style={styles.name} numberOfLines={1}>
                {review?.user?.fullName || review?.buyer?.fullName || 'Anonymous'}
              </Text>
              {review?.comment ? (
                <Text
                  style={styles.words}
                  numberOfLines={expanded ? undefined : 2}
                  onPress={() => setExpanded((v) => !v)}
                >
                  {review.comment}
                </Text>
              ) : null}
            </View>
          </>
        )}

        {product ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${product.name}`}
            onPress={openProduct}
            style={[styles.buy, { paddingBottom: 10 + insets.bottom }]}
          >
            <View style={styles.buyWhat}>
              <Text style={styles.buyName} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.buyPrice}>{peso(product.price)}</Text>
            </View>
            <View style={styles.buyGo}><Text style={styles.buyGoText}>View product</Text></View>
          </Pressable>
        ) : null}

        {social.commentsFor ? (
          <ReviewComments
            key={social.commentsFor.id}
            review={social.commentsFor}
            onClose={social.closeComments}
            onCountChange={(n) => social.setCommentCount(social.commentsFor.id, n)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  icon: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 15, lineHeight: 24, ...font(600), color: '#fff' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 16 },
  caption: { fontSize: 12.5, lineHeight: 20, ...font(400), color: 'rgba(255,255,255,0.82)' },
  rail: { position: 'absolute', right: 10, bottom: 12, gap: 18 },
  act: { alignItems: 'center', gap: 4, minWidth: 52 },
  actText: {
    fontSize: 12,
    lineHeight: 19.2,
    ...font(600),
    color: '#fff',
    // The photo under this can be any colour, so the label carries its
    // own contrast rather than trusting the picture to provide it.
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actTextOn: { color: t.primary[400] },
  said: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 4 },
  name: { fontSize: 14, lineHeight: 22.4, ...font(600), color: '#fff' },
  words: { fontSize: 14, lineHeight: 20.3, ...font(400), color: 'rgba(255,255,255,0.9)' },
  grid: { paddingHorizontal: 12, paddingVertical: 8 },
  gridRow: { gap: 6, marginBottom: 6 },
  cell: { borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: '#111' },
  cellOn: { borderColor: '#fff' },
  cellImg: { width: '100%', height: '100%' },
  buy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  buyWhat: { flex: 1, minWidth: 0, gap: 2 },
  buyName: { fontSize: 13, lineHeight: 20.8, ...font(400), color: 'rgba(255,255,255,0.78)' },
  buyPrice: { fontSize: 19, lineHeight: 26.6, ...font(700), color: '#fff' },
  buyGo: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: t.primary[600] },
  buyGoText: { fontSize: 14, lineHeight: 22.4, ...font(600), color: '#fff' },
}));
