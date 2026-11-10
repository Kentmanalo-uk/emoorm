import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TrendDownIcon, TrendUpIcon } from '../../../lib/icons';
import EmptyState from '../../EmptyState';
import { font, t, themed } from '../../../theme';
import { AnCard, Thumb } from './parts';
import { TrendLine } from './charts';
import { num, peso } from './format';
import {
  CardNote, ShowMore, Tag, insightStyles as is, plural, units,
} from './InsightsParts';

/*
 * Insights › Sales forecast (GET /ml/insights/mine → forecast, module 02):
 * what the shop can expect to sell in the next 7 and 30 days, in pesos at
 * today's prices with the likely range (80%), then each product's next week
 * with its last weeks as a small line and how many to prepare. Products with
 * under 10 weeks behind them are an early estimate. Hidden while off.
 */

const FIRST = 5;

export default function InsightsForecast({ part }) {
  const [open, setOpen] = useState(false);
  if (!part || part.status === 'off' || part.status === 'unavailable') return null;

  if (part.status !== 'ok') {
    const weeks = part.needs?.weeks ?? 6;
    const need = part.needs?.units ?? 6;
    return (
      <AnCard title="Sales forecast">
        <EmptyState
          compact
          art="analytics"
          title="Not enough sales yet"
          text={`A forecast starts once a product has sold for ${weeks} weeks and at least ${need} have been ordered.`}
        />
      </AnCard>
    );
  }

  const products = part.products || [];
  const shown = open ? products : products.slice(0, FIRST);
  const rising = part.rising || [];
  const falling = part.falling || [];
  const without = Number(part.withoutForecast || 0);

  return (
    <AnCard title="Sales forecast" sub="Estimates, not promises">
      <View style={is.figures}>
        <Figure label="Next 7 days" range={part.sales7} />
        <Figure label="Next 30 days" range={part.sales30} />
      </View>
      <CardNote>
        At today's prices, if sales keep to their usual pattern. The likely range covers about 8 weeks in 10; a slow or busy week can land outside it.
      </CardNote>
      <View style={is.divider} />

      {shown.map((p, i) => (
        <View key={p.id} style={[is.row, i === shown.length - 1 && products.length <= FIRST && is.rowLast]}>
          <Thumb image={p.image} />
          <View style={is.body}>
            <View style={is.nameLine}>
              <Text style={is.name} numberOfLines={1}>{p.name}</Text>
              {p.trend === 'rising' ? <TrendUpIcon size={14} color={t.primary[600]} accessibilityLabel="Selling more lately" /> : null}
              {p.trend === 'falling' ? <TrendDownIcon size={14} color={t.danger[600]} accessibilityLabel="Selling less lately" /> : null}
            </View>
            <Text style={is.sub}>
              Next 7 days: about <Text style={is.strong}>{units(p.next7?.units)}</Text>
              {` (likely ${units(p.next7?.low)}–${units(p.next7?.high)})`}
            </Text>
            <View style={styles.tags}>
              <Tag tone="brand">{`Prepare about ${num(p.prepare)}`}</Tag>
              {p.status === 'early' ? <Tag>Early estimate</Tag> : null}
            </View>
          </View>
          <Spark weekly={p.weekly} name={p.name} />
        </View>
      ))}
      {products.length > FIRST ? <ShowMore open={open} total={products.length} onPress={() => setOpen((o) => !o)} /> : null}

      {rising.length || falling.length ? (
        <View style={styles.moves}>
          {rising.length ? <Moves Icon={TrendUpIcon} color={t.primary[600]} label="Selling more lately" items={rising} /> : null}
          {falling.length ? <Moves Icon={TrendDownIcon} color={t.danger[600]} label="Selling less lately" items={falling} /> : null}
        </View>
      ) : null}

      {without > 0 ? (
        <CardNote style={styles.without}>
          {`${num(without)} ${plural(without, 'product has', 'products have')} too little sales history for a forecast yet (6 weeks and 6 sold).`}
        </CardNote>
      ) : null}
    </AnCard>
  );
}

/** "₱1,240" and "likely ₱900–₱1,600". */
function Figure({ label, range }) {
  const r = range || {};
  return (
    <View style={is.figure} accessibilityLabel={`${label}: about ${peso(r.amount)}, likely ${peso(r.low)} to ${peso(r.high)}`}>
      <Text style={is.figureValue} numberOfLines={1}>{peso(r.amount)}</Text>
      <Text style={is.figureLabel}>{label}</Text>
      <Text style={is.figureHint}>{`likely ${peso(r.low)}–${peso(r.high)}`}</Text>
    </View>
  );
}

/** The product's last weeks (up to 12, oldest first) as Sales analytics' thin line. */
function Spark({ weekly, name }) {
  const data = (Array.isArray(weekly) ? weekly : []).map((u) => ({ total: Number(u || 0) }));
  return (
    <View style={styles.spark} accessible accessibilityLabel={`${name}: sold ${data.map((d) => units(d.total)).join(', ')} a week, oldest first`}>
      {data.some((d) => d.total > 0) ? <TrendLine data={data} height={28} /> : null}
      <Text style={styles.sparkLabel}>{`${data.length} ${plural(data.length, 'week')}`}</Text>
    </View>
  );
}

function Moves({ Icon, color, label, items }) {
  const names = items.slice(0, 3).map((x) => x.name).join(', ');
  const more = items.length > 3 ? ` and ${items.length - 3} more` : '';
  return (
    <View style={styles.move}>
      <Icon size={16} color={color} />
      <View style={is.body}>
        <Text style={styles.moveLabel}>{label}</Text>
        <Text style={is.sub} numberOfLines={2}>{names}{more}</Text>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  spark: { width: 64, flexShrink: 0, gap: 2, alignItems: 'flex-end', paddingTop: 2 },
  sparkLabel: { fontSize: 10.5, lineHeight: 13, color: t.neutral[400], ...font(400) },
  moves: { gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  move: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  moveLabel: { fontSize: 12.5, lineHeight: 17, color: t.neutral[700], ...font(500) },
  without: { paddingTop: 0 },
}));
