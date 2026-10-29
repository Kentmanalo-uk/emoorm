/*
 * How the admin pages write dates and a person's ID check, in one place
 * (AdminBits and IdentityCheck draw them).
 *
 *   shortDate(d)       "Oct 21, 2026"            (no time, no seconds)
 *   shortDateTime(d)   "Oct 21, 2026, 3:05 PM"   (when the time matters)
 *   idStatus(record)   { key, label, badge }      VERIFIED / PENDING / FAILED / NONE
 */

const SHORT = { month: 'short', day: 'numeric', year: 'numeric' };

const valid = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const shortDate = (value) => valid(value)?.toLocaleDateString('en-PH', SHORT) || '';

export const shortDateTime = (value) => valid(value)?.toLocaleString('en-PH', { ...SHORT, hour: 'numeric', minute: '2-digit' }) || '';

/** The ID status of a list row (`identityVerification`) or a detail (`identity`). */
export const idStatus = (record) => {
  const status = record?.status || 'NOT_VERIFIED';
  if (status === 'VERIFIED') return { key: 'VERIFIED', label: record?.idType === 'IN_PERSON' ? 'Verified in person' : 'Verified', badge: 'admin-badge-approved' };
  if (status === 'PENDING') return { key: 'PENDING', label: 'Pending', badge: 'admin-badge-pending' };
  if (status === 'FAILED') return { key: 'FAILED', label: 'Not verified', badge: 'admin-badge-rejected' };
  return { key: 'NONE', label: 'None', badge: 'admin-badge-neutral' };
};
