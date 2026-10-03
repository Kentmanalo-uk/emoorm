import { useSyncExternalStore } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { answerConfirm, currentConfirm, subscribeConfirm } from '../../lib/confirm';

/** Shows the questions asked with confirmAction() (lib/confirm.js). Mounted once, in App.jsx. */
export default function ConfirmHost() {
  const ask = useSyncExternalStore(subscribeConfirm, currentConfirm);
  return (
    <ConfirmDialog
      open={Boolean(ask)}
      title={ask?.title || ''}
      message={ask?.message || ''}
      confirmLabel={ask?.confirmLabel}
      cancelLabel={ask?.cancelLabel}
      danger={ask?.danger}
      onConfirm={() => answerConfirm(true)}
      onCancel={() => answerConfirm(false)}
    />
  );
}
