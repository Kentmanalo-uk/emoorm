import { lineNote, countLabel, lineKind } from '../../lib/orderLines';

/*
 * Seller Center: packing slips to print and tape to the parcel (or keep at
 * the counter for a pickup): who it is for, where it goes, how to reach
 * them, what goes in, the buyer's notes and the cash to collect. One order
 * or many, one slip per page.
 *
 *   printPackingSlips(orders, { shopName })
 *
 * The slips are drawn in a hidden frame and printed from there, so the
 * Seller Center page itself is left as it was.
 */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const money = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (value) => (value
  ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

// Cash the buyer still hands over: cash orders not marked paid. A rider
// order's delivery fee goes to the rider, but the buyer pays it all the same.
const cashToCollect = (order) => (order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID' ? Number(order.total || 0) : 0);

const PAID_BY = { COD: 'Cash', GCASH: 'GCash', QRPH: 'QR Ph', BANK_TRANSFER: 'Bank transfer' };

const qty = (line) => (['LIVESTOCK', 'PACKAGE'].includes(lineKind(line)) ? countLabel(line) : `× ${line.quantity}`);

function slip(order, shopName) {
  const pickup = order.fulfillmentMethod === 'PICKUP';
  const collect = cashToCollect(order);
  const lines = (order.items || []).map((line) => {
    const choice = line.selectedVariations && typeof line.selectedVariations === 'object'
      ? Object.entries(line.selectedVariations).map(([k, v]) => `${k}: ${v}`).join(' · ')
      : '';
    const inside = Array.isArray(line.packageContents) && line.packageContents.length
      ? line.packageContents.map((c) => `${c.quantity || 1} × ${c.name}`).join(', ')
      : '';
    const note = [choice, inside, lineNote(line)].filter(Boolean).join(' · ');
    return `<tr>
      <td class="box"></td>
      <td><strong>${esc(line.productName || line.product?.name || 'Item')}</strong>${note ? `<small>${esc(note)}</small>` : ''}</td>
      <td class="num">${esc(qty(line))}</td>
    </tr>`;
  }).join('');

  return `<section class="slip">
    <header>
      <div>
        <span class="shop">${esc(shopName || 'Emoorm shop')}</span>
        <h1>Order #${esc(order.orderNumber || String(order.id).slice(-6).toUpperCase())}</h1>
        <span class="muted">Ordered ${esc(day(order.createdAt))}</span>
      </div>
      <span class="way">${pickup ? 'PICKUP' : 'DELIVERY'}</span>
    </header>
    <div class="who">
      <div>
        <span class="label">${pickup ? 'Buyer' : 'Deliver to'}</span>
        <strong>${esc(order.buyer?.fullName || 'Buyer')}</strong>
        <span>${esc(order.contactNumber || '')}</span>
      </div>
      <div>
        <span class="label">${pickup ? 'Pickup at' : 'Address'}</span>
        <span>${esc(order.deliveryAddress || '—')}</span>
      </div>
    </div>
    ${order.deliveryNotes ? `<p class="notes"><span class="label">Buyer's note</span>${esc(order.deliveryNotes)}</p>` : ''}
    <table>
      <thead><tr><th class="box"></th><th>Item</th><th class="num">Qty</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <footer>
      <span>Paid by: ${esc(PAID_BY[order.paymentMethod] || order.paymentMethod || 'Cash')}${order.paymentStatus === 'PAID' ? ' (paid)' : ''}</span>
      ${collect > 0
    ? `<strong class="collect">Collect ${esc(money(collect))}</strong>`
    : `<strong>Total ${esc(money(order.total))}</strong>`}
    </footer>
  </section>`;
}

const STYLE = `
  @page { size: A5 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }
  .slip { page-break-after: always; break-after: page; padding: 4mm 0; }
  .slip:last-child { page-break-after: auto; break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h1 { margin: 2px 0; font-size: 20px; }
  .shop { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .muted, small { color: #555; }
  .way { border: 2px solid #111; border-radius: 6px; padding: 4px 10px; font-weight: 700; letter-spacing: .06em; }
  .who { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid #ccc; }
  .who div { display: flex; flex-direction: column; gap: 2px; }
  .who strong { font-size: 16px; }
  .label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  .notes { margin: 8px 0 0; padding: 8px; border: 1px dashed #999; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #555; border-bottom: 1px solid #ccc; padding: 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  td small { display: block; }
  .num { text-align: right; white-space: nowrap; }
  .box { width: 22px; }
  td.box::before { content: ""; display: inline-block; width: 14px; height: 14px; border: 1.5px solid #111; border-radius: 3px; }
  footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 8px; border-top: 2px solid #111; }
  footer strong { font-size: 16px; }
  .collect { padding: 4px 10px; border: 2px solid #111; border-radius: 6px; }
`;

/** Print one packing slip per order. Resolves once the print dialog is up. */
export function printPackingSlips(orders, { shopName } = {}) {
  const list = (orders || []).filter(Boolean);
  if (!list.length) return false;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.className = 'so-print-frame';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slips</title><style>${STYLE}</style></head><body>${list.map((o) => slip(o, shopName)).join('')}</body></html>`);
  doc.close();
  const win = frame.contentWindow;
  // Gone once printing is done (or cancelled); a minute at the latest.
  const remove = () => { if (frame.parentNode) frame.parentNode.removeChild(frame); };
  win.addEventListener('afterprint', () => setTimeout(remove, 0));
  setTimeout(remove, 60000);
  setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
  return true;
}
