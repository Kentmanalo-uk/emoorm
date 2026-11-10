import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PackageIcon } from '../../../lib/icons';
import EmptyState from '../../EmptyState';
import { font, t, themed } from '../../../theme';
import { AnCard, Thumb } from './parts';
import { num } from './format';
import {
  CardNote, RowButton, ShowMore, Tag, dayLabel, insightStyles as is, plural, units,
} from './InsightsParts';

/*
 * Insights › Stock risk (GET /ml/insights/mine → stock, module 06): how many
 * products are out or close to running out, then each one, the most urgent
 * first: what is left, the days that lasts at the expected pace, the day it
 * would run out and a restock that covers about 30 days. Restock opens My
 * products, as Home's "Running low" does. Products with no recent sales are
 * only counted. It reads stock; it never changes it.
 */

const FIRST = 5;

const RISK = {
  OUT: { label: 'Out of stock', tone: 'danger' },
  HIGH: { label: 'High risk', tone: 'danger' },
  MEDIUM: { label: 'Medium risk', tone: 'warning' },
  LOW: { label: 'Low risk', tone: 'neutral' },
};

export default function InsightsStock({ part }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!part || part.status === 'off' || part.status === 'unavailable') return null;

  if (part.status !== 'ok') {
    return (
      <AnCard title="Stock risk">
        <EmptyState
          compact
          art="healthy"
          title="No stock outlook yet"
          text="It is worked out once a day for products that keep their own stock. Check back tomorrow."
        />
      </AnCard>
    );
  }

  const c = part.counts || {};
  const rows = (part.products || []).filter((p) => p.risk !== 'NO_SALES');
  const shown = open ? rows : rows.slice(0, FIRST);
  const restock = () => router.push('/seller/products');

  return (
    <AnCard title="Stock risk" sub="If sales keep their pace">
      <View style={styles.counts}>
        <Count value={c.out} label="Out" tone={t.danger[700]} />
        <Count value={c.high} label="High" tone={t.danger[700]} />
        <Count value={c.medium} label="Medium" tone={t.warning[700]} />
        <Count value={c.low} label="Low" tone={t.neutral[900]} />
      </View>
      <CardNote>
        {'Days left use each product\'s forecast, else its last 4 weeks of sales.'}
        {Number(c.noSales) > 0 ? ` ${num(c.noSales)} more ${plural(c.noSales, 'product has', 'products have')} not sold lately, so no run-out day.` : ''}
      </CardNote>
      <View style={is.divider} />

      {rows.length ? shown.map((p, i) => {
        const risk = RISK[p.risk] || RISK.LOW;
        const lines = p.risk === 'OUT'
          ? `None left${Number(p.ratePerDay) > 0 ? ` · sells about ${units(p.ratePerDay)} a day` : ''}`
          : `${num(p.stock)} left · about ${units(p.daysLeft)} ${plural(p.daysLeft, 'day')}`;
        return (
          <View key={p.id} style={[is.row, i === shown.length - 1 && rows.length <= FIRST && is.rowLast]}>
            <Thumb image={p.image} />
            <View style={is.body}>
              <View style={is.nameLine}>
                <Text style={is.name} numberOfLines={1}>{p.name}</Text>
              </View>
              <Text style={is.sub}>{lines}</Text>
              {p.risk !== 'OUT' && p.runsOutOn ? <Text style={is.sub}>{`Runs out around ${dayLabel(p.runsOutOn)}`}</Text> : null}
              {p.restock > 0 ? (
                <Text style={is.sub}>
                  Restock about <Text style={is.strong}>{num(p.restock)}</Text> to last 30 days
                </Text>
              ) : null}
              {p.restock > 0 ? (
                <RowButton label="Restock" Icon={PackageIcon} onPress={restock} accessibilityLabel={`Restock ${p.name}`} />
              ) : null}
            </View>
            <Tag tone={risk.tone}>{risk.label}</Tag>
          </View>
        );
      }) : (
        <EmptyState compact art="healthy" title="Nothing at risk" text="Products with recent sales have enough stock for now." />
      )}
      {rows.length > FIRST ? <ShowMore open={open} total={rows.length} onPress={() => setOpen((o) => !o)} /> : null}
    </AnCard>
  );
}

function Count({ value, label, tone }) {
  const n = Number(value || 0);
  return (
    <View style={styles.count} accessibilityLabel={`${label}: ${n}`}>
      <Text style={[styles.countValue, n > 0 && { color: tone }]}>{num(n)}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // Home's "Needs your action" numbers, inside the card.
  counts: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 10 },
  count: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 },
  countValue: { fontSize: 20, lineHeight: 26, color: t.neutral[400], fontVariant: ['tabular-nums'], ...font(700) },
  countLabel: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
}));
