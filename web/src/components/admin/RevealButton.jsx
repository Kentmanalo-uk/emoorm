import { useState } from 'react';
import toast from 'react-hot-toast';
import { Eye } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import ReasonDialog from './ReasonDialog';

/**
 * "Show" for details admins don't see by default (a buyer's phone and
 * address, an order's payment). It asks why, sends the reason with the
 * request, and the server writes it to the audit log before answering.
 *
 *   <RevealButton
 *     endpoint={`/orders/${id}/reveal`}
 *     body={{ part: 'contact' }}
 *     label="Show contact"
 *     onRevealed={(data) => setContact(data)}
 *   />
 */
export default function RevealButton({
  endpoint, body = {}, label = 'Show', title = 'Why do you need to see this?', onRevealed, className = '',
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reveal = async (reason) => {
    setBusy(true);
    try {
      const res = await axios.post(endpoint, { ...body, reason });
      onRevealed?.(res.data);
      setOpen(false);
      toast.success('Shown. This was noted in the audit log.');
    } catch (err) {
      toast.error(err.message || 'Could not show these details');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={`admin-btn admin-btn-gray admin-reveal-btn ${className}`.trim()} onClick={() => setOpen(true)}>
        <Eye size={14} /> {label}
      </button>
      <ReasonDialog
        open={open}
        title={title}
        message="Private details are shown only for a case (a report, a dispute, a return). Your reason is saved in the audit log."
        confirmLabel="Show"
        placeholder="e.g. Buyer reported the parcel never arrived"
        required
        danger={false}
        loading={busy}
        onConfirm={reveal}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
