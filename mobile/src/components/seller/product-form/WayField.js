import { StyleSheet, Text, View } from 'react-native';
import { font, t, themed } from '../../../theme';
import { Field, Hint, PF, Segmented } from './parts';

const NOT_BY_COURIER = {
  READY_TO_EAT: 'Cooked food is picked up or delivered by you, not by couriers.',
  COOK_TO_ORDER: 'Paluto is picked up or delivered by you, not by couriers.',
  LIVESTOCK: 'Live animals are picked up or delivered by you, never by couriers.',
};

/*
 * How buyers get it (web product-form/WayField.jsx): asked only when the
 * shop offers both pickup and delivery. null keeps it as the shop offers.
 * `label` null: the section around it already names it.
 */
export default function WayField({
  value, onChange, shopMode, kind, couriersOn, label = 'How buyers get it',
}) {
  const askWay = !shopMode || shopMode === 'BOTH';
  const courierNote = NOT_BY_COURIER[kind];
  const deliveryHint = kind === 'REGULAR' && couriersOn ? 'You or a courier bring it to buyers' : 'You bring it to buyers';

  if (!askWay) {
    return (
      <Field label={label}>
        <View style={derivedStyles.box}>
          <Text style={derivedStyles.strong}>{shopMode === 'PICKUP' ? 'Pickup only' : 'Delivery only'}</Text>
          <Text style={derivedStyles.small}>
            {shopMode === 'PICKUP' ? 'Your shop offers pickup only.' : 'Your shop offers delivery only.'}
            {courierNote && shopMode === 'DELIVERY' ? ` ${courierNote}` : ''}
          </Text>
        </View>
      </Field>
    );
  }

  const options = [
    { key: value === 'BOTH' ? 'BOTH' : null, label: 'Both' },
    { key: 'PICKUP', label: 'Pickup only' },
    { key: 'DELIVERY', label: 'Delivery only' },
  ];
  const hint = {
    PICKUP: 'Buyers pick it up from you.',
    DELIVERY: `${deliveryHint}.`,
  }[value] || 'Buyers choose pickup or delivery.';
  return (
    <Field label={label} required={!!label}>
      <Segmented label="How buyers get it" options={options} value={value} onChange={onChange} />
      <Hint>{courierNote ? `${hint}\n${courierNote}` : hint}</Hint>
    </Field>
  );
}

/** .pf-derived: a value worked out for the seller, on a light grey box. */
export const derivedStyles = themed(() => StyleSheet.create({
  box: {
    justifyContent: 'center', gap: 2, minHeight: 46, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: t.neutral[50],
  },
  strong: { fontSize: 15, lineHeight: 24, color: PF.ink, ...font(700) },
  small: { fontSize: 12, lineHeight: 19.2, color: PF.muted, ...font(400) },
}));
