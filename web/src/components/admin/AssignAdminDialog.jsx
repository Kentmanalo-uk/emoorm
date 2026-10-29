import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import { confirmAction } from '../../lib/confirm';
import { roleLabel } from '../../lib/labels';
import Select from '../ui/Select';
import AdminDialog from './AdminDialog';
import { shortDate } from './adminFormat';
import '../../pages/AdminJuniorAdmins.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateInput = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Who cannot be made a town's admin from here, and why.
const refusal = (u) => {
  if (u.role === 'SUPER_ADMIN') return 'Super admins already have full access';
  if (u.role === 'SELLER') return 'Runs a shop: close it first';
  if (!u.isActive) return 'Account suspended';
  return null;
};

/**
 * Makes someone a municipality's admin (primary, or a backup until a date),
 * from Municipal admins or from a town's row on Municipalities. Search as you
 * type, pick the person and the town, then confirm: it changes their role at
 * once, and a new primary admin replaces the current one.
 *
 * @param {Array} municipalities - [{ id, name, admin }] (admin: the primary)
 * @param {String} [municipalityId] - a town chosen already (its row)
 */
export default function AssignAdminDialog({ municipalities, municipalityId: preset = '', onClose, onAssigned }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [municipalityId, setMunicipalityId] = useState(preset);
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isBackup, setIsBackup] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [minDate] = useState(() => toDateInput(Date.now() + DAY_MS));
  const [maxDate] = useState(() => toDateInput(Date.now() + 90 * DAY_MS));
  const town = municipalities.find((m) => m.id === municipalityId);

  // Results follow the typing, after a short pause.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || q === selectedUser?.fullName) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      axios.get('/auth/users', { params: { search: q, pageSize: 10 }, quiet: true })
        .then((res) => { if (!cancelled) setResults(res.data || []); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, selectedUser]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !municipalityId) {
      toast.error('Pick a person and a municipality');
      return;
    }
    let accessExpiresAt;
    if (isBackup) {
      if (!endDate || endDate < minDate || endDate > maxDate) {
        toast.error('Pick an end date between tomorrow and 90 days from now');
        return;
      }
      // End of the chosen day, local time.
      accessExpiresAt = new Date(`${endDate}T23:59:59`).toISOString();
    }
    const replacing = !isBackup && town?.admin && town.admin.id !== selectedUser.id ? town.admin : null;
    const ok = await confirmAction({
      title: isBackup
        ? `Make ${selectedUser.fullName} a backup admin of ${town?.name}?`
        : `Make ${selectedUser.fullName} the admin of ${town?.name}?`,
      message: [
        `Their account becomes a municipal admin right away, with the admin panel for ${town?.name}${isBackup ? ` until ${shortDate(`${endDate}T00:00:00`)}` : ''}.`,
        replacing ? `${replacing.fullName}, the current primary admin, goes back to an ordinary account.` : '',
        selectedUser.role === 'MUNICIPAL_ADMIN' && selectedUser.municipality?.id !== municipalityId
          ? `They stop being an admin of ${selectedUser.municipality?.name || 'their current town'}.` : '',
      ].filter(Boolean).join(' '),
      confirmLabel: isBackup ? 'Make backup' : 'Make admin',
      danger: Boolean(replacing),
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await axios.post('/admin/junior-admins', {
        userId: selectedUser.id,
        municipalityId,
        ...(isBackup ? { backup: true, accessExpiresAt } : {}),
      });
      toast.success(isBackup
        ? `${selectedUser.fullName} is a backup admin until ${shortDate(`${endDate}T00:00:00`)}`
        : `${selectedUser.fullName} is now the admin of ${town?.name}`);
      onAssigned();
    } catch (err) {
      toast.error(err?.message || 'Could not assign the admin');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminDialog title={town && preset ? `Assign an admin to ${town.name}` : 'Assign a municipal admin'} onClose={onClose}>
      <form className="adg-form" onSubmit={submit}>
        <label className="adg-field">
          <span>Person</span>
          <input
            type="search"
            className="admin-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); }}
            placeholder="Type a name or email…"
            autoComplete="off"
            aria-label="Search people by name or email"
          />
          <small>{searching ? 'Searching…' : 'At least two letters. Sellers and super admins cannot be chosen.'}</small>
        </label>

        {!selectedUser && results && search.trim().length >= 2 && (
          results.length === 0 ? <p className="adg-quiet">Nobody matches that.</p> : (
            <ul className="adg-results">
              {results.map((u) => {
                const no = refusal(u);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="adg-result"
                      disabled={Boolean(no)}
                      onClick={() => { setSelectedUser(u); setSearch(u.fullName); setResults(null); }}
                    >
                      <strong>{u.fullName}</strong>
                      <span>{[roleLabel(u.role), u.municipality?.name, u.email].filter(Boolean).join(' · ')}</span>
                      {no && <span className="adg-refusal">{no}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {selectedUser && (
          <div className="adg-picked">
            <strong>{selectedUser.fullName}</strong>
            {` · ${roleLabel(selectedUser.role)}${selectedUser.municipality?.name ? `, ${selectedUser.municipality.name}` : ''}`}
          </div>
        )}

        <label className="adg-field">
          <span>Municipality</span>
          <Select
            value={municipalityId}
            onChange={(e) => setMunicipalityId(e.target.value)}
            className="admin-input"
            disabled={Boolean(preset)}
          >
            <option value="">Choose a municipality…</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.admin ? '' : ' (no primary admin)'}</option>
            ))}
          </Select>
          {town && <small>{town.admin ? `Primary admin now: ${town.admin.fullName}.` : 'No primary admin yet.'}</small>}
        </label>

        <div className="ja-backup">
          <label className="ja-backup-toggle">
            <input type="checkbox" checked={isBackup} onChange={(e) => setIsBackup(e.target.checked)} />
            <span>Backup admin (temporary)</span>
          </label>
          <p className="ja-backup-help">
            {isBackup
              ? "A backup shares this municipality's admin access until the end date, without replacing the primary admin. Access ends automatically."
              : 'Leave unchecked to assign the primary admin. This replaces the current primary admin of the municipality.'}
          </p>
          {isBackup && (
            <label className="ja-backup-date">
              <span>Access ends on</span>
              <input
                type="date"
                className="admin-input"
                value={endDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          )}
        </div>

        <div className="adg-actions">
          <button type="button" onClick={onClose} className="admin-btn admin-btn-gray">Cancel</button>
          <button
            type="submit"
            disabled={!selectedUser || !municipalityId || submitting || (isBackup && !endDate)}
            className="admin-btn admin-btn-primary"
          >
            {submitting ? 'Assigning…' : isBackup ? 'Assign backup…' : 'Assign…'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
