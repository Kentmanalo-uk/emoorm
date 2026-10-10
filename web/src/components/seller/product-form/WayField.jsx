import { Field, Segmented } from './parts';

const NOT_BY_COURIER = {
  READY_TO_EAT: 'Cooked food is picked up, or brought by you. Couriers do not carry it.',
  COOK_TO_ORDER: 'Paluto is picked up, or brought by you. Couriers do not carry it.',
};

/**
 * How buyers get it: asked only when the shop offers both pickup and
 * delivery. null keeps it as the shop offers (both). `label` null: the
 * card around it already names it.
 */
export default function WayField({
  value, onChange, shopMode, kind, couriersOn, label = 'How buyers get it',
}) {
  const askWay = !shopMode || shopMode === 'BOTH';
  const courierNote = NOT_BY_COURIER[kind];

  if (!askWay) {
    return (
      <Field label={label}>
        <div className="pf-derived">
          <strong>{shopMode === 'PICKUP' ? 'Pickup only' : 'Delivery only'}</strong>
          <small>
            {shopMode === 'PICKUP' ? 'Your shop offers pickup only.' : 'Your shop offers delivery only.'}
            {courierNote && shopMode === 'DELIVERY' ? ` ${courierNote}` : ''}
          </small>
        </div>
      </Field>
    );
  }

  const options = [
    { key: value === 'BOTH' ? 'BOTH' : null, label: 'Both' },
    { key: 'PICKUP', label: 'Pickup only' },
    { key: 'DELIVERY', label: 'Delivery only' },
  ];
  const bringer = kind === 'REGULAR' && couriersOn ? 'You or a courier bring it to the buyer.' : 'You bring it to the buyer.';
  const hint = {
    PICKUP: 'The buyer comes to get it from you.',
    DELIVERY: bringer,
  }[value] || 'The buyer picks: come and get it, or have it brought.';
  return (
    <Field label={label} required={!!label}>
      <Segmented label="How buyers get it" options={options} value={value} onChange={onChange} />
      <p className="pf-hint">
        {hint}
        {courierNote && <><br />{courierNote}</>}
      </p>
    </Field>
  );
}
