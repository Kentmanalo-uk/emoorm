import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeftIcon, ChatsCircleIcon, LockSimpleIcon, PaperPlaneRightIcon,
} from 'phosphor-react-native';
import ChatSafetyNotice from '../../inbox/ChatSafetyNotice';
import Glass, { liquidGlass } from '../../Glass';
import { font, t } from '../../../theme';
import EmptyState from '../../EmptyState';
import {
  Badge, Message, RatingPrompt, isMine,
} from './SupportParts';

// .sc-composer on phones: white, a hairline above.
const COMPOSER_FALLBACK = {
  backgroundColor: t.neutral[0],
  borderTopWidth: 1,
  borderTopColor: t.neutral[150],
};

/**
 * An open case, full screen over the Seller Center's bars (web
 * .sc-chat.has-active at phone width): back, the subject with its status and
 * who holds it, the messages, the rating prompt once resolved, the safety
 * strip and the composer.
 *
 * The composer floats at the bottom in Glass: on iOS 26 the messages, the
 * rating prompt and the safety strip scroll under its Liquid Glass; elsewhere
 * it is the website's white bar under them, as before.
 *
 * thread: the loaded case (null while it loads); title/subtitle/status: its head.
 */
export default function SupportThread({
  thread, title, subtitle, status, statusLabel, draft, onDraft, sending, onSend, onRated, onBack, inputRef,
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const isClosed = status === 'CLOSED';
  const canRate = Boolean(thread) && (status === 'RESOLVED' || status === 'CLOSED');
  const canSend = !sending && Boolean(draft.trim());

  // The newest message in view when the thread opens or grows.
  const messageCount = thread?.messages?.length || 0;
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 30);
    return () => clearTimeout(timer);
  }, [messageCount]);

  const below = (
    <>
      {canRate ? <RatingPrompt conversation={thread} onRated={onRated} /> : null}
      <ChatSafetyNotice />
    </>
  );

  const composer = (
    <Glass
      fallbackStyle={COMPOSER_FALLBACK}
      style={[styles.composer, { paddingBottom: 8 + insets.bottom }, liquidGlass && styles.floating]}
      onLayout={liquidGlass ? (e) => setComposerHeight(e.nativeEvent.layout.height) : undefined}
    >
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={onDraft}
        placeholder="Type a message…"
        placeholderTextColor={t.neutral[500]}
        maxLength={2000}
        multiline
        submitBehavior="submit"
        returnKeyType="send"
        enterKeyHint="send"
        onSubmitEditing={() => { if (canSend) onSend(); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocus]}
        underlineColorAndroid="transparent"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        onPress={onSend}
        disabled={!canSend}
        style={({ pressed }) => [styles.send, pressed && canSend && { backgroundColor: t.primary[700] }, !canSend && { opacity: 0.5 }]}
      >
        {sending ? <ActivityIndicator size={18} color="#fff" /> : <PaperPlaneRightIcon size={18} weight="fill" color="#fff" />}
      </Pressable>
    </Glass>
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.head, { paddingTop: 8 + insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to conversations"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && { backgroundColor: t.neutral[100] }]}
        >
          <CaretLeftIcon size={18} color={t.neutral[700]} />
        </Pressable>
        {thread ? (
          <View style={styles.title}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>{title}</Text>
              <Badge status={status} label={statusLabel} style={styles.headBadge} />
            </View>
            <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>
          </View>
        ) : <View style={styles.title} />}
      </View>

      {!thread ? (
        <View style={[styles.messages, styles.empty]}>
          <Text style={styles.emptyText}>Loading messages…</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.messagesWrap, liquidGlass && { paddingBottom: composerHeight }]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.messages}>
            {thread.messages.length === 0 ? (
              <EmptyState page icon={ChatsCircleIcon} text="Send a message to start the conversation." />
            ) : null}
            {thread.messages.map((m) => (
              <Message key={m.id} mine={isMine(thread, m)} name={m.sender?.fullName} body={m.body} createdAt={m.createdAt} />
            ))}
            {isClosed ? (
              <View style={styles.closedNotice}>
                <LockSimpleIcon size={14} color={t.neutral[600]} />
                <Text style={styles.closedText}>This case was closed. Send a message to reopen it.</Text>
              </View>
            ) : null}
          </View>
          {liquidGlass ? below : null}
        </ScrollView>
      )}

      {thread && !liquidGlass ? below : null}
      {!thread && liquidGlass ? <View style={{ height: composerHeight }} /> : null}
      {composer}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  flex: { flex: 1 },

  head: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, paddingLeft: 6, paddingBottom: 8,
    backgroundColor: t.neutral[0],
  },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, minHeight: 43 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  name: { flexShrink: 1, minWidth: 0, fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(700) },
  headBadge: { alignSelf: 'center' },
  sub: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },

  messagesWrap: { flexGrow: 1 },
  messages: { flexGrow: 1, gap: 10, paddingVertical: 14, paddingHorizontal: 12, backgroundColor: t.neutral[0] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], textAlign: 'center', ...font(400) },
  closedNotice: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: 6, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  closedText: { flexShrink: 1, fontSize: 12, lineHeight: 19.2, color: t.neutral[600], textAlign: 'center', ...font(400) },

  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 8 },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 16, borderRadius: 21,
    backgroundColor: t.neutral[100], color: t.neutral[900], fontSize: 16, lineHeight: 21.6, ...font(400),
  },
  inputFocus: { boxShadow: `0px 0px 0px 1px ${t.primary[600]}` },
  send: {
    flexShrink: 0, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
});
