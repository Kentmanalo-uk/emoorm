import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { PaperPlaneTiltIcon, TrashIcon, XIcon } from '../../lib/icons';
import useAuthStore from '../../store/authStore';
import { resolveImg } from '../../lib/media';
import { addReviewComment, deleteReviewComment, listReviewComments } from '../../lib/reviewSocial';
import { font, t, themed } from '../../theme';

const MAX = 600;

const when = (value) => {
  const at = new Date(value);
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return at.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
};

function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  return (
    <View style={styles.avatar}>
      {uri && !failed
        ? <Image source={{ uri }} style={styles.avatarImg} onError={() => setFailed(true)} />
        : <Text style={styles.avatarText}>{(name || 'U').trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

/**
 * What other shoppers said under one review, and the box to add to it
 * (web/src/components/reviews/ReviewComments.jsx).
 *
 * A sheet over whatever opened it rather than a screen of its own: you
 * are reading the photo and the words together, and losing the photo to
 * read a reply would be the wrong trade.
 *
 * A comment that trips the word list is still posted — the server flags
 * it for an admin instead. Silently swallowing what somebody wrote
 * because a guess went wrong is worse than a wrong word getting through,
 * which is the same call message.service makes.
 */
export default function ReviewComments({ review, onClose, onCountChange }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const me = useAuthStore((s) => s.user);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');

  // No setLoading(true) here: `loading` starts true and the sheet is keyed
  // on the review at the call site, so a different review is a fresh
  // mount rather than this effect running again on a live component.
  useEffect(() => {
    let live = true;
    listReviewComments(review.id)
      .then((res) => { if (live) { setComments(res.comments); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [review.id]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (!isAuthenticated) { onClose(); router.push('/login'); return; }
    setSending(true);
    setProblem('');
    try {
      const comment = await addReviewComment(review.id, body);
      const next = [...comments, comment];
      setComments(next);
      onCountChange?.(next.length);
      setDraft('');
    } catch (err) {
      // The server's own words: it is the one that knows whether this is
      // a block, a pause, or just too long.
      setProblem(err?.message || 'That did not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment) => {
    const before = comments;
    const next = comments.filter((c) => c.id !== comment.id);
    setComments(next);
    onCountChange?.(next.length);
    try {
      await deleteReviewComment(comment.id);
    } catch {
      setComments(before);
      onCountChange?.(before.length);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close comments" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.dock}
      >
        <View style={styles.sheet}>
          <View style={styles.top}>
            <Text style={styles.title}>
              {comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comments'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close comments" onPress={onClose} style={styles.x}>
              <XIcon size={18} color={t.neutral[700]} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.quietBox}><ActivityIndicator color={t.primary[600]} /></View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={(
                <Text style={styles.quiet}>
                  {failed ? 'Could not load the comments.' : 'No comments yet. Ask the buyer how it worked out.'}
                </Text>
              )}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  <Avatar src={item.user?.profilePhoto} name={item.user?.fullName} />
                  <View style={styles.body}>
                    <View style={styles.whoRow}>
                      <Text style={styles.who} numberOfLines={1}>{item.user?.fullName || 'Anonymous'}</Text>
                      <Text style={styles.when}>{when(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.said}>{item.body}</Text>
                  </View>
                  {me?.id === item.user?.id ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove your comment"
                      onPress={() => remove(item)}
                      style={styles.bin}
                    >
                      <TrashIcon size={15} color={t.neutral[400]} />
                    </Pressable>
                  ) : null}
                </View>
              )}
            />
          )}

          <View style={styles.write}>
            {problem ? <Text style={styles.problem} accessibilityRole="alert">{problem}</Text> : null}
            <View style={styles.row}>
              <TextInput
                value={draft}
                onChangeText={(v) => setDraft(v.slice(0, MAX))}
                placeholder={isAuthenticated ? 'Add a comment…' : 'Sign in to comment'}
                placeholderTextColor={t.neutral[400]}
                style={styles.input}
                maxLength={MAX}
                multiline
                accessibilityLabel="Add a comment"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                onPress={send}
                disabled={!draft.trim() || sending}
                style={[styles.send, (!draft.trim() || sending) && styles.sendOff]}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <PaperPlaneTiltIcon size={17} weight="fill" color="#fff" />}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  dock: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Tall enough to be worth opening, short enough to leave the photo
    // showing above it.
    height: '68%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: t.neutral[0],
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.neutral[200],
  },
  title: { fontSize: 15, lineHeight: 24, ...font(700), color: t.neutral[900] },
  x: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 14, gap: 14 },
  quietBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  quiet: { marginTop: 24, textAlign: 'center', fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 28, height: 28, borderRadius: 999, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
  },
  avatarImg: { width: 28, height: 28 },
  avatarText: { fontSize: 11, lineHeight: 17.6, ...font(500), color: t.primary[700] },
  body: { flex: 1, minWidth: 0 },
  whoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  who: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, ...font(600), color: t.neutral[900] },
  when: { fontSize: 11, lineHeight: 17.6, ...font(400), color: t.neutral[500] },
  said: { fontSize: 14, lineHeight: 20.3, ...font(400), color: t.neutral[800] },
  bin: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  write: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  problem: { marginBottom: 8, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.danger[600] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    maxHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 20,
    fontSize: 14,
    ...font(400),
    color: t.neutral[900],
    backgroundColor: t.neutral[0],
  },
  send: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  sendOff: { backgroundColor: t.neutral[300] },
}));
