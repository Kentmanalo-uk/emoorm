import EmptyState from '../EmptyState';

/**
 * The empty list of My Orders and Returns, in the app's one empty-state look
 * (components/EmptyState): the scene, a line, a hint and one green button.
 * page: it is the whole screen's content under the tabs (its scroll content
 * must grow, contentContainerStyle flexGrow: 1, for it to centre).
 */
export default function OrdersEmpty({
  art = 'orders', title, hint, button, onPress, page = false,
}) {
  return (
    <EmptyState
      page={page}
      art={art}
      title={title}
      text={hint}
      actions={button ? [{ label: button, onPress }] : []}
    />
  );
}
