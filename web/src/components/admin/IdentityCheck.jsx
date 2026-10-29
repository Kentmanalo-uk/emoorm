import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, IdentificationCard, Warning, XCircle } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import ReasonDialog from './ReasonDialog';
import { idStatus, shortDate } from './adminFormat';

/*
 * A person's ID check, in the Seller applications and Sellers/Buyers drawers:
 * where it stands, and "Checked ID in person" for when they bring their ID to
 * the municipal hall (POST /moderation/identity/:userId/review, the same as
 * the identity panel in a support chat; the server keeps a municipal admin to
 * their own town and the town of the applicant's shop).
 */

export function IdBadge({ record }) {
  const s = idStatus(record);
  return <span className={`admin-badge ${s.badge}`}>{s.label}</span>;
}

/**
 * @param {Object} props
 * @param {String} props.userId
 * @param {Object|null} props.identity - { status, idType, verifiedAt } (null: loading)
 * @param {Function} [props.onChange] - after a decision, with the new verification
 * @param {Boolean} [props.canReview] - false hides the buttons (admins, oneself)
 */
export default function IdentityCheck({ userId, identity, onChange, canReview = true }) {
  const [dialog, setDialog] = useState(null); // 'VERIFIED' | 'REJECTED'
  const [saving, setSaving] = useState(false);
  const s = idStatus(identity);

  const submit = async (note) => {
    if ((note || '').trim().length < 5) {
      toast.error('Write a note of at least 5 characters: how you checked the ID');
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`/moderation/identity/${userId}/review`, { decision: dialog, note: note.trim() });
      toast.success(dialog === 'VERIFIED' ? 'ID marked as verified' : 'ID check recorded as not verified');
      setDialog(null);
      onChange?.(res.data?.verification || null);
    } catch (err) {
      toast.error(err.message || 'Could not save the ID check');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-idcheck">
      {identity === null ? (
        <p className="admin-id-check">Checking identity…</p>
      ) : s.key === 'VERIFIED' ? (
        <p className="admin-id-check is-verified">
          <CheckCircle size={16} weight="fill" />
          <span>
            <strong>{identity.idType === 'IN_PERSON' ? 'ID checked in person by an admin' : 'ID verified automatically'}</strong>
            {identity.idType && identity.idType !== 'IN_PERSON' ? ` (${identity.idType.replace(/_/g, ' ').toLowerCase()})` : ''}
            {identity.verifiedAt ? `, ${shortDate(identity.verifiedAt)}` : ''}.
          </span>
        </p>
      ) : (
        <p className="admin-id-check is-missing">
          <Warning size={16} weight="fill" />
          <span>
            <strong>{s.key === 'PENDING' ? 'ID check in progress.' : s.key === 'FAILED' ? 'ID not verified.' : 'ID not verified yet.'}</strong>
            {' '}If they bring a valid government ID to the municipal hall, compare it with their registered name, then record it here.
          </span>
        </p>
      )}

      {canReview && identity !== null && (
        <div className="admin-idcheck-actions">
          <button type="button" className="admin-btn admin-btn-green" disabled={saving || s.key === 'VERIFIED'} onClick={() => setDialog('VERIFIED')}>
            <IdentificationCard size={14} /> Checked ID in person
          </button>
          <button type="button" className="admin-btn admin-btn-gray" disabled={saving} onClick={() => setDialog('REJECTED')}>
            <XCircle size={14} /> Couldn&apos;t verify
          </button>
        </div>
      )}

      <ReasonDialog
        open={!!dialog}
        title={dialog === 'VERIFIED' ? 'Mark this ID as checked in person?' : 'Record that the ID could not be verified?'}
        message={dialog === 'VERIFIED'
          ? 'Only when you have seen their ID and the name matches their account. Your note stays in the audit log.'
          : 'They will see this note, so say what they can do next (for example, bring another ID).'}
        confirmLabel={dialog === 'VERIFIED' ? 'Mark verified' : 'Save'}
        placeholder={dialog === 'VERIFIED' ? 'e.g. Saw their PhilSys ID at the office, name matches' : 'e.g. The name on the ID is different'}
        required
        danger={dialog === 'REJECTED'}
        loading={saving}
        onConfirm={submit}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
