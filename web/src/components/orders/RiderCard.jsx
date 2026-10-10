import {
  Bicycle, ChatText, Motorcycle, Phone,
} from '@phosphor-icons/react';
import { riderStatus, vehicleLabel } from '../../lib/moormove';
import './RiderDelivery.css';

/** The rider's vehicle as an icon. */
export function VehicleIcon({ vehicle, size = 20 }) {
  return vehicle === 'BICYCLE' ? <Bicycle size={size} weight="fill" /> : <Motorcycle size={size} weight="fill" />;
}

/**
 * A MoorMove rider delivery at a glance: where it stands, who the rider is
 * (name, vehicle and plate) and buttons to call or text them. Shown to the
 * buyer and to the seller, each in their own words. Anything passed as
 * children (the seller's buttons) sits at the bottom.
 *
 *   <RiderCard order={order} who="seller">…</RiderCard>
 */
export default function RiderCard({ order, who = 'buyer', compact = false, children = null }) {
  const rd = order?.riderDelivery;
  if (!rd) return null;
  const status = riderStatus(rd, who, order);
  const vehicle = [vehicleLabel(rd.riderVehicle), rd.riderPlate].filter(Boolean).join(' · ');
  const phone = rd.riderPhone ? String(rd.riderPhone).replace(/[^\d+]/g, '') : '';
  const showRider = rd.riderName && !['CANCELLED', 'SEARCHING'].includes(rd.status);

  return (
    <div className={`rider-card is-${status.tone}${compact ? ' is-compact' : ''}`}>
      <div className="rider-card-status">
        <span className="rider-card-icon" aria-hidden="true"><VehicleIcon vehicle={rd.riderVehicle} size={compact ? 16 : 18} /></span>
        <div className="rider-card-text">
          <strong>{status.title}</strong>
          {status.text && !compact && <span>{status.text}</span>}
        </div>
      </div>

      {showRider && (
        <div className="rider-card-who">
          <div className="rider-card-name">
            <b>{rd.riderName}</b>
            {vehicle && <small>{vehicle}</small>}
          </div>
          {phone && !compact && (
            <div className="rider-card-contact">
              <a className="rider-card-btn" href={`tel:${phone}`} aria-label={`Call ${rd.riderName}`}>
                <Phone size={15} weight="fill" /> Call
              </a>
              <a className="rider-card-btn" href={`sms:${phone}`} aria-label={`Text ${rd.riderName}`}>
                <ChatText size={15} weight="fill" /> Text
              </a>
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
