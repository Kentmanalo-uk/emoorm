import { StyleSheet, Text, View } from 'react-native';
import EmptyState from '../../EmptyState';
import { font, t, themed } from '../../../theme';
import { AnCard } from './parts';
import { num } from './format';
import {
  CardNote, insightStyles as is, monthLabel, plural,
} from './InsightsParts';

/*
 * Insights › What buyers say (GET /ml/insights/mine → reviews, module 07):
 * the shop's commented reviews read for their feeling, as a split (positive,
 * mixed, neutral, negative), what buyers like, what they mention problems with
 * (with one or two short excerpts) and the last 6 months. A shop under
 * `needs` commented reviews gets no summary. Ratings and reviews are only
 * read, never changed.
 */

export const ASPECT_LABELS = {
  taste: 'Taste',
  freshness: 'Freshness',
  packaging: 'Packaging',
  delivery: 'Delivery',
  price: 'Price',
  quality: 'Quality',
  service: 'Seller service',
  size: 'Size and amount',
};

const aspectLabel = (key) => ASPECT_LABELS[key] || String(key || '').replace(/^\w/, (c) => c.toUpperCase());

/** The four feelings, in the order the split shows them. */
const FEELINGS = () => [
  { key: 'positive', label: 'Positive', color: t.primary[600] },
  { key: 'mixed', label: 'Mixed', color: t.warning[500] },
  { key: 'neutral', label: 'Neutral', color: t.neutral[300] },
  { key: 'negative', label: 'Negative', color: t.danger[500] },
];

/** An excerpt as a sentence: the engine keeps them lower case. */
const sentence = (text) => {
  const s = String(text || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};

/** Whole percents that add up to 100 (largest remainder), by key. */
const percents = (counts, keys) => {
  const total = keys.reduce((s, k) => s + Number(counts[k] || 0), 0);
  if (!total) return Object.fromEntries(keys.map((k) => [k, 0]));
  const raw = keys.map((k) => ({ k, v: (Number(counts[k] || 0) / total) * 100 }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.v)]));
  let left = 100 - raw.reduce((s, r) => s + Math.floor(r.v), 0);
  [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v))).forEach((r) => {
    if (left > 0 && r.v > 0) { out[r.k] += 1; left -= 1; }
  });
  return out;
};

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * The 6 months up to this one (or up to the newest month given), with the
 * months that had no reviews as empty columns: the engine lists only the
 * months that had some. Older months than that are shown as given.
 */
const sixMonths = (given) => {
  const list = Array.isArray(given) ? given.filter((m) => m && /^\d{4}-\d{2}/.test(m.month)) : [];
  if (!list.length) return [];
  const newest = list.reduce((a, m) => (m.month > a ? m.month : a), ym(new Date()));
  const [y, mo] = newest.split('-').map(Number);
  const keys = Array.from({ length: 6 }, (_, i) => ym(new Date(y, mo - 6 + i, 1)));
  const byMonth = Object.fromEntries(list.map((m) => [m.month.slice(0, 7), m]));
  if (!keys.some((k) => byMonth[k])) return list.slice(-6);
  return keys.map((k) => byMonth[k] || { month: k });
};

export default function InsightsReviews({ part }) {
  if (!part || part.status === 'off' || part.status === 'unavailable') return null;

  if (part.status !== 'ok') {
    const needs = typeof part.needs === 'number' ? part.needs : 5;
    return (
      <AnCard title="What buyers say">
        <EmptyState
          compact
          art="reviews"
          title="Not enough reviews yet"
          text={`Shows once ${needs} reviews with comments are in.`}
        />
      </AnCard>
    );
  }

  const feelings = FEELINGS();
  const counts = part.counts || {};
  const shares = percents(counts, feelings.map((f) => f.key));
  const praise = Array.isArray(part.praise) ? part.praise.filter((p) => Number(p.count) > 0) : [];
  const complaints = Array.isArray(part.complaints) ? part.complaints.filter((c) => Number(c.count) > 0) : [];
  const months = sixMonths(part.months);
  const pct = (key) => shares[key] || 0;

  return (
    <AnCard
      title="What buyers say"
      sub={`From ${num(part.reviews)} ${plural(part.reviews, 'review')} with comments`}
    >
      {/* The split: one bar in four colours, then each with its count. */}
      <View style={styles.split}>
        <View
          style={styles.stack}
          accessible
          accessibilityLabel={feelings.map((f) => `${f.label} ${pct(f.key)}%`).join(', ')}
        >
          {feelings.map((f) => {
            const n = Number(counts[f.key] || 0);
            return n > 0 ? <View key={f.key} style={{ flex: n, backgroundColor: f.color }} /> : null;
          })}
        </View>
        <View style={styles.legend}>
          {feelings.map((f) => (
            <View key={f.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: f.color }]} />
              <Text style={styles.legendText}>
                {f.label}
                <Text style={styles.legendValue}>{`  ${num(counts[f.key] || 0)}`}</Text>
                <Text style={styles.legendPct}>{` · ${pct(f.key)}%`}</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={is.divider} />
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Buyers like</Text>
        {praise.length ? (
          <View style={styles.chips}>
            {praise.map((p) => (
              <View
                key={p.aspect}
                style={styles.chip}
                accessible
                accessibilityLabel={`${aspectLabel(p.aspect)}: ${p.count} ${plural(p.count, 'review')}`}
              >
                <Text style={styles.chipText}>{aspectLabel(p.aspect)}</Text>
                <Text style={styles.chipCount}>{num(p.count)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={is.sub}>Nothing stands out yet.</Text>
        )}
      </View>

      <View style={is.divider} />
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Buyers mention problems with</Text>
        {complaints.length ? (
          <View style={styles.problems}>
            {complaints.map((c) => (
              <View key={c.aspect} style={styles.problem}>
                <View style={is.nameLine}>
                  <Text style={is.name}>{aspectLabel(c.aspect)}</Text>
                  <Text style={styles.problemCount}>{`${num(c.count)} ${plural(c.count, 'review')}`}</Text>
                </View>
                {(Array.isArray(c.examples) ? c.examples : []).slice(0, 2).map((ex, i) => (
                  <Text key={`${c.aspect}-${i}`} style={styles.quote} numberOfLines={2}>
                    {`“${sentence(ex)}”`}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <Text style={is.sub}>No problems named in your reviews.</Text>
        )}
      </View>

      {months.length ? (
        <>
          <View style={is.divider} />
          <Months months={months} feelings={feelings} />
        </>
      ) : null}
      <CardNote>Read from the words of each review, so it can miss a joke or a mix of languages. Reviews and ratings are never changed.</CardNote>
    </AnCard>
  );
}

const BAR_H = 44;

/** One small stacked column a month: how many reviews and how they felt. */
function Months({ months, feelings }) {
  const totals = months.map((m) => feelings.reduce((s, f) => s + Number(m[f.key] || 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <View style={styles.months}>
      <Text style={styles.blockTitle}>Last 6 months</Text>
      <View style={styles.monthBars}>
        {months.map((m, i) => {
          const n = totals[i];
          return (
            <View
              key={m.month}
              style={styles.month}
              accessible
              accessibilityLabel={`${monthLabel(m.month)}: ${n} ${plural(n, 'review')}, ${feelings.map((f) => `${Number(m[f.key] || 0)} ${f.label.toLowerCase()}`).join(', ')}`}
            >
              <Text style={styles.monthValue}>{n > 0 ? num(n) : ''}</Text>
              <View style={[styles.column, { height: n > 0 ? Math.max(4, (n / max) * BAR_H) : 2 }, n > 0 ? null : styles.columnEmpty]}>
                {/* Good at the bottom, bad on top (column-reverse). */}
                {feelings.map((f) => {
                  const v = Number(m[f.key] || 0);
                  return v > 0 ? <View key={f.key} style={{ flex: v, backgroundColor: f.color }} /> : null;
                })}
              </View>
              <Text style={styles.monthLabel}>{monthLabel(m.month)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  split: { gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  stack: {
    flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, backgroundColor: t.neutral[100],
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  legendItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12.5, lineHeight: 17, color: t.neutral[700], ...font(400) },
  legendValue: { color: t.neutral[900], fontVariant: ['tabular-nums'], ...font(600) },
  legendPct: { color: t.neutral[500], fontVariant: ['tabular-nums'], ...font(400) },

  block: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  blockTitle: { fontSize: 12.5, lineHeight: 17, color: t.neutral[700], ...font(600) },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 10, paddingRight: 8,
    borderRadius: 999, backgroundColor: t.primary[50],
  },
  chipText: { fontSize: 12.5, lineHeight: 17, color: t.primary[700], ...font(500) },
  chipCount: { fontSize: 11.5, lineHeight: 15, color: t.primary[600], fontVariant: ['tabular-nums'], ...font(600) },

  problems: { gap: 12 },
  problem: { gap: 4 },
  problemCount: {
    flexShrink: 0, paddingVertical: 1, paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden',
    fontSize: 11, lineHeight: 15, color: t.danger[700], backgroundColor: t.danger[50], ...font(600),
  },
  quote: {
    paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: t.neutral[200],
    fontSize: 12.5, lineHeight: 18, color: t.neutral[600], ...font(400),
  },

  months: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  monthBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  month: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  monthValue: { fontSize: 10, lineHeight: 12, color: t.neutral[600], fontVariant: ['tabular-nums'], ...font(500) },
  column: {
    width: 16, flexDirection: 'column-reverse', gap: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: 'hidden',
  },
  columnEmpty: { backgroundColor: t.neutral[150] },
  monthLabel: { fontSize: 11, lineHeight: 12, color: t.neutral[500], ...font(400) },
}));
