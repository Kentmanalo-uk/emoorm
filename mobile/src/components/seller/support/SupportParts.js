import { useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { CheckCircleIcon, StarIcon } from '../../../lib/icons';
import apiClient from '../../../api/client';
import { resolveImg } from '../../../lib/media';
import { toast } from '../../../lib/toast';
import { errorText } from '../../profile/profileLib';
import { font, t, themed } from '../../../theme';
import { BADGE, formatTime } from './supportLib';

/*
 * The pieces of the Seller Center's "Admin messages" (web SupportChat.jsx +
 * SupportChat.css at phone width, inside the seller shell: 14px text in
 * neutral-800, the CSS's own bold weights): a status badge, the round
 * avatar, a case in the list and the rating prompt of a resolved case.
 */

/** .sc-badge: a small square tag in the status's colours. */
export function Badge({ status, label, style }) {
  const tone = BADGE[status] || BADGE.OPEN;
  return <Text style={[styles.badge, { backgroundColor: tone.backgroundColor, color: tone.color }, style]}>{label}</Text>;
}

/** .sc-avatar: the municipality's logo, else its first letter. */
export function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.avatar}>
      {src && !failed
        ? <Image source={{ uri: resolveImg(src) }} style={styles.avatarImg} onError={() => setFailed(true)} />
        : <Text style={styles.avatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

/** One case in the list (.sc-list-item): avatar, subject and time, topic, last message, badges, unread count. */
export function CaseRow({
  title, topic, status, statusLabel, rating, preview, time, logo, unread, onPress,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: t.neutral[50] }]}
    >
      <Avatar src={logo} name={title} />
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.itemTime}>{time}</Text>
        </View>
        <Text style={styles.itemTopic} numberOfLines={1}>{topic}</Text>
        <Text style={[styles.itemPreview, status === 'CLOSED' && { color: t.neutral[500] }]} numberOfLines={1}>{preview}</Text>
        <View style={styles.itemBadges}>
          <Badge status={status} label={statusLabel} />
          {rating > 0 ? <Badge status="RATED" label={`Rated ${rating}/5`} /> : null}
        </View>
      </View>
      {unread > 0 ? <Text style={styles.unread}>{unread}</Text> : null}
    </Pressable>
  );
}

/** Read-only stars (.sc-stars), once a case has been rated. */
function Stars({ value }) {
  return (
    <View style={styles.stars} accessibilityLabel={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} size={15} weight={n <= value ? 'fill' : 'regular'} color={n <= value ? t.warning[500] : t.neutral[300]} />
      ))}
    </View>
  );
}

/**
 * .sc-rating: shown to the case owner once an admin resolves the case. One
 * rating per case, so after it is sent the score replaces the prompt.
 */
export function RatingPrompt({ conversation, onRated }) {
  const [picked, setPicked] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  if (conversation.rating) {
    return (
      <View style={[styles.rating, styles.ratingDone]}>
        <View style={styles.ratingStrong}>
          <CheckCircleIcon size={14} weight="fill" color={t.neutral[900]} />
          <Text style={styles.ratingTitle}>You rated this case</Text>
        </View>
        <Stars value={Number(conversation.rating)} />
        {conversation.ratingComment ? <Text style={styles.ratingQuote}>“{conversation.ratingComment}”</Text> : null}
      </View>
    );
  }

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const res = await apiClient.post(`/support/cases/${conversation.id}/rating`, {
        rating: picked,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      toast.success('Thanks for the feedback.');
      onRated(res.data);
    } catch (err) {
      toast.error(errorText(err, 'Could not save your rating'));
    } finally {
      setSaving(false);
    }
  };

  const off = !picked || saving;
  return (
    <View style={styles.rating}>
      <Text style={styles.ratingTitle}>How did we do?</Text>
      <Text style={styles.ratingHint}>This case was marked resolved. Rate the help you got.</Text>
      <View style={styles.ratingStars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} onPress={() => setPicked(n)} style={styles.ratingStar}>
            <StarIcon size={22} weight={n <= picked ? 'fill' : 'regular'} color={n <= picked ? t.warning[500] : t.neutral[500]} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        maxLength={1000}
        multiline
        textAlignVertical="top"
        placeholder="Anything you want to add? (optional)"
        placeholderTextColor={t.neutral[500]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.ratingInput, focused && { borderColor: t.primary[600] }]}
      />
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        disabled={off}
        style={({ pressed }) => [styles.btnGreen, pressed && { backgroundColor: t.primary[700] }, off && { opacity: 0.5 }]}
      >
        <Text style={styles.btnGreenText}>{saving ? 'Sending…' : 'Send rating'}</Text>
      </Pressable>
    </View>
  );
}

/** "Mine" is the seller's side of the case (the website's viewerSide check). */
export const isMine = (thread, m) => (thread.viewerSide === 'admin'
  ? m.senderId !== thread.user?.id
  : m.senderId === thread.user?.id);

/** .sc-message: grey on the left, green on the right for the seller's own. */
export function Message({ mine, name, body, createdAt }) {
  return (
    <View style={[styles.message, mine && styles.messageMine]}>
      {!mine && name ? <Text style={styles.messageName}>{name}</Text> : null}
      <Text style={[styles.messageText, mine && styles.onGreen]} selectable>{body}</Text>
      <Text style={[styles.messageTime, mine && styles.onGreen]}>{formatTime(createdAt)}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  badge: {
    alignSelf: 'flex-start', paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden', fontSize: 11, lineHeight: 17.6, ...font(700),
  },

  avatar: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 14, lineHeight: 22.4, color: t.primary[600], ...font(700) },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100], backgroundColor: t.neutral[0],
  },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itemTitle: { flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, color: t.neutral[900], ...font(700) },
  itemTime: { flexShrink: 0, fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  itemTopic: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  itemPreview: { fontSize: 13, lineHeight: 20.8, color: t.neutral[600], ...font(400) },
  itemBadges: { flexDirection: 'row', gap: 4, marginTop: 3 },
  unread: {
    alignSelf: 'center', minWidth: 20, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.primary[600], color: t.onBrand, textAlign: 'center', fontSize: 11, lineHeight: 17.6, ...font(700),
  },

  stars: { flexDirection: 'row', gap: 1 },
  rating: {
    alignItems: 'flex-start', gap: 8, marginTop: 8, marginHorizontal: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.primary[100], borderRadius: 10, backgroundColor: t.primary[50],
  },
  ratingDone: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  ratingStrong: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingTitle: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[900], ...font(700) },
  ratingHint: { fontSize: 12.5, lineHeight: 20, color: t.neutral[600], ...font(400) },
  ratingQuote: { flexBasis: '100%', fontSize: 13, lineHeight: 20.8, color: t.neutral[600], ...font(400) },
  ratingStars: { flexDirection: 'row', gap: 2 },
  ratingStar: { padding: 2 },
  ratingInput: {
    alignSelf: 'stretch', height: 104, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 13, lineHeight: 20.8, ...font(400),
  },
  btnGreen: { minHeight: 36, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: t.primary[600] },
  btnGreenText: { fontSize: 12, lineHeight: 14.4, color: t.onBrand, ...font(600) },

  message: {
    alignSelf: 'flex-start', maxWidth: '82%', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: t.neutral[100],
    borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderBottomLeftRadius: 4,
  },
  messageMine: { alignSelf: 'flex-end', backgroundColor: t.primary[600], borderBottomRightRadius: 4, borderBottomLeftRadius: 12 },
  messageName: { marginBottom: 2, fontSize: 12, lineHeight: 19.2, color: t.primary[700], ...font(600) },
  messageText: { fontSize: 14, lineHeight: 20.3, color: t.neutral[800], ...font(400) },
  messageTime: { marginTop: 4, fontSize: 11, lineHeight: 17.6, opacity: 0.88, textAlign: 'right', color: t.neutral[800], ...font(400) },
  onGreen: { color: t.onBrand },
}));
