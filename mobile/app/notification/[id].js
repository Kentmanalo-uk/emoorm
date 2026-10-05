import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { ArrowLeftIcon, BellIcon, InfoIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { notificationHref } from '../../src/lib/notificationLink';
import useAuthStore from '../../src/store/authStore';
import { font, t } from '../../src/theme';
import ScreenHeader from '../../src/components/ScreenHeader';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';

/*
 * A single notification, in full (web/src/pages/NotificationDetail.jsx at
 * /notifications/:id). Announcements are the reason it exists: the list clips
 * a long message and there is nothing behind it to open, so the notification
 * itself is the destination. On phones the title sits in the back bar.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }), without relying on Intl. */
function longDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${time}`;
}

const CARD_SHADOW = [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(149, 157, 165, 0.06)' }];

export default function NotificationDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [notification, setNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // The website keeps this page behind sign-in.
  useEffect(() => {
    if (!isAuthenticated) router.replace({ pathname: '/login', params: { redirect: pathname } });
  }, [isAuthenticated, pathname, router]);

  useEffect(() => {
    if (!isAuthenticated || !id) return undefined;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/notifications/${id}`);
        if (cancelled) return;
        const item = res.data;
        setNotification(item);
        // Opening it counts as reading it.
        if (item && !item.isRead) {
          apiClient.put(`/notifications/${id}/read`).catch(() => { /* not worth interrupting for */ });
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.message || 'This notification is no longer available.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, isAuthenticated]);

  // A notice that also points somewhere (a verification page, a store)
  // offers the jump rather than dead-ending here.
  const onwardKind = notification?.target?.kind;
  const onwardHref = onwardKind && onwardKind !== 'notification' && onwardKind !== 'admin-notification'
    ? notificationHref(notification)
    : null;

  const listHref = notification?.audience === 'SELLER' ? '/seller/notifications' : '/notifications';
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(listHref));

  // The bar's title is the page's h1 (the notification's title), as on the
  // website: none while it loads or when it is gone.
  const barTitle = !isLoading && !error ? notification?.title || '' : '';

  return (
    <View style={styles.screen}>
      <ScreenHeader title={barTitle} onBack={goBack} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <ArrowLeftIcon size={16} color={t.neutral[700]} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {isLoading ? (
          <View style={styles.loading} accessibilityLabel="Loading notification">
            <LoadingSkeleton height={72} borderRadius={8} />
            <LoadingSkeleton height={72} borderRadius={8} />
          </View>
        ) : error ? (
          <View style={styles.empty}>
            <BellIcon size={64} weight="fill" color={t.primary[200]} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle} accessibilityRole="header">Not available</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.replace(listHref)}
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnText}>Back to notifications</Text>
            </Pressable>
          </View>
        ) : notification ? (
          <View style={styles.card}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <InfoIcon size={20} color={t.neutral[500]} />
              </View>
              <View style={styles.headText}>
                <Text style={styles.meta}>{longDateTime(notification.createdAt)}</Text>
              </View>
            </View>

            <Text style={styles.body} selectable>{notification.message}</Text>

            {onwardHref ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(onwardHref)}
                style={({ pressed }) => [styles.btn, styles.btnStart, pressed && styles.btnPressed]}
              >
                <Text style={styles.btnText}>Open</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 24 },

  back: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginBottom: 14,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: t.neutral[0], boxShadow: CARD_SHADOW,
  },
  backPressed: { backgroundColor: t.neutral[50] },
  backText: { fontSize: 13, lineHeight: 15.6, color: t.neutral[700], ...font(500) },

  loading: { gap: 10 },

  card: { padding: 16, borderRadius: 10, backgroundColor: t.neutral[0], boxShadow: CARD_SHADOW },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 16 },
  icon: {
    width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
    backgroundColor: t.neutral[100],
  },
  headText: { flex: 1, minWidth: 0 },
  meta: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  body: { marginBottom: 18, fontSize: 15, lineHeight: 24.75, color: t.neutral[700], ...font(400) },

  empty: {
    alignItems: 'center', paddingTop: 36, paddingHorizontal: 20, paddingBottom: 40, borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { marginBottom: 8, fontSize: 16, lineHeight: 18.4, color: t.neutral[700], textAlign: 'center', ...font(500) },
  // 14px margin on the website, but the link sits inline in the next line box: 8 on screen.
  emptyText: { marginBottom: 8, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], textAlign: 'center', ...font(400) },

  btn: {
    justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 20, borderWidth: 1,
    borderColor: t.neutral[300], borderRadius: 10, backgroundColor: 'transparent',
  },
  btnStart: { alignSelf: 'flex-start' },
  btnPressed: { backgroundColor: t.neutral[100] },
  btnText: { fontSize: 14, lineHeight: 18, color: t.neutral[700], textAlign: 'center', ...font(400) },
});
