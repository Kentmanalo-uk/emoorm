import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRightIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { isOpen } from '../../lib/availability';
import useAuthStore from '../../store/authStore';
import { font, t, text } from '../../theme';
import TodayCard from '../TodayCard';

/**
 * Home's "Available Today" (web/src/components/today/TodayRail.jsx): what
 * local shops sell fresh for a limited time, near the buyer's town first
 * (all towns when there is nothing near). Hidden when nothing is on, or when
 * the feature is switched off. Phones: a plain title, an arrow to the full
 * list, one swipeable row of 150-wide cards.
 */
export default function HomeTodayRail({ refreshKey = 0 }) {
  const router = useRouter();
  const townId = useAuthStore((s) => s.user?.municipalityId) || null;
  const [items, setItems] = useState(null);
  // Nothing near: all towns are shown, and "See all" opens all towns too.
  const [allTowns, setAllTowns] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const near = townId ? (await apiClient.get('/today', { params: { near: townId, pageSize: 12 } })).data : null;
        let list = near?.items || [];
        let wide = !townId;
        if (!list.length && near?.enabled !== false) {
          list = (await apiClient.get('/today', { params: { pageSize: 12 } })).data?.items || [];
          wide = true;
        }
        if (live) { setItems(list); setAllTowns(wide); }
      } catch {
        if (live) setItems([]);
      }
    };
    load();
    return () => { live = false; };
  }, [townId, refreshKey]);

  // A window can end while the page is open: only what still takes orders.
  const shown = (items || []).filter((w) => isOpen(w));
  if (!shown.length) return null;

  const seeAll = () => router.push(allTowns && townId ? { pathname: '/today', params: { town: 'all' } } : '/today');

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Available Today</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="See all available today"
          onPress={seeAll}
          hitSlop={6}
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        >
          <ArrowRightIcon size={19} color={t.primary[600]} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {shown.map((item) => <TodayCard key={item.id} item={item} style={styles.card} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // .today-rail on phones: on the page background, 16px top, 4px bottom.
  section: { paddingTop: 16, paddingBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingLeft: 16, paddingRight: 16 },
  title: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 22.5, ...font(500), color: text.strong },
  arrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  arrowPressed: { transform: [{ translateX: 2 }] },
  row: { gap: 8, paddingLeft: 16, paddingRight: 16 },
  card: { width: 150 },
});
