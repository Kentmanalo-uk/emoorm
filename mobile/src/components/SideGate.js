import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowsLeftRightIcon, StorefrontIcon, UserIcon } from '../lib/icons';
import { t, themed } from '../theme';
import EmptyState from './EmptyState';
import { startAccountSwitch } from './RoleSwitchOverlay';

const COPY = {
  shop: {
    Icon: StorefrontIcon,
    title: 'This is in your shop',
    text: "You're on your buyer account. Switch to your shop to open this.",
    go: 'Switch to my shop',
    stay: 'Stay on my buyer account',
    target: 'seller',
    home: '/',
  },
  personal: {
    Icon: UserIcon,
    title: 'This is in your buyer account',
    text: "You're in your shop. Switch to your buyer account to open this.",
    go: 'Switch to my buyer account',
    stay: 'Stay in my shop',
    target: 'personal',
    home: '/seller',
  },
};

/**
 * Stands in for a page on the side of the app this account is not on
 * (store/sideStore), reached by a notification or a link: nobody crosses over
 * without saying so. Switching keeps the page that was asked for; staying
 * goes back to where they were.
 *
 * side: the side the page belongs to, 'shop' or 'personal'.
 */
export default function SideGate({ side }) {
  const router = useRouter();
  const {
    Icon, title, text, go, stay, target, home,
  } = COPY[side];
  const leave = () => (router.canGoBack() ? router.back() : router.replace(home));
  return (
    <View style={styles.screen}>
      <EmptyState
        page
        icon={Icon}
        title={title}
        text={text}
        actions={[
          { label: go, onPress: () => startAccountSwitch(target, null), icon: ArrowsLeftRightIcon },
          { label: stay, onPress: leave, variant: 'outline' },
        ]}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: t.neutral[0] },
}));
