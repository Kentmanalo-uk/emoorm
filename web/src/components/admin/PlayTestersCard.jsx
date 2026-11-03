import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Copy, DownloadSimple as Download, PaperPlaneTilt, Trash,
} from '../../lib/icons';
import axios from '../../lib/axios';
import ConfirmDialog from '../ui/ConfirmDialog';
import EmptyArt from '../ui/EmptyArt';
import SenderWarning from './SenderWarning';
import LoadFailed from '../ui/LoadFailed';
import { AdminDate, CountTag } from './AdminBits';
import { toCSV, downloadCSV } from '../analytics/format';

/*
 * Super admin, on App users: the people who asked on /app for the early
 * version on Google Play. Google lets only the accounts on the Play Console
 * tester list install it, so: copy the waiting emails into Play Console,
 * then mark them added here, which emails each the link to join.
 */
export default function PlayTestersCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => axios.get('/app/testers')
    .then((res) => { setData(res.data); setError(''); })
    .catch((err) => setError(err.message || 'Could not load the testers.')), []);

  useEffect(() => { load(); }, [load]);

  const testers = data?.testers || [];
  const waiting = testers.filter((t) => !t.addedAt);

  const copyWaiting = async () => {
    try {
      await navigator.clipboard.writeText(waiting.map((t) => t.email).join(', '));
      toast.success(`${waiting.length} email${waiting.length === 1 ? '' : 's'} copied: paste them into Play Console`);
    } catch {
      toast.error('Could not copy. Export the CSV instead.');
    }
  };

  const exportCsv = () => {
    downloadCSV(`emoorm-play-testers-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(testers, [
      { label: 'Email', get: (t) => t.email },
      { label: 'Account', get: (t) => t.user?.fullName || '' },
      { label: 'Asked', get: (t) => new Date(t.createdAt).toISOString() },
      { label: 'Added', get: (t) => (t.addedAt ? new Date(t.addedAt).toISOString() : '') },
    ]));
  };

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'added') {
        const res = await axios.post('/app/testers/added', { ids: confirm.ids });
        const { emailed, failed, reason } = res.data;
        if (failed?.length) toast.error(`${reason || 'The email could not be sent'}. Not emailed, so still waiting: ${failed.join(', ')}`, { duration: 9000 });
        else toast.success(`${emailed} tester${emailed === 1 ? '' : 's'} emailed the link to join`);
      } else if (confirm.kind === 'resend') {
        const res = await axios.post('/app/testers/resend', { ids: confirm.ids });
        const { emailed, failed, reason } = res.data;
        if (failed?.length) toast.error(`${reason || 'The email could not be sent'}. Not emailed: ${failed.join(', ')}`, { duration: 9000 });
        else toast.success(`Sent the link again to ${emailed} tester${emailed === 1 ? '' : 's'}`);
      } else {
        await axios.delete(`/app/testers/${confirm.ids[0]}`);
        toast.success('Taken off the list');
      }
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h2 className="admin-card-title">Early version on Google Play <CountTag n={waiting.length} /></h2>
        <div className="admin-toolbar">
          <button type="button" className="admin-btn admin-btn-outline" onClick={copyWaiting} disabled={!waiting.length}>
            <Copy size={15} /> Copy waiting emails
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => setConfirm({ kind: 'added', ids: waiting.map((t) => t.id) })}
            disabled={!waiting.length}
          >
            <PaperPlaneTilt size={15} /> Mark added and email them
          </button>
          <button type="button" className="admin-btn admin-btn-outline" onClick={exportCsv} disabled={!testers.length}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>
      <SenderWarning sender={data?.sender} />
      <ol className="aau-play-steps">
        <li>Copy the waiting emails.</li>
        <li>
          In Play Console, open <strong>Test and release → Closed testing</strong>, the track&apos;s <strong>Testers</strong>
          {' '}tab, and add them to its email list. Save.
        </li>
        <li>Mark them added here: each gets an email with the link to join and install.</li>
      </ol>
      {error && !data ? (
        <LoadFailed onRetry={load} what="the testers" compact />
      ) : !data ? (
        <div className="admin-empty"><p>Loading…</p></div>
      ) : testers.length === 0 ? (
        <div className="admin-empty">
          <EmptyArt name="activity" size={96} />
          <p>Nobody has asked yet. People leave their Gmail on the download page.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Gmail</th><th>Account</th><th>Asked</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {testers.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.email}</strong></td>
                  <td>{t.user?.fullName || '—'}</td>
                  <td><AdminDate value={t.createdAt} /></td>
                  <td>
                    {t.addedAt
                      ? <span className="admin-badge admin-badge-approved">Added</span>
                      : <span className="admin-badge admin-badge-pending">Waiting</span>}
                  </td>
                  <td className="aau-play-actions">
                    {!t.addedAt ? (
                      <button type="button" className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setConfirm({ kind: 'added', ids: [t.id] })}>
                        Mark added
                      </button>
                    ) : (
                      <button type="button" className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setConfirm({ kind: 'resend', ids: [t.id], email: t.email })}>
                        Send link again
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-btn admin-btn-outline admin-btn-sm"
                      onClick={() => setConfirm({ kind: 'remove', ids: [t.id], email: t.email })}
                      aria-label={`Remove ${t.email}`}
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'remove' ? 'Take this Gmail off the list?' : confirm?.kind === 'resend' ? 'Send the link again?' : 'Added in Play Console?'}
        message={confirm?.kind === 'remove'
          ? `${confirm.email} is removed here only. If it is in Play Console, remove it there too.`
          : confirm?.kind === 'resend'
            ? `${confirm.email} gets the email with the link to join again.`
          : confirm?.ids.length === 1
            ? 'Only if this email is already on the Play Console tester list: it is sent the link to join now.'
            : `Only if these ${confirm?.ids.length} emails are already on the Play Console tester list: each is sent the link to join now.`}
        confirmLabel={confirm?.kind === 'remove' ? 'Remove' : confirm?.kind === 'resend' ? 'Send it' : 'Yes, email them'}
        danger={confirm?.kind === 'remove'}
        loading={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
