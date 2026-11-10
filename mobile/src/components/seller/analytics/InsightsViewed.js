import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ImagesIcon, NotePencilIcon, PackageIcon, PencilSimpleIcon, TagIcon,
} from '../../../lib/icons';
import EmptyState from '../../EmptyState';
import { font, t, themed } from '../../../theme';
import { AnCard, Thumb } from './parts';
import { num, peso } from './format';
import {
  RowButton, insightStyles as is, plural,
} from './InsightsParts';

/*
 * Insights › Viewed but not bought (GET /ml/insights/mine → performance):
 * up to 5 of the shop's products that buyers open but rarely order in the
 * last 30 days, with what the listing itself shows could help (one photo, a
 * short description, a price well above similar products, out of stock).
 * A tap opens the product's edit form. Nothing is said under 50 views.
 */

const HINTS = {
  photos: { Icon: ImagesIcon, text: () => 'Add more photos' },
  description: { Icon: NotePencilIcon, text: () => 'Write a fuller description' },
  price: {
    Icon: TagIcon,
    text: (p) => (p.categoryMedianPrice ? `Priced above similar products (${peso(p.categoryMedianPrice)})` : 'Priced above similar products'),
  },
  out_of_stock: { Icon: PackageIcon, text: () => 'Out of stock' },
};

export default function InsightsViewed({ part }) {
  const router = useRouter();
  if (!part || part.status === 'off' || part.status === 'unavailable') return null;
  const days = part.days || 30;

  if (part.status !== 'ok') {
    const needs = typeof part.needs === 'number' ? part.needs : 50;
    return (
      <AnCard title="Viewed but not bought">
        <EmptyState
          compact
          art="analytics"
          title="Not enough views yet"
          text={`This shows once your products have ${num(needs)} views in ${days} days. So far: ${num(part.views)}.`}
        />
      </AnCard>
    );
  }

  const flagged = part.flagged || [];
  const edit = (id) => router.push({ pathname: '/seller/products/new', params: { edit: id } });
  const rate = Math.round(Number(part.shopConversion || 0) * 1000) / 10;

  return (
    <AnCard title="Viewed but not bought" sub={`Last ${days} days · ${num(part.views)} views`}>
      {flagged.length ? (
        <View>
          {flagged.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${p.name}`}
              onPress={() => edit(p.id)}
              style={({ pressed }) => [is.row, i === flagged.length - 1 && is.rowLast, pressed && is.rowPressed]}
            >
              <Thumb image={p.image} />
              <View style={is.body}>
                <Text style={is.name} numberOfLines={1}>{p.name}</Text>
                <Text style={is.sub}>
                  {`${num(p.views)} ${plural(p.views, 'view')} · ${num(p.cartAdds)} cart ${plural(p.cartAdds, 'add')} · ${num(p.orders)} ${plural(p.orders, 'order')}`}
                </Text>
                {(p.hints || []).length ? (
                  <View style={styles.hints}>
                    {p.hints.filter((h) => HINTS[h]).map((h) => {
                      const { Icon, text } = HINTS[h];
                      return (
                        <View key={h} style={styles.hint}>
                          <Icon size={14} color={t.warning[700]} />
                          <Text style={styles.hintText}>{text(p)}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[is.sub, styles.noHint]}>The listing looks complete; a clearer first photo or a small promo may help.</Text>
                )}
                {/* The whole row is the button; this shows where it goes. */}
                <RowButton label="Edit product" Icon={PencilSimpleIcon} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState
          compact
          art="healthy"
          title="Nothing stands out"
          text={`Products buyers look at are getting orders (${rate}% of views turn into an order).`}
        />
      )}
    </AnCard>
  );
}

const styles = themed(() => StyleSheet.create({
  hints: { gap: 4, marginTop: 6 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, color: t.neutral[700], ...font(400) },
  noHint: { marginTop: 4 },
}));
