import { Field, Segmented } from './parts';

const NOT_BY_COURIER = {
  READY_TO_EAT: 'Cooked food is picked up or delivered by you, not by couriers.',
  COOK_TO_ORDER: 'Paluto is picked up or delivered by you, not by couriers.',
  LIVESTOCK: 'Live animals are picked up or delivered by you, never by couriers.',
};

/**
 * How buyers get it: asked only when the shop offers both pickup and
 * delivery. null keeps it as the shop offers.
 */
export default function WayField({ value, onChange, shopMode, kind, couriersOn }) {
  const askWay = !shopMode || shopMode === 'BOTH';
  const courierNote = NOT_BY_COURIER[kind];
  const deliveryHint = kind === 'REGULAR' && couriersOn ? 'You or a courier bring it to buyers' : 'You bring it to buyers';

  if (!askWay) {
    return (
      <Field label="How buyers get it">
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
  const hint = {
    PICKUP: 'Buyers pick it up from you.',
    DELIVERY: `${deliveryHint}.`,
  }[value] || 'Buyers choose pickup or delivery.';
  return (
    <Field label="How buyers get it" required>
      <Segmented label="How buyers get it" options={options} value={value} onChange={onChange} />
      <p className="pf-hint">
        {hint}
        {courierNote && <><br />{courierNote}</>}
      </p>
    </Field>
  );
}
