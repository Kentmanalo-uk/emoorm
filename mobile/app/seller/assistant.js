import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotePencilIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import useAuthStore from '../../src/store/authStore';
import { appPath } from '../../src/lib/notificationLink';
import SellerPage from '../../src/components/seller/SellerPage';
import { SellerHeaderButton } from '../../src/components/seller/SellerTopBars';
import { useReducedMotion } from '../../src/components/seller/SellerGuideArt';
import ReplyText from '../../src/components/seller/assistant/ReplyText';
import {
  Avatar, Chips, Composer, LangSwitch, LinkPills, RetryButton, TypingDots, bubbleStyle,
} from '../../src/components/seller/assistant/AssistantParts';
import { font, t } from '../../src/theme';

/*
 * /seller/assistant, Ate Moormy: the sellers' AI assistant
 * (web/src/pages/SellerAssistant.jsx + SellerAssistant.css, phones). Answers
 * questions about selling on Emoorm only, in English or Tagalog; suggested
 * questions to tap; links to the page an answer is about. The chat stays on
 * this phone (per account, the website's localStorage keys) until "New chat"
 * on the top bar. The whole page is the chat and the question box floats at
 * the bottom of the screen.
 */

/** Her page's own words, in each language she speaks. */
const UI = {
  en: {
    role: 'AI seller assistant',
    note: 'She answers questions about selling on Emoorm only, and can make mistakes. Check important details.',
    language: 'Language',
    suggested: 'Suggested questions',
    placeholder: 'Ask Ate Moormy about your shop…',
    newChat: 'New chat',
    retry: 'Try again',
    cantLoad: "Ate Moormy can't load right now.",
    offline: "I couldn't reach Emoorm just now. Check your connection and try again.",
    typing: 'Ate Moormy is typing',
  },
  tl: {
    role: 'AI seller assistant',
    note: 'Tungkol lang sa pagbebenta sa Emoorm ang sinasagot niya, at puwede siyang magkamali. Suriin ang mahahalagang detalye.',
    language: 'Wika',
    suggested: 'Mga puwedeng itanong',
    placeholder: 'Magtanong kay Ate Moormy…',
    newChat: 'Bagong chat',
    retry: 'Subukan ulit',
    cantLoad: 'Hindi ma-load si Ate Moormy ngayon.',
    offline: 'Hindi ko maabot ang Emoorm ngayon. Tingnan ang koneksyon mo at subukan ulit.',
    typing: 'Nagta-type si Ate Moormy',
  },
};
const LANG_KEY = 'emoorm-moormy-lang';

const MAX_KEPT = 40;
const storeKey = (userId) => `emoorm-moormy-${userId || 'me'}`;

export default function SellerAssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const user = useAuthStore((s) => s.user);
  // The app has no page language of its own: English until she is asked in Tagalog here.
  const [lang, setLang] = useState('en');
  const [intro, setIntro] = useState(null); // null loading, false failed
  const [messages, setMessages] = useState([]);
  const [asked, setAsked] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [composerHeight, setComposerHeight] = useState(61 + insets.bottom);
  const scrollRef = useRef(null);
  const wantEnd = useRef(false);
  const copy = UI[lang];

  // The language chosen before (here or in the buyers' chat), and the chat kept on this phone.
  useEffect(() => {
    let alive = true;
    Promise.all([
      AsyncStorage.getItem(LANG_KEY).catch(() => null),
      AsyncStorage.getItem(storeKey(user?.id)).catch(() => null),
    ]).then(([savedLang, savedChat]) => {
      if (!alive) return;
      if (savedLang === 'en' || savedLang === 'tl') setLang(savedLang);
      try {
        const chat = JSON.parse(savedChat || 'null');
        if (chat && Array.isArray(chat.messages)) {
          setMessages(chat.messages);
          setAsked(Array.isArray(chat.asked) ? chat.asked : []);
        }
      } catch { /* the chat just starts fresh */ }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(storeKey(user?.id), JSON.stringify({ messages: messages.slice(-MAX_KEPT), asked }))
      .catch(() => { /* the chat just starts fresh next time */ });
  }, [loaded, messages, asked, user?.id]);

  const loadIntro = useCallback(() => {
    setIntro(null);
    apiClient.get('/seller-assistant', { params: { lang } })
      .then((res) => setIntro(res.data))
      .catch(() => setIntro(false));
  }, [lang]);

  useEffect(() => { loadIntro(); }, [loadIntro]);

  const chooseLang = (next) => {
    if (next === lang) return;
    setLang(next);
    AsyncStorage.setItem(LANG_KEY, next).catch(() => { /* chosen for this visit only */ });
  };

  // The newest message (or the typing dots) in view, once it is laid out.
  useEffect(() => {
    wantEnd.current = true;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: messages.length > 0 && !still }), 30);
    return () => clearTimeout(timer);
  }, [messages, busy, still]);

  const newChat = useCallback(() => {
    setMessages([]);
    setAsked([]);
    setDraft('');
  }, []);

  /** Ask the server; the answer (or what went wrong) joins the chat. */
  const ask = async (request) => {
    setBusy(true);
    try {
      const res = await apiClient.post('/seller-assistant/chat', request.presetId
        ? { presetId: request.presetId, history: request.history, asked, lang: request.lang }
        : { question: request.question, history: request.history, asked, lang: request.lang });
      const d = res.data || {};
      setMessages((prev) => [...prev, {
        id: `a${Date.now()}`,
        role: 'assistant',
        text: d.reply,
        lang: d.lang,
        links: d.links || [],
        suggestions: d.suggestions || [],
      }]);
      if (request.presetId) setAsked((prev) => (prev.includes(request.presetId) ? prev : [...prev, request.presetId]));
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `e${Date.now()}`,
        role: 'assistant',
        error: true,
        text: err?.message && !/network/i.test(err.message) ? err.message : UI[request.lang]?.offline || UI.en.offline,
        retry: request,
      }]);
    } finally {
      setBusy(false);
    }
  };

  const send = ({ text, presetId }) => {
    if (busy) return;
    const question = presetId
      ? intro?.presets?.find((p) => p.id === presetId)?.question || text
      : String(text || '').trim();
    if (!question) return;
    // What was said before, for follow-up questions (not failed tries).
    const history = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev.filter((m) => !m.error), { id: `u${Date.now()}`, role: 'user', text: question }]);
    if (!presetId) setDraft('');
    ask({ question, presetId, history, lang });
  };

  // The question is already in the chat: only the failed answer goes.
  const retry = (failed) => {
    setMessages((prev) => prev.filter((m) => m.id !== failed.id));
    ask(failed.retry);
  };

  const openLink = (to) => {
    const path = appPath(to);
    if (path) router.push(path);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const pick = (p) => send({ presetId: p.id, text: p.question });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SellerPage
        scroll={false}
        action={(
          <SellerHeaderButton label={copy.newChat} onPress={newChat} style={styles.newChat}>
            <NotePencilIcon size={20} color={t.neutral[700]} />
          </SellerHeaderButton>
        )}
      >
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: composerHeight + 47 }]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!wantEnd.current) return;
            wantEnd.current = false;
            scrollRef.current?.scrollToEnd({ animated: messages.length > 0 && !still });
          }}
          accessibilityLabel="Chat with Ate Moormy"
        >
          <View style={styles.hero}>
            <Avatar size={56} style={styles.heroAvatar} />
            <Text style={styles.heroName}>Ate Moormy</Text>
            <Text style={styles.heroRole}>{copy.role}</Text>
            <Text style={styles.heroNote}>{copy.note}</Text>
            <LangSwitch lang={lang} onChange={chooseLang} disabled={busy} label={copy.language} />
          </View>

          {intro === false ? (
            <View style={styles.row}>
              <Avatar />
              <View style={[bubbleStyle, styles.rowBubble, styles.bubbleError]}>
                <Text style={[styles.text, styles.errorText]}>{copy.cantLoad}</Text>
                <RetryButton label={copy.retry} onPress={loadIntro} />
              </View>
            </View>
          ) : null}

          {intro ? (
            <View style={styles.row}>
              <Avatar />
              <View style={[bubbleStyle, styles.rowBubble]}>
                <ReplyText text={intro.greeting} style={styles.text} />
              </View>
            </View>
          ) : null}
          {intro && !messages.length ? (
            <View style={styles.suggest}>
              <Text style={styles.suggestLabel}>{UI[intro.lang]?.suggested || copy.suggested}</Text>
              <Chips list={intro.presets || []} disabled={busy} onPick={pick} />
            </View>
          ) : null}

          {messages.map((m) => {
            const self = m.role === 'user';
            return (
              <View key={m.id} style={[styles.row, self && styles.rowSelf]}>
                {!self ? <Avatar /> : null}
                <View style={[styles.message, self && styles.messageSelf]}>
                  <View style={[bubbleStyle, self && styles.bubbleSelf, m.error && styles.bubbleError]}>
                    {self
                      ? <Text style={[styles.text, styles.textSelf]}>{m.text}</Text>
                      : <ReplyText text={m.text} style={[styles.text, m.error && styles.errorText]} />}
                    {m.error && m.retry ? <RetryButton label={copy.retry} onPress={() => retry(m)} disabled={busy} /> : null}
                  </View>
                  {!self && m.links?.length > 0 ? <LinkPills links={m.links} onOpen={openLink} /> : null}
                  {m === lastAssistant && !busy && m.suggestions?.length > 0
                    ? <Chips list={m.suggestions} disabled={busy} onPick={pick} />
                    : null}
                </View>
              </View>
            );
          })}

          {busy ? (
            <View style={styles.row}>
              <Avatar />
              <TypingDots label={copy.typing} still={still} />
            </View>
          ) : null}
        </ScrollView>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send({ text: draft })}
          placeholder={copy.placeholder}
          canSend={!busy && Boolean(draft.trim())}
          disabled={intro === false}
          bottomInset={insets.bottom}
          onHeight={setComposerHeight}
        />
      </SellerPage>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // .scm-icon--bar: 6px before the ⋯
  newChat: { marginRight: 6 },

  // .sc-content's 4px top + .sa-scroll's 8px 16px on phones, 10px between rows.
  scroll: { gap: 10, paddingTop: 12, paddingHorizontal: 16 },

  hero: { alignItems: 'center', gap: 4, alignSelf: 'center', maxWidth: 340, marginTop: 4, marginBottom: 8 },
  heroAvatar: { marginBottom: 6 },
  heroName: { fontSize: 17, lineHeight: 27.2, color: t.neutral[900], textAlign: 'center', ...font(500) },
  heroRole: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], textAlign: 'center', ...font(400) },
  heroNote: { marginTop: 4, fontSize: 12, lineHeight: 17.4, color: t.neutral[500], textAlign: 'center', ...font(400) },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowSelf: { justifyContent: 'flex-end' },
  rowBubble: { flexShrink: 1, maxWidth: '82%' },
  message: { flexShrink: 1, gap: 8, minWidth: 0, maxWidth: '86%' },
  messageSelf: { alignItems: 'flex-end' },

  bubbleSelf: {
    backgroundColor: t.primary[600],
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 16,
  },
  bubbleError: { backgroundColor: t.danger[50] },
  text: { fontSize: 15, lineHeight: 22.5, color: t.neutral[900], ...font(400) },
  textSelf: { color: '#fff' },
  errorText: { color: t.danger[700] },

  suggest: { marginLeft: 40 },
  suggestLabel: { marginBottom: 8, fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(500) },
});
