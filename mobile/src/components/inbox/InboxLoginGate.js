import { ScrollView, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  ArrowsClockwiseIcon, ChecksIcon, EnvelopeOpenIcon, FunnelIcon, MagnifyingGlassIcon, StorefrontIcon,
} from 'phosphor-react-native';
import { t } from '../../theme';
import EmptyState from '../EmptyState';
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
    <View style={styles.screen}>
      <InboxTopGap gap={12} />
      <InboxPageHead title={gate.heading} padLeft={16} padRight={8} toolGap={2}>
        <ShellBarButton label={`Search ${gate.heading.toLowerCase()}: log in first`} onPress={toLogin}>
          <MagnifyingGlassIcon size={19} color={t.neutral[700]} />
        </ShellBarButton>
        <ShellPageMenu label={`${gate.heading} options`} items={gate.menu.map((m) => ({ ...m, onPress: toLogin }))} />
      </InboxPageHead>
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.screen} contentContainerStyle={styles.content}>
      <EmptyState page art={gate.art} title={gate.title} text={gate.body} actions={[{ label: 'Log in', onPress: toLogin, wave: true }]} />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1 },
});
