import { ArrowClockwise } from '../../lib/icons';
import EmptyState from './EmptyState';

/**
 * What a page shows when its content could not be loaded (offline, the
 * server busy): says so, with "Try again", instead of looking empty ("No
 * stores yet") or gone ("Product not found"), which it is not.
 *
 *   <LoadFailed onRetry={load} />            a page's main content
 *   <LoadFailed onRetry={load} compact />    inside a section or card
 *   what: "this shop", "the notifications"… (default "this page")
 */
export default function LoadFailed({ onRetry, what = 'this page', compact = false, page = false }) {
  return (
    <EmptyState
      art="offline"
      title={`Couldn't load ${what}`}
      text="Check your connection, then try again."
      compact={compact}
      page={page}
      actions={onRetry ? [{ label: 'Try again', onClick: onRetry, icon: ArrowClockwise }] : []}
    />
  );
}
