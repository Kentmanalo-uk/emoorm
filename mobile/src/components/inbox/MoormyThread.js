import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowClockwiseIcon, CaretLeftIcon, CaretRightIcon, NotePencilIcon, PaperPlaneTiltIcon, QuestionIcon, TranslateIcon,
} from 'phosphor-react-native';
import apiClient from '../../api/client';
import { appPath } from '../../lib/notificationLink';
import { font, t } from '../../theme';
import ShellPageMenu from '../ShellPageMenu';
import MoormyAvatar from './MoormyAvatar';
import { AiTag, GradientFill, MMY } from './InboxGradient';
import { setMoormyChat, useMoormyChat } from './moormyChat';

/*
 * The buyer's chat with Ate Moormy (web/src/components/moormy/
 * MoormyThread.jsx): questions about shopping on Emoorm, answered in
 * English or Tagalog, with suggested questions to tap and links to the
 * page an answer is about.
 */

const UI = {
  en: {
    role: 'AI shopping helper',
    note: 'She answers questions about shopping on Emoorm only, and can make mistakes. Check important details.',
    suggested: 'Suggested questions',
    placeholder: 'Ask Ate Moormy…',
    newChat: 'New chat',
    switchLang: 'Answer in Tagalog',
    help: 'Help Center',
    retry: 'Try again',
    cantLoad: "Ate Moormy can't load right now.",
    offline: "I couldn't reach Emoorm just now. Check your connection and try again.",
    typing: 'Ate Moormy is typing',
  },
  tl: {
    role: 'AI shopping helper',
    note: 'Tungkol lang sa pamimili sa Emoorm ang sinasagot niya, at puwede siyang magkamali. Suriin ang mahahalagang detalye.',
    suggested: 'Mga puwedeng itanong',
    placeholder: 'Magtanong kay Ate Moormy…',
    newChat: 'Bagong chat',
    switchLang: 'Answer in English',
    help: 'Help Center',
    retry: 'Subukan ulit',
    cantLoad: 'Hindi ma-load si Ate Moormy ngayon.',
    offline: 'Hindi ko maabot ang Emoorm ngayon. Tingnan ang koneksyon mo at subukan ulit.',
    typing: 'Nagta-type si Ate Moormy',
  },
};
const LANG_KEY = 'emoorm-moormy-lang';

/** **bold** and *italic* inside a line. */
const inline = (text, base) => text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
  if (/^\*\*[^*]+\*\*$/.test(part)) return <Text key={i} style={[base, styles.bold]}>{part.slice(2, -2)}</Text>;
  if (/^\*[^*\s][^*]*\*$/.test(part)) return <Text key={i} style={[base, styles.italic]}>{part.slice(1, -1)}</Text>;
  return part;
});

/** Her answers as paragraphs and lists (web ReplyText.jsx). */
function ReplyText({ text, style }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const step = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || step) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        list = { type, items: [] };
        blocks.push(list);
      }
      list.items.push(bullet ? bullet[1] : step[2]);
      continue;
    }
    list = null;
    if (line) blocks.push({ type: 'p', text: line.replace(/^#{1,6}\s*/, '') });
  }
  return blocks.map((b, i) => {
    const gap = i > 0 ? styles.blockGap : null;
    if (b.type === 'p') return <Text key={i} style={[style, gap]}>{inline(b.text, style)}</Text>;
    return (
      <View key={i} style={[styles.list, gap]}>
        {b.items.map((item, j) => (
          <View key={j} style={[styles.li, j > 0 && styles.liGap]}>
            <Text style={[style, styles.marker]}>{b.type === 'ul' ? '•' : `${j + 1}.`}</Text>
            <Text style={[style, styles.liText]}>{inline(item, style)}</Text>
          </View>
        ))}
      </View>
    );
  });
}

/** A row that rises in (mmy-pop, 320ms). */
function Pop({ children, style, delay = 0, duration = 320 }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [v, delay, duration]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Three dots, pink and green in turn (mmy-typing). */
function TypingDots({ label }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const loops = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 150),
      Animated.timing(d, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(d, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(400 - i * 150),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[styles.bubble, styles.typing]} accessibilityLabel={label}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, i === 1 && styles.dotGreen, {
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }]}
        />
      ))}
    </View>
  );
}

/**
 * pendingAsk: a question typed in the Messages intro card, asked as soon as
 * the chat opens (onAsked then clears it).
 */
export default function MoormyThread({ userId, pendingAsk, onAsked, onBack }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chat = useMoormyChat(userId);
  const { messages, asked } = chat;
  const [lang, setLang] = useState('en');
  const [intro, setIntro] = useState(null); // null loading, false failed
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  // The box grows with what is typed (web: a one-line textarea).
  const [inputHeight, setInputHeight] = useState(41.6);
  const scrollRef = useRef(null);
  const handledAsk = useRef(null);
  const copy = UI[lang];

  // The language chosen before (here or on her seller page).
  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((saved) => { if (saved === 'en' || saved === 'tl') setLang(saved); }).catch(() => {});
  }, []);

  const update = useCallback((fn) => setMoormyChat(userId, fn), [userId]);

  const loadIntro = useCallback(() => {
    setIntro(null);
    apiClient.get('/buyer-assistant', { params: { lang } })
      .then((res) => setIntro(res.data))
      .catch(() => setIntro(false));
  }, [lang]);

  useEffect(() => { loadIntro(); }, [loadIntro]);

  /** Ask the server; the answer (or what went wrong) joins the chat. */
  const ask = useCallback(async (request) => {
    setBusy(true);
    try {
      const res = await apiClient.post('/buyer-assistant/chat', request.presetId
        ? { presetId: request.presetId, history: request.history, asked: request.asked, lang: request.lang }
        : { question: request.question, history: request.history, asked: request.asked, lang: request.lang });
      const d = res.data || {};
      update((c) => ({
        ...c,
        asked: request.presetId && !c.asked.includes(request.presetId) ? [...c.asked, request.presetId] : c.asked,
        messages: [...c.messages, {
          id: `a${Date.now()}`, role: 'assistant', text: d.reply, lang: d.lang, links: d.links || [], suggestions: d.suggestions || [],
        }],
      }));
    } catch (err) {
      update((c) => ({
        ...c,
        messages: [...c.messages, {
          id: `e${Date.now()}`,
          role: 'assistant',
          error: true,
          text: err?.message && !/network/i.test(err.message) ? err.message : UI[request.lang]?.offline || UI.en.offline,
          retry: request,
        }],
      }));
    } finally {
      setBusy(false);
    }
  }, [update]);

  const send = useCallback(({ text, presetId }) => {
    if (busy) return;
    const question = String(text || '').trim();
    if (!question) return;
    // What was said before, for follow-up questions (not failed tries).
    const history = messages.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, content: m.text }));
    update((c) => ({ ...c, messages: [...c.messages.filter((m) => !m.error), { id: `u${Date.now()}`, role: 'user', text: question }] }));
    if (!presetId) setDraft('');
    ask({ question, presetId, history, asked, lang });
  }, [busy, messages, asked, lang, update, ask]);

  // The question typed in the intro card: asked once, as the chat opens.
  useEffect(() => {
    if (!pendingAsk || !chat.loaded || handledAsk.current === pendingAsk) return;
    handledAsk.current = pendingAsk;
    send({ text: pendingAsk });
    onAsked?.();
  }, [pendingAsk, chat.loaded, send, onAsked]);

  const retry = (failed) => {
    update((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== failed.id) }));
    ask(failed.retry);
  };

  const chooseLang = (next) => {
    setLang(next);
    AsyncStorage.setItem(LANG_KEY, next).catch(() => { /* chosen for this visit only */ });
  };

  const openLink = (to) => {
    const path = appPath(to);
    if (path) router.push(path);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const chips = (list) => (
    <View style={styles.chips}>
      {list.map((p, i) => (
        <Pop key={p.id} delay={Math.min(i, 4) * 50} duration={300}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => send({ presetId: p.id, text: p.question })}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, busy && styles.chipOff]}
          >
            <Text style={styles.chipText}>{p.question}</Text>
          </Pressable>
        </Pop>
      ))}
    </View>
  );

  const canSend = !busy && Boolean(draft.trim());

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <View style={[styles.head, { paddingTop: 8 + insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <CaretLeftIcon size={22} color={t.neutral[900]} />
        </Pressable>
        <MoormyAvatar size={40} />
        <View style={styles.title}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>Ate Moormy</Text>
            <AiTag />
          </View>
          <Text style={styles.sub} numberOfLines={1}>{copy.role}</Text>
        </View>
        <ShellPageMenu
          label="Ate Moormy options"
          items={[
            messages.length > 0 && { key: 'new', Icon: NotePencilIcon, label: copy.newChat, onPress: () => update((c) => ({ ...c, messages: [], asked: [] })) },
            { key: 'lang', Icon: TranslateIcon, label: copy.switchLang, onPress: () => chooseLang(lang === 'tl' ? 'en' : 'tl') },
            { key: 'help', Icon: QuestionIcon, label: copy.help, to: '/help-center' },
          ].filter(Boolean)}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.box}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: messages.length > 0 })}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Chat with Ate Moormy"
      >
        <View style={styles.hero}>
          <MoormyAvatar size={64} glow />
          <Text style={styles.heroName}>Ate Moormy</Text>
          <Text style={styles.heroNote}>{copy.note}</Text>
        </View>

        {intro === false ? (
          <View style={styles.row}>
            <MoormyAvatar size={28} style={styles.rowAvatar} />
            <View style={[styles.bubble, styles.bubbleTop, styles.bubbleError]}>
              <Text style={[styles.text, styles.errorText]}>{copy.cantLoad}</Text>
              <Pressable accessibilityRole="button" onPress={loadIntro} style={styles.retry}>
                <ArrowClockwiseIcon size={14} color={t.danger[800]} />
                <Text style={styles.retryText}>{copy.retry}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {intro ? (
          <Pop style={styles.row}>
            <MoormyAvatar size={28} style={styles.rowAvatar} />
            <View style={[styles.bubble, styles.bubbleTop]}><ReplyText text={intro.greeting} style={styles.text} /></View>
          </Pop>
        ) : null}
        {intro && !messages.length && !busy ? (
          <View style={styles.suggest}>
            <Text style={styles.suggestLabel}>{UI[intro.lang]?.suggested || copy.suggested}</Text>
            {chips(intro.presets || [])}
          </View>
        ) : null}

        {messages.map((m) => {
          const self = m.role === 'user';
          return (
            <Pop key={m.id} style={[styles.row, self && styles.rowSelf]}>
              {!self ? <MoormyAvatar size={28} style={styles.rowAvatar} /> : null}
              <View style={[styles.message, self && styles.messageSelf]}>
                <View style={[styles.bubble, self && styles.bubbleSelf, m.error && styles.bubbleError]}>
                  {self
                    ? <Text style={[styles.text, styles.textSelf]}>{m.text}</Text>
                    : <ReplyText text={m.text} style={[styles.text, m.error && styles.errorText]} />}
                  {m.error && m.retry ? (
                    <Pressable accessibilityRole="button" onPress={() => retry(m)} disabled={busy} style={styles.retry}>
                      <ArrowClockwiseIcon size={14} color={t.danger[800]} />
                      <Text style={styles.retryText}>{copy.retry}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {!self && m.links?.length > 0 ? (
                  <View style={styles.links}>
                    {m.links.map((l) => (
                      <Pressable key={`${l.to}${l.label}`} accessibilityRole="link" onPress={() => openLink(l.to)} style={styles.link}>
                        <Text style={styles.linkText}>{l.label}</Text>
                        <CaretRightIcon size={13} weight="bold" color={t.primary[700]} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {m === lastAssistant && !busy && m.suggestions?.length > 0 ? chips(m.suggestions) : null}
              </View>
            </Pop>
          );
        })}

        {busy ? (
          <Pop style={styles.row}>
            <MoormyAvatar size={28} style={styles.rowAvatar} />
            <TypingDots label={copy.typing} />
          </Pop>
        ) : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: 8 + insets.bottom }]}>
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          maxLength={500}
          placeholder={copy.placeholder}
          placeholderTextColor={t.neutral[400]}
          accessibilityLabel={copy.placeholder}
          enterKeyHint="send"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onContentSizeChange={(e) => setInputHeight(Math.min(120, Math.max(41.6, e.nativeEvent.contentSize.height)))}
          onKeyPress={Platform.OS === 'web' ? (e) => {
            if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault?.(); send({ text: draft }); }
          } : undefined}
          style={[styles.input, { height: Platform.OS === 'web' ? inputHeight : undefined }, focused && styles.inputFocus]}
          textAlignVertical="center"
          underlineColorAndroid="transparent"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend}
          onPress={() => send({ text: draft })}
          style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && canSend && styles.sendPressed]}
        >
          {/* .mmy-send: her gradient, grey while there is nothing to send. */}
          {canSend ? <GradientFill radius={20} /> : null}
          <PaperPlaneTiltIcon size={20} weight="fill" color={t.neutral[0]} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingHorizontal: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  back: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pressed: { backgroundColor: t.neutral[100] },
  title: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flexShrink: 1, fontSize: 16, lineHeight: 25.6, color: t.neutral[900], ...font(500) },
  sub: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  box: { flex: 1, backgroundColor: t.neutral[0] },
  messages: { paddingVertical: 14, paddingHorizontal: 12, gap: 8 },
  hero: { alignItems: 'center', gap: 6, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6 },
  heroName: { marginTop: 4, fontSize: 16, lineHeight: 25.6, color: t.neutral[900], ...font(500) },
  // 300 on the website, where the text sets a hair wider: 297 wraps the same.
  heroNote: { maxWidth: 297, fontSize: 12, lineHeight: 17.4, color: t.neutral[500], textAlign: 'center', ...font(400) },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, maxWidth: '100%' },
  rowSelf: { flexDirection: 'row-reverse' },
  rowAvatar: { marginTop: 2 },
  message: { flexShrink: 1, minWidth: 0, maxWidth: '82%', alignItems: 'flex-start', gap: 6 },
  messageSelf: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '100%', gap: 2, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: MMY.pinkSoft, boxShadow: '0px 1px 1px rgba(15, 23, 42, 0.04)',
  },
  bubbleTop: { maxWidth: '82%' },
  bubbleSelf: { backgroundColor: t.primary[600] },
  bubbleError: { backgroundColor: '#fef2f2' },
  text: { fontSize: 14, lineHeight: 21, color: t.neutral[900], ...font(400) },
  textSelf: { color: t.neutral[0] },
  errorText: { color: t.danger[800] },
  bold: { ...font(700) },
  italic: { fontStyle: 'italic' },
  blockGap: { marginTop: 6 },
  list: { paddingLeft: 4 },
  li: { flexDirection: 'row' },
  liGap: { marginTop: 3 },
  marker: { width: 14 },
  liText: { flex: 1 },
  retry: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 4, paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.danger[200], borderRadius: 999, backgroundColor: '#fff',
  },
  retryText: { fontSize: 12.5, lineHeight: 18.75, color: t.danger[800], ...font(400) },
  suggest: { gap: 6, marginLeft: 34 },
  suggestLabel: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: MMY.pinkLine, borderRadius: 999, backgroundColor: t.neutral[0] },
  chipPressed: { backgroundColor: MMY.pinkSoft },
  chipOff: { opacity: 0.5 },
  chipText: { fontSize: 13, lineHeight: 20.8, color: MMY.pinkInk, ...font(400) },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.primary[50] },
  linkText: { fontSize: 12.5, lineHeight: 20, color: t.primary[700], ...font(500) },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MMY.pink },
  dotGreen: { backgroundColor: MMY.green },
  composer: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, paddingHorizontal: 8,
    borderTopWidth: 1, borderTopColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  input: {
    flex: 1, minWidth: 0, minHeight: 40, maxHeight: 120, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9999,
    backgroundColor: t.neutral[100], color: t.neutral[900], fontSize: 16, lineHeight: 21.6, ...font(400), outlineStyle: 'none',
  },
  inputFocus: { boxShadow: `0px 0px 0px 1px ${t.primary[600]}` },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  sendPressed: { transform: [{ scale: 0.94 }] },
  sendOff: { backgroundColor: t.neutral[200], opacity: 0.35 },
});
