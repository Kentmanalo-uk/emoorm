import { useState } from 'react';
import { Copy, Check, ArrowSquareOut } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { resolveImg } from '../../lib/media';
import { trackingLink } from '../../lib/tracking';
import './ShipOrderSheet.css';

/**
 * A courier's logo on a white chip (1.75 : 1, like the logo files), or its
 * initial on a tint when it has none.
 */
export function CourierMark({ courier, size = 32 }) {
  const name = courier?.name || 'Courier';
  const width = Math.round(size * 1.75);
  if (courier?.logoUrl) {
    return <img className="courier-mark is-logo" src={resolveImg(courier.logoUrl)} alt="" style={{ width, height: size }} />;
  }
  return (
    <span className="courier-mark is-initial" style={{ width, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'C'}
    </span>
  );
}

/**
 * A shipped order's courier and tracking number, with Copy and a button to
 * track the parcel. Shown to the buyer, and to the seller as a record.
 */
export default function CourierTracking({ order, showTrack = true }) {
  const [copied, setCopied] = useState(false);
  if (!order?.trackingNumber) return null;
  const courier = order.courier || { name: order.courierName };
  const link = trackingLink(order);

  const copy = async () => {
    try {
      try {
        await navigator.clipboard.writeText(order.trackingNumber);
      } catch {
        // Some in-app browsers (the Android app's WebView) refuse the
        // clipboard API; a selected text box still copies there.
        const box = document.createElement('textarea');
        box.value = order.trackingNumber;
        box.setAttribute('readonly', '');
        box.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(box);
        box.select();
        const ok = document.execCommand('copy');
        box.remove();
        if (!ok) throw new Error('copy refused');
      }
      setCopied(true);
      toast.success('Tracking number copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Select the number to copy it.');
    }
  };

  return (
    <div className="courier-tracking">
      <div className="courier-tracking-head">
        <CourierMark courier={courier} size={36} />
        <div className="courier-tracking-text">
          <span className="courier-tracking-label">Shipped with {courier.name || order.courierName}</span>
          <span className="courier-tracking-number">
            <code>{order.trackingNumber}</code>
            <button type="button" className="courier-copy" onClick={copy} aria-label="Copy tracking number">
              {copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </div>
      </div>
      {showTrack && link && (
        <a className="courier-track-btn" href={link} target="_blank" rel="noopener noreferrer">
          Track your order here <ArrowSquareOut size={15} weight="bold" />
        </a>
      )}
    </div>
  );
}
