import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { PaperPlaneTiltIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import { hasTriedMoormy, useMoormyChat } from './moormyChat';
import MoormyAvatar from './MoormyAvatar';
import { AiTag, GradientFill, MMY } from './InboxGradient';
import ConversationRow from './ConversationRow';

/*
 * Ate Moormy at the top of the buyer's Messages list
 * (web/src/components/moormy/MoormyEntry.jsx).
 *
 * Until the buyer first asks her something: an introduction with its own
 * question box (the greeting types itself in, the box suggests questions in
 * turn). Sending opens her chat with the question asked. After that she is a
 * chat row like the others, showing the last thing said.
 */

const EXAMPLES = [
  'How do I pay with GCash?',
  'Can I pick up my order?',
  'How do I return an item?',
  'Where is my order?',
  'Paano mag-cancel ng order?',
];

const native = Platform.OS !== 'web';

const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (live) setReduced(Boolean(v)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return reduced;
}

/** The greeting, typed in once. */
function useTyped(text, reduced) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reduced) { setCount(text.length); return undefined; }
    if (count >= text.length) return undefined;
    const id = setTimeout(() => setCount((n) => n + 1), count === 0 ? 450 : 22);
    return () => clearTimeout(id);
  }, [count, text.length, reduced]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

/** The blinking caret after the greeting while it types (.mmy-caret). */
function Caret() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 450);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={[styles.caret, { opacity: on ? 1 : 0 }]}>
      <GradientFill diagonal={false} />
    </View>
  );
}

/** The card's edge: pink and green drifting round it (.mmy-intro mmy-edge, 7s). */
function DriftingEdge({ width }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!width) return undefined;
    const loop = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [drift, width]);
  if (!width) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.edgeStrip, { width: width * 4, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 2] }) }] }]}
    >
      <GradientFill diagonal={false} colors={[MMY.pink, MMY.green, MMY.pink, MMY.green, MMY.pink]} />
    </Animated.View>
  );
}

function IntroCard({ firstName, onAsk }) {
  const reduced = useReducedMotion();
  const greeting = `Hi${firstName ? ` ${firstName}` : ''}! I'm your shopping helper. Ask me anything about buying on Emoorm.`;
  const { shown, done } = useTyped(greeting, reduced);
  const [draft, setDraft] = useState('');
  const [example, setExample] = useState(0);
  const [sending, setSending] = useState(false);
  const [width, setWidth] = useState(0);
  const rise = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: reduced ? 0 : 520, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native }).start();
  }, [rise, reduced]);

  // The box suggests a question at a time while it is empty.
  useEffect(() => {
    if (draft || reduced) return undefined;
    const id = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(id);
  }, [draft, reduced]);

  useEffect(() => {
    hint.setValue(0);
    Animated.timing(hint, { toValue: 1, duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native }).start();
  }, [example, hint]);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    Animated.timing(press, { toValue: 0.985, duration: 220, useNativeDriver: native }).start();
    // A beat for the send button's flourish, then her chat opens.
    setTimeout(() => {
      onAsk(text);
      setSending(false);
      setDraft('');
      press.setValue(1);
    }, reduced ? 0 : 260);
  };

  const canSend = Boolean(draft.trim()) && !sending;

  return (
    <Animated.View
      accessibilityLabel="Ate Moormy, your AI shopping helper"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.intro, {
        opacity: rise,
        transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: Animated.multiply(rise.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }), press) },
        ],
      }]}
    >
      <View style={styles.edgeClip}><DriftingEdge width={width} /></View>
      <View style={styles.introInner}>
        <GradientFill colors={['rgba(236, 72, 153, 0.06)', 'rgba(16, 185, 129, 0.06)']} radius={16.5} />
        <View style={styles.introHead}>
          <MoormyAvatar size={44} glow />
          <View style={styles.introText}>
            <View style={styles.introName}>
              <Text style={styles.introNameText}>Ate Moormy</Text>
              <AiTag />
            </View>
            <Text style={styles.greeting} accessibilityLabel={greeting}>
              {shown}
              {!done ? <Caret /> : null}
            </Text>
          </View>
        </View>
        <View style={styles.ask}>
          <View style={styles.askField}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={500}
              editable={!sending}
              returnKeyType="send"
              enterKeyHint="send"
              onSubmitEditing={submit}
              accessibilityLabel="Ask Ate Moormy"
              style={styles.askInput}
              underlineColorAndroid="transparent"
            />
            {!draft ? (
              <Animated.Text
                pointerEvents="none"
                numberOfLines={1}
                style={[styles.askHint, {
                  opacity: hint,
                  transform: [{ translateY: hint.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
                }]}
              >
                {EXAMPLES[example]}
              </Animated.Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send to Ate Moormy"
            disabled={!canSend}
            onPress={submit}
            style={({ pressed }) => [styles.askSend, !canSend && styles.askSendOff, canSend && styles.askSendOn, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <GradientFill radius={21} />
            <View><PaperPlaneTiltIcon size={18} weight="fill" color="#fff" /></View>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * userId, firstName: the signed-in buyer.
 * onOpen(question?): open her chat (asking the question, from the intro card).
 */
export default function MoormyEntry({ userId, firstName, onOpen }) {
  const chat = useMoormyChat(userId);
  if (!chat.loaded) return null;
  if (!hasTriedMoormy(chat)) return <IntroCard firstName={firstName} onAsk={(text) => onOpen(text)} />;

  const last = [...chat.messages].reverse().find((m) => !m.error);
  const preview = !last
    ? 'Ask me anything about shopping'
    : last.role === 'user' ? `You: ${last.text}` : String(last.text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ');

  return (
    <ConversationRow
      moormy
      avatar={<MoormyAvatar size={44} />}
      title="Ate Moormy"
      titleAfter={<AiTag />}
      time={last ? timeOf(chat.updatedAt) : ''}
      preview={preview}
      onPress={() => onOpen()}
    />
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 18,
    backgroundColor: t.neutral[0],
    boxShadow: '0px 6px 20px -12px rgba(236, 72, 153, 0.45)',
  },
  edgeClip: { ...StyleSheet.absoluteFillObject, borderRadius: 18, overflow: 'hidden' },
  edgeStrip: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  introInner: {
    // The website's 1.5px gradient border and 14/14/12 padding, as it lands
    // on screen (measured against the website at 2x).
    margin: 1.5,
    paddingTop: 13,
    paddingHorizontal: 13.5,
    paddingBottom: 12,
    borderRadius: 16.5,
    backgroundColor: t.neutral[0],
  },
  introHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  introText: { flex: 1, minWidth: 0 },
  introName: { flexDirection: 'row', alignItems: 'center' },
  introNameText: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  greeting: { minHeight: 39.15, marginTop: 3, fontSize: 13.5, lineHeight: 19.575, color: t.neutral[600], ...font(400) },
  caret: { width: 2, height: 14, marginLeft: 1, overflow: 'hidden', transform: [{ translateY: 2 }] },
  ask: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  askField: { flex: 1, minWidth: 0, justifyContent: 'center' },
  askInput: {
    height: 46,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 999,
    backgroundColor: t.neutral[0],
    color: t.neutral[900],
    fontSize: 14,
    ...font(400),
    outlineStyle: 'none',
  },
  askHint: { position: 'absolute', left: 17, right: 12, fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
  askSend: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  askSendOn: { boxShadow: '0px 4px 12px -4px rgba(236, 72, 153, 0.6)' },
  askSendOff: { opacity: 0.4 },
});
