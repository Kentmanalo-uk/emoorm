import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  ArrowsClockwiseIcon, ChecksIcon, EnvelopeOpenIcon, FunnelIcon, MagnifyingGlassIcon, StorefrontIcon,
} from 'phosphor-react-native';
import { font, t } from '../../theme';
import EmptyArt from '../EmptyArt';
import ShellBarButton from '../ShellBarButton';
import ShellPageMenu from '../ShellPageMenu';
import InboxPageHead, { InboxTopGap } from './InboxPageHead';

/*
 * What a signed-out visitor sees on the Messages and Notifications tabs
 * (web/src/components/LoginGate.jsx): the tab's title bar with its tools
 * (search leads to Log in, the ⋯ menu's choices too), then a picture, a
 * line of text and a Log in button. The tab bar stays.
 */
const GATES = {
  messages: {
    heading: 'Messages',
    title: 'No messages yet',
    body: 'Log in to chat with sellers about their products.',
    art: 'messages',
    menu: [
      { key: 'read', Icon: EnvelopeOpenIcon, label: 'Mark all as read' },
      { key: 'unread', Icon: FunnelIcon, label: 'Show unread only' },
      { key: 'refresh', Icon: ArrowsClockwiseIcon, label: 'Refresh' },
    ],
  },
  notifications: {
    heading: 'Notifications',
    title: 'No notifications yet',
    body: 'Log in to follow your orders and hear from the shops you like.',
    art: 'notifications',
    menu: [
      { key: 'read', Icon: ChecksIcon, label: 'Mark all as read' },
      { key: 'shops', Icon: StorefrontIcon, label: 'Manage shop alerts' },
    ],
  },
};

export default function InboxLoginGate({ page }) {
  const router = useRouter();
  const pathname = usePathname();
  const gate = GATES[page];
  const toLogin = () => router.push({ pathname: '/login', params: { redirect: pathname } });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} stickyHeaderIndices={[1]}>
      <InboxTopGap gap={12} />
      <InboxPageHead title={gate.heading} padLeft={16} padRight={8} toolGap={2}>
        <ShellBarButton label={`Search ${gate.heading.toLowerCase()}: log in first`} onPress={toLogin}>
          <MagnifyingGlassIcon size={19} color={t.neutral[700]} />
        </ShellBarButton>
        <ShellPageMenu label={`${gate.heading} options`} items={gate.menu.map((m) => ({ ...m, onPress: toLogin }))} />
      </InboxPageHead>
      <View style={styles.gate}>
        <EmptyArt name={gate.art} size={112} style={styles.art} />
        <Text style={styles.title}>{gate.title}</Text>
        <Text style={styles.body}>{gate.body}</Text>
        <Pressable accessibilityRole="link" onPress={toLogin} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
          <Text style={styles.btnText}>Log in</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 34, paddingHorizontal: 24, paddingBottom: 64 },
  art: { marginBottom: 18 },
  title: { marginBottom: 6, fontSize: 18, lineHeight: 21.6, color: t.neutral[900], textAlign: 'center', ...font(500) },
  body: { maxWidth: 290, marginBottom: 20, fontSize: 14, lineHeight: 21, color: t.neutral[500], textAlign: 'center', ...font(400) },
  btn: {
    minWidth: 140, height: 42, paddingHorizontal: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  btnPressed: { backgroundColor: t.primary[700] },
  btnText: { fontSize: 15, lineHeight: 18, color: '#fff', ...font(500) },
});
