import { WarningCircle } from '../../lib/icons';

/**
 * Shown on the admin pages that send email when mail cannot go out: the
 * email service (Resend) refuses everything until the sending domain is
 * verified, which needs its DNS records in place. `sender` is the backend's
 * utils/email senderStatus().
 */
export default function SenderWarning({ sender }) {
  if (!sender || sender.ok !== false) return null;
  return (
    <div className="admin-sender-warning" role="alert">
      <WarningCircle size={20} weight="fill" aria-hidden="true" />
      <div>
        <strong>Emails can&apos;t be sent right now.</strong>
        <p>
          {`The ${sender.domain || 'sending'} domain isn't verified with the email service (Resend: ${sender.status}), so every email is refused. `}
          Add the missing DNS record for it in Hostinger (Domains → DNS), then check it again in Resend. Emails go out once it shows Verified.
        </p>
      </div>
    </div>
  );
}
