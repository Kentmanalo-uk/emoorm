import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Check, CheckCheck, ImagePlus, Package, Send, Star, X } from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { uploadImage } from '../../src/lib/upload';
import { toast } from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import { colors, radius, spacing, typography } from '../../src/theme';

// Thread view for a single conversation — pushed from app/(tabs)/messages.js.
// Mirrors the message-bubble layout of web's components/messenger/Messenger.jsx.
export default function ConversationThread() {
  const { id, storeName } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [pinnedOrder, setPinnedOrder] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [ratingDismissed, setRatingDismissed] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const listRef = useRef(null);

  const ratingDismissKey = `rateServiceDismissed:${id}`;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ratingDismissKey).then((value) => {
      if (cancelled || !value) return;
      if (Date.now() - Number(value) < 24 * 60 * 60 * 1000) setRatingDismissed(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ratingDismissKey]);

  const fetchConversation = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.MESSAGES.CONVERSATION(id));
      setConversation(res.data || null);
      setMessages(res.data?.messages || []);
      apiClient.post(ENDPOINTS.MESSAGES.MARK_READ(id)).catch(() => { });
    } catch (err) {
      toast.error('Failed to load conversation', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchConversation();
    const interval = setInterval(() => fetchConversation({ silent: true }), 10000);
    return () => clearInterval(interval);
  }, [fetchConversation]);

  const handleSend = async () => {
    const body = draft.trim();
    if ((!body && !selectedImage && !pinnedOrder) || isSending) return;
    setIsSending(true);
    try {
      const uploaded = selectedImage ? await uploadImage(selectedImage) : null;
      const res = await apiClient.post(ENDPOINTS.MESSAGES.SEND(id), { body, imageUrl: uploaded?.url, orderId: pinnedOrder?.id });
      setMessages((prev) => [...prev, res.data]);
      setDraft('');
      setSelectedImage(null);
      setPinnedOrder(null);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      toast.error('Failed to send message', err.message);
    } finally {
      setIsSending(false);
    }
  };

  const togglePinnedOrder = (order) => {
    setPinnedOrder((prev) => (prev?.id === order.id ? null : order));
  };

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Photo permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) setSelectedImage(result.assets[0]);
  };

  const dismissRatingPrompt = () => {
    setRatingDismissed(true);
    AsyncStorage.setItem(ratingDismissKey, String(Date.now())).catch(() => {});
  };

  const submitServiceRating = async (rating) => {
    if (isRating) return;
    setIsRating(true);
    try {
      await apiClient.post(ENDPOINTS.MESSAGES.RATE_SERVICE(id), { rating });
      setConversation((prev) => (prev ? { ...prev, serviceRating: rating } : prev));
      toast.success('Thanks for your feedback!');
    } catch (err) {
      toast.error('Could not submit rating', err.message);
    } finally {
      setIsRating(false);
    }
  };

  const sellerReplied = conversation?.role === 'buyer' && messages.some((m) => m.senderId !== currentUserId);
  const showRatingPrompt = Boolean(sellerReplied && !conversation?.serviceRating && !ratingDismissed);

  const renderItem = ({ item }) => {
    const isMine = item.senderId === currentUserId;
    const recipientReadAt = conversation?.role === 'seller'
      ? conversation?.buyerLastReadAt
      : conversation?.sellerLastReadAt;
    const isSeen = isMine && recipientReadAt && new Date(recipientReadAt) >= new Date(item.createdAt);
    return (
      <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {item.order ? <MessageOrder order={item.order} isMine={isMine} /> : null}
          {item.imageUrl ? <Image accessible accessibilityLabel="Message attachment" source={{ uri: resolveImg(item.imageUrl) }} style={styles.messageImage} resizeMode="cover" /> : null}
          {item.body ? <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text> : null}
          <View style={[styles.messageMeta, isMine && styles.messageMetaMine]}>
            <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            {isMine ? isSeen
              ? <CheckCheck accessibilityLabel="Seen" size={15} color={colors.white} />
              : <Check accessibilityLabel="Delivered" size={15} color="rgba(255,255,255,0.78)" />
              : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{storeName || 'Conversation'}</Text>
        <View style={{ width: 22 }} />
      </View>

      {conversation?.pinnedOrders?.length ? (
        <View style={styles.ordersSection}>
          <Text style={styles.ordersTitle}>{conversation.role === 'seller' ? 'Customer orders' : 'Your orders'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ordersList}>
            {conversation.pinnedOrders.map((order) => (
              <PinnedOrder key={order.id} order={order} selected={pinnedOrder?.id === order.id} onPress={() => togglePinnedOrder(order)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, !messages.length && styles.emptyMessages]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {showRatingPrompt ? (
          <View style={styles.ratingPrompt}>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss rating prompt" style={styles.ratingClose} onPress={dismissRatingPrompt} hitSlop={8}>
              <X size={15} color={colors.textMuted} />
            </Pressable>
            <Text style={styles.ratingTitle} numberOfLines={2}>Rate {storeName || 'this seller'}'s customer service</Text>
            <Text style={styles.ratingSubtitle}>How was your experience chatting with them?</Text>
            <View style={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Rate ${n} out of 5`} onPress={() => submitServiceRating(n)} disabled={isRating} hitSlop={6} style={styles.ratingStar}>
                  <Star size={26} color={colors.star} />
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={dismissRatingPrompt}><Text style={styles.ratingLater}>Maybe later</Text></Pressable>
          </View>
        ) : null}
        {pinnedOrder ? (
          <View style={styles.attachedOrder}>
            <Package size={16} color={colors.secondary} />
            <Text style={styles.attachedOrderText} numberOfLines={1}>{pinnedOrder.name || pinnedOrder.orderNumber}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove attached order" onPress={() => setPinnedOrder(null)} hitSlop={8}><X size={14} color={colors.textMuted} /></Pressable>
          </View>
        ) : null}
        {selectedImage ? <View style={styles.selectedImageWrap}><Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} /><Pressable accessibilityRole="button" accessibilityLabel="Remove selected image" style={styles.removeImage} onPress={() => setSelectedImage(null)}><X size={14} color={colors.white} /></Pressable></View> : null}
        <View style={styles.composerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add image" style={styles.imageButton} onPress={chooseImage} disabled={isSending}><ImagePlus size={21} color={colors.secondary} /></Pressable>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={[styles.sendBtn, ((!draft.trim() && !selectedImage && !pinnedOrder) || isSending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={(!draft.trim() && !selectedImage && !pinnedOrder) || isSending}
          >
            {isSending ? <ActivityIndicator size="small" color={colors.white} /> : <Send size={18} color={colors.white} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function PinnedOrder({ order, selected, onPress }) {
  const firstItem = order.items?.[0];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Remove' : 'Attach'} ${order.name || order.orderNumber} from message`} style={[styles.pinnedOrder, selected && styles.pinnedOrderSelected]} onPress={onPress}>
      {firstItem?.image ? <Image source={{ uri: resolveImg(firstItem.image) }} style={styles.orderImage} /> : <View style={[styles.orderImage, styles.orderImageFallback]}><Package size={18} color={colors.gray400} /></View>}
      <View style={styles.orderBody}>
        <Text style={styles.orderNumber} numberOfLines={1}>{order.name || order.orderNumber}</Text>
        <Text style={styles.orderSummary} numberOfLines={1}>{order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} · ₱{Number(order.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
        <Text style={styles.orderStatus}>{String(order.status || '').replaceAll('_', ' ')}</Text>
      </View>
    </Pressable>
  );
}

function MessageOrder({ order, isMine }) {
  return <View style={[styles.messageOrder, isMine && styles.messageOrderMine]}><Package size={15} color={isMine ? colors.white : colors.secondary} /><View style={styles.orderBody}><Text style={[styles.messageOrderNumber, isMine && styles.bubbleTextMine]}>{order.name || order.orderNumber}</Text><Text style={[styles.messageOrderMeta, isMine && styles.messageTimeMine]}>{order.status} · ₱{Number(order.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  headerTitle: { ...typography.h3, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  ordersSection: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, backgroundColor: colors.white },
  ordersTitle: { ...typography.caption, paddingHorizontal: spacing.lg, marginBottom: spacing.xs, color: colors.textMuted },
  ordersList: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  pinnedOrder: { width: 228, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, borderRadius: radius.lg, backgroundColor: colors.gray50 },
  pinnedOrderSelected: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.bgGreenLight },
  orderImage: { width: 46, height: 46, borderRadius: radius.base, backgroundColor: colors.gray100 },
  orderImageFallback: { alignItems: 'center', justifyContent: 'center' },
  orderBody: { flex: 1, minWidth: 0 },
  orderNumber: { ...typography.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  orderSummary: { fontSize: 11, lineHeight: 15, color: colors.textSecondary },
  orderStatus: { marginTop: 2, fontSize: 10, lineHeight: 13, color: colors.primaryDark, textTransform: 'capitalize' },
  listContainer: { flexGrow: 1, padding: spacing.lg, gap: spacing.sm },
  emptyMessages: { justifyContent: 'flex-end' },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleTheirs: { backgroundColor: colors.gray100 },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextMine: { color: colors.white },
  messageImage: { width: 220, maxWidth: '100%', aspectRatio: 4 / 3, marginBottom: spacing.xs, borderRadius: radius.base, backgroundColor: colors.gray200 },
  messageOrder: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderMedium },
  messageOrderMine: { borderBottomColor: 'rgba(255,255,255,0.35)' },
  messageOrderNumber: { ...typography.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  messageOrderMeta: { fontSize: 11, lineHeight: 15, color: colors.textSecondary },
  messageMeta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, marginTop: 3 },
  messageMetaMine: { alignSelf: 'flex-end' },
  messageTime: { fontSize: 10, lineHeight: 13, color: colors.textMuted },
  messageTimeMine: { color: 'rgba(255,255,255,0.72)' },
  composer: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgPrimary,
  },
  ratingPrompt: {
    position: 'relative',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    backgroundColor: colors.gray50,
  },
  ratingClose: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  ratingTitle: { ...typography.body, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, textAlign: 'center', paddingHorizontal: spacing.lg },
  ratingSubtitle: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  ratingStars: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  ratingStar: { padding: 2 },
  ratingLater: { ...typography.caption, color: colors.textSecondary, marginTop: 2, textDecorationLine: 'underline' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachedOrder: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primary, backgroundColor: colors.bgGreenLight },
  attachedOrderText: { ...typography.caption, flexShrink: 1, color: colors.primaryDark, fontFamily: 'Inter_600SemiBold' },
  selectedImageWrap: { position: 'relative', alignSelf: 'flex-start' },
  selectedImage: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.gray100 },
  removeImage: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.gray800 },
  imageButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.bgGreenLight },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.gray100,
    color: colors.textPrimary,
    ...typography.body,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.gray300 },
});
