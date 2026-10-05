import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircleIcon, ClockIcon, PackageIcon, StorefrontIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import { ProfileEmpty } from '../src/components/profile/ProfileUI';
import { errorText, shortDate } from '../src/components/profile/profileLib';
import { font, t } from '../src/theme';

/** Report statuses, with the wording a reporter (not an admin) needs. */
const STATUS_META = {
  PENDING: { label: 'Pending review', bg: t.warning[100], color: t.warning[800] },
  UNDER_REVIEW: { label: 'Under review', bg: t.primary[50], color: t.primary[700] },
  RESOLVED: { label: 'Resolved', bg: t.success[100], color: t.success[800] },
  DISMISSED: { label: 'Dismissed', bg: t.neutral[100], color: t.neutral[600] },
};

/** What the report was filed against, as a link when there is one to give. */
function ReportTarget({ report, onOpen }) {
  let Icon = PackageIcon;
  let name;
  let to = null;
  if (report.type === 'PRODUCT') {
    name = report.product?.name || 'A product';
    if (report.product?.slug) to = `/product/${report.product.slug}`;
  } else {
    Icon = StorefrontIcon;
    const seller = report.reportedSeller;
    name = seller?.store?.name || seller?.fullName || seller?.username || 'A seller';
    if (seller?.store?.slug) to = `/store/${seller.store.slug}`;
  }
  return (
    <View style={styles.target}>
      <Icon size={14} weight="fill" color={t.neutral[500]} />
      {to ? (
        <Pressable accessibilityRole="link" onPress={() => onOpen(to)} style={{ flexShrink: 1 }}>
          {({ pressed }) => <Text style={[styles.targetText, styles.targetLink, pressed && { textDecorationLine: 'underline' }]} numberOfLines={1}>{name}</Text>}
        </Pressable>
      ) : <Text style={styles.targetText} numberOfLines={1}>{name}</Text>}
    </View>
  );
}

/**
 * /profile/reports (web/src/pages/ProfileReports.jsx): the products and
 * sellers the person reported, and what the municipal team decided.
 */
export default function ProfileReports() {
  const router = useRouter();
  const { id: highlightId } = useLocalSearchParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiClient.get('/reports/my/reports', { params: { pageSize: 50 } });
      setReports(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(errorText(err, 'Could not load your reports'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Reports" backTo="/profile" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Products and sellers you reported, and what your municipal team decided.</Text>

        <View style={styles.section}>
          {loading ? (
            <Text style={styles.muted}>Loading your reports…</Text>
          ) : error ? (
            <ProfileEmpty style={styles.empty} title="Something went wrong" hint={error} action="Try again" onAction={() => { setLoading(true); load(); }} />
          ) : reports.length === 0 ? (
            <ProfileEmpty
              style={styles.empty}
              art="reports"
              title="You have not reported anything"
              hint="If a listing or a seller looks wrong, use Report on the product or store page. Your report goes to the municipal team that covers that seller, and it shows up here."
              action="Browse products"
              onAction={() => router.push('/products')}
            />
          ) : (
            <View style={styles.list}>
              {reports.map((report) => {
                const meta = STATUS_META[report.status] || { label: report.status, bg: t.warning[100], color: t.warning[800] };
                const settled = report.status === 'RESOLVED' || report.status === 'DISMISSED';
                return (
                  <View key={report.id} style={[styles.card, report.id === highlightId && styles.cardTarget]}>
                    <View style={styles.top}>
                      <ReportTarget report={report} onOpen={(to) => router.push(to)} />
                      <Text style={[styles.chip, { backgroundColor: meta.bg, color: meta.color }]}>{String(meta.label).toUpperCase()}</Text>
                    </View>

                    <Text style={styles.reason}>{report.reason}</Text>
                    {report.description ? <Text style={styles.desc}>{report.description}</Text> : null}

                    <View style={styles.meta}>
                      <View style={styles.metaItem}>
                        <ClockIcon size={13} color={t.neutral[500]} />
                        <Text style={styles.metaText}>Filed {shortDate(report.createdAt)}</Text>
                      </View>
                      {report.municipality?.name ? <Text style={styles.metaText}>{report.municipality.name}</Text> : null}
                      {settled && report.resolvedAt ? <Text style={styles.metaText}>{meta.label} {shortDate(report.resolvedAt)}</Text> : null}
                    </View>

                    {settled && report.resolutionNotes ? (
                      <View style={styles.resolution}>
                        <CheckCircleIcon size={14} weight="fill" color={t.success[600]} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.resolutionLabel}>What the team decided</Text>
                          <Text style={styles.resolutionText}>{report.resolutionNotes}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  subtitle: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },

  section: { marginHorizontal: -12, padding: 14, backgroundColor: t.neutral[0] },
  empty: { marginHorizontal: -12 },
  muted: { fontSize: 15, lineHeight: 24, color: t.neutral[500], ...font(400) },
  list: { gap: 12 },
  card: {
    gap: 8, padding: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.04)',
  },
  cardTarget: { borderColor: t.primary[600], boxShadow: `0px 0px 0px 3px ${t.primary[50]}` },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  targetText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[900], ...font(500) },
  targetLink: { color: t.primary[700] },
  chip: {
    flexShrink: 0, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden',
    fontSize: 11.5, lineHeight: 18.4, letterSpacing: 0.115, ...font(500),
  },
  reason: { fontSize: 14, lineHeight: 21, color: t.neutral[800], ...font(400) },
  desc: { fontSize: 13.5, lineHeight: 20.25, color: t.neutral[600], ...font(400) },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  resolution: {
    flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200],
    borderRadius: 10, backgroundColor: t.neutral[50],
  },
  resolutionLabel: { marginBottom: 2, fontSize: 12, lineHeight: 19.2, color: t.neutral[700], ...font(500) },
  resolutionText: { fontSize: 13.5, lineHeight: 20.25, color: t.neutral[600], ...font(400) },
});
