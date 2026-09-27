import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Check, ArrowSquareOut, QrCode } from '@phosphor-icons/react';
import { formatAccountNumber } from '../../lib/qrPayment';
import { isAndroid } from '../../lib/device';
import './GcashPhonePay.css';

// Opening the GCash app (Mynt). iPhones open it by its link scheme. Android
// opens its package directly, or its Play Store page when it is not
// installed; the checkout stays open behind either.
const GCASH_LINK = 'gcash://';
const GCASH_ANDROID = 'intent://com.mynt.gcash#Intent;scheme=gcash;package=com.globe.gcash.android;end';
// How long the app has to take over before the buyer is told how to open it.
const OPEN_WAIT_MS = 2500;
const COPIED_MS = 2000;

/** Copies text; the older way where the Clipboard API is missing (some in-app browsers). */
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    let copied;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
};

/**
 * Phones: paying the shop with GCash by hand. The amount and the shop's
 * GCash number (with Copy), its account name, and a button that opens the
 * GCash app to send it. The buyer comes back for the reference number and
 * the screenshot (`children`). Nothing here talks to GCash or marks the
 * order paid: the seller checks the payment, as with every GCash order.
 *
 * @param {String} amount - What to send, formatted (₱850.00)
 * @param {String} number - The shop's GCash number (09XXXXXXXXX)
 * @param {String} [accountName] - The name on the shop's GCash account
 * @param {String} [qrImage] - The shop's GCash QR, shown on request
 * @param {String} [instructions] - The shop's own note about paying
 * @param {Function} [onOpen] - When the buyer heads to GCash
 */
export default function GcashPhonePay({ amount, number, accountName, qrImage, instructions, onOpen, children }) {
  const [copied, setCopied] = useState(false);
  const [notOpened, setNotOpened] = useState(false);
  const timers = useRef([]);
  const listeners = useRef([]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    listeners.current.forEach((stop) => stop());
  }, []);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const copyNumber = async () => {
    if (!(await copyText(number))) {
      toast.error('Could not copy. Press and hold the number to copy it.');
      return;
    }
    setCopied(true);
    later(() => setCopied(false), COPIED_MS);
  };

  // The link itself opens GCash (a tap on a link is what phones and in-app
  // browsers let through to another app); this only watches whether it did.
  const watchOpen = () => {
    onOpen?.();
    setNotOpened(false);
    // GCash opened if this page went to the background.
    let left = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') left = true;
    };
    const stop = () => document.removeEventListener('visibilitychange', onHide);
    document.addEventListener('visibilitychange', onHide);
    listeners.current.push(stop);
    later(() => {
      stop();
      if (!left && document.visibilityState === 'visible') setNotOpened(true);
    }, OPEN_WAIT_MS);
  };

  return (
    <section className="co-gcash" aria-labelledby="co-gcash-title">
      <h3 id="co-gcash-title" className="co-gcash-title">Pay with GCash</h3>

      <div className="co-gcash-payee">
        <p className="co-gcash-send">Send <strong>{amount}</strong> to</p>
        <div className="co-gcash-number">
          <span className="co-gcash-digits">{formatAccountNumber(number)}</span>
          <button
            type="button"
            className={`co-gcash-copy${copied ? ' is-copied' : ''}`}
            onClick={copyNumber}
            aria-label={copied ? 'GCash number copied' : 'Copy GCash number'}
          >
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <span className="co-gcash-live" aria-live="polite">{copied ? 'GCash number copied' : ''}</span>
        </div>
        {accountName && (
          <div className="co-gcash-name">
            <span>Account Name</span>
            <strong>{accountName}</strong>
          </div>
        )}
      </div>

      <a href={isAndroid() ? GCASH_ANDROID : GCASH_LINK} className="co-gcash-open" onClick={watchOpen}>
        Open GCash <ArrowSquareOut size={18} weight="bold" aria-hidden="true" />
      </a>
      {notOpened && (
        <p className="co-gcash-hint" role="status">
          GCash didn&apos;t open? Open the GCash app yourself and send {amount} to the number above.
        </p>
      )}

      <p className="co-gcash-note">
        After paying, return to E-MOORM to submit your payment reference and screenshot.
      </p>
      {instructions && <p className="co-gcash-instructions">{instructions}</p>}

      {qrImage && (
        <details className="co-gcash-qr">
          <summary><QrCode size={16} aria-hidden="true" /> Show the shop&apos;s QR code</summary>
          <img src={qrImage} alt="The shop's GCash QR code" />
        </details>
      )}

      <div className="co-gcash-proof">{children}</div>
    </section>
  );
}
