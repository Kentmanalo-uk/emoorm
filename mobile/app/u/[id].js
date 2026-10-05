import { useCallback, useEffect, useState } from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarBlankIcon, ChatCircleIcon, MapPinIcon, PencilSimpleIcon, SealCheckIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import PublicHeader from '../../src/components/public/PublicHeader';
import { resolveImg } from '../../src/lib/media';
import toast from '../../src/lib/toast';
import { font, t, text } from '../../src/theme';

/*
 * web/src/pages/PublicProfile.jsx + PublicProfile.css at phone width.
 * The public face of a buyer-only account. A seller account has no page of
 * its own: its public face is its shop, so it goes to /store/:slug.
 * The name is not a page title on the website (NOT_A_TITLE), so the bar
 * stays empty; the not-found / error heading is moved up into the bar.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  return (
    <View style={styles.avatar}>
      {uri && !failed
        ? <Image source={{ uri }} style={styles.avatarImg} onError={() => setFailed(true)} accessibilityLabel={name} />
        : <Text style={styles.avatarText}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

function PpButton({ label, Icon, onPress, disabled, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, disabled && styles.btnDisabled, style]}
    >
      {Icon ? <Icon size={16} color={t.neutral[0]} /> : null}
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export default function PublicProfile() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | missing | error
  const [openingChat, setOpeningChat] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    // As the website's query: no retry for a 404, two more tries otherwise.
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await apiClient.get(`/profiles/${id}`);
        setProfile(res.data || null);
        setStatus('ready');
        return;
      } catch (err) {
        if (err?.status === 404) { setStatus('missing'); return; }
        if (attempt >= 2) { setStatus('error'); return; }
      }
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const messageBuyer = async () => {
    setOpeningChat(true);
    try {
      const res = await apiClient.post('/messages/conversations', { buyerId: id });
      router.push(`/seller/messages?c=${res.data.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not open the conversation');
    } finally {
      setOpeningChat(false);
    }
  };

  // A seller's public profile is their shop.
  if (status === 'ready' && profile?.isSeller && profile.store?.slug) {
    return <Redirect href={`/store/${profile.store.slug}`} />;
  }

  const shell = (title, children) => (
    <View style={styles.screen}>
      <PublicHeader title={title} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* The website's grey .pp is at least the viewport less 200px tall. */}
        <View style={[styles.pp, { minHeight: Math.max(0, height - 200) }]}>{children}</View>
      </ScrollView>
    </View>
  );

  if (status === 'loading') {
    return shell('', <View style={styles.card}><Text style={styles.muted}>Loading profile…</Text></View>);
  }

  if (status !== 'ready' || !profile) {
    const missing = status === 'missing' || !profile;
    return shell(
      missing ? 'Profile not found' : 'Could not load this profile',
      <View style={[styles.card, styles.empty]}>
        <Text style={styles.emptyText}>{missing ? 'This account may have been closed.' : 'Please try again in a moment.'}</Text>
        <PpButton label="Back to home" onPress={() => router.push('/')} />
      </View>,
    );
  }

  const place = [profile.municipality?.name, profile.province].filter(Boolean).join(', ');

  return shell(
    '',
    <>
      {profile.isOwnProfile ? (
        <View style={styles.ownNote}>
          <Text style={styles.ownText}>This is how your profile looks to sellers and other buyers.</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings')} style={styles.ownLink}>
            <PencilSimpleIcon size={14} color={t.primary[700]} />
            <Text style={styles.ownLinkText}>Edit profile</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.card, styles.head]}>
        <Avatar src={profile.profilePhoto} name={profile.fullName} />

        <View style={styles.nameRow}>
          <Text style={styles.name} accessibilityRole="header">{profile.fullName}</Text>
          {profile.identityVerified ? (
            <View style={styles.verified} accessibilityLabel="Identity verified with a government ID">
              <SealCheckIcon size={18} weight="fill" color={t.primary[700]} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : null}
        </View>

        {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}

        <View style={styles.meta}>
          {place ? (
            <View style={styles.metaRow}>
              <MapPinIcon size={14} color={text.muted} />
              <Text style={styles.metaText}>{place}</Text>
            </View>
          ) : null}
          {profile.memberSince ? (
            <View style={styles.metaRow}>
              <CalendarBlankIcon size={14} color={text.muted} />
              <Text style={styles.metaText}>Member since {monthYear(profile.memberSince)}</Text>
            </View>
          ) : null}
        </View>

        {profile.canChat ? (
          <PpButton
            label={openingChat ? 'Opening…' : 'Chat'}
            Icon={ChatCircleIcon}
            onPress={messageBuyer}
            disabled={openingChat}
            style={styles.chat}
          />
        ) : null}
      </View>
    </>,
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1, backgroundColor: t.neutral[0] },
  scrollContent: { flexGrow: 1 },
  pp: { paddingTop: 16, paddingBottom: 60, paddingHorizontal: 12, backgroundColor: t.neutral[100] },

  card: { backgroundColor: t.neutral[0], borderRadius: 12, padding: 20 },
  muted: { fontSize: 14, lineHeight: 22.4, color: text.muted, ...font(400) },

  ownNote: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 12,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: t.primary[50],
  },
  ownText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[800], ...font(400) },
  ownLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownLinkText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(500) },

  head: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[50],
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 28, lineHeight: 44.8, color: t.primary[700], ...font(500) },

  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  name: { fontSize: 18, lineHeight: 22.5, color: t.neutral[900], textAlign: 'center', ...font(500) },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: t.primary[50],
  },
  verifiedText: { fontSize: 13, lineHeight: 20.8, color: t.primary[700], ...font(500) },
  username: { marginTop: 4, fontSize: 14, lineHeight: 22.4, color: text.muted, textAlign: 'center', ...font(500) },

  meta: { alignItems: 'center', gap: 4, marginTop: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13.5, lineHeight: 21.6, color: text.muted, ...font(400) },

  chat: { alignSelf: 'stretch', marginTop: 18, minHeight: 44 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.primary[600],
    backgroundColor: t.primary[600],
  },
  btnPressed: { backgroundColor: t.primary[700], borderColor: t.primary[700] },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[0], ...font(500) },

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { marginBottom: 16, fontSize: 15, lineHeight: 24, color: text.muted, textAlign: 'center', ...font(400) },
});
