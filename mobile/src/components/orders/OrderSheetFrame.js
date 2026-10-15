import { SheetFrame } from '../Sheet';

/**
 * The bottom sheets of My Orders (and the sheets built on this frame: order
 * details, Rate & Review, the confirm dialog, the seller's order sheets), in
 * the app's one sheet look: the Log in / Sign up sheet's (Sheet.js
 * SheetFrame): a grab handle, a round × at the left, the title, the body and
 * the sticky button row.
 *
 * title + onClose: the title and the ×. footer: the sticky button row.
 * maxHeight: share of the screen (0.9). scroll / dismissable as before.
 * headerStyle, titleStyle, footerStyle and backdrop are still accepted from
 * older callers; the shared look sets those now.
 */
export default function OrderSheetFrame({
  open, title, onClose, children, footer, bodyStyle, maxHeight = 0.9, scroll = true, dismissable = true,
}) {
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      bodyStyle={bodyStyle}
      maxHeight={maxHeight}
      scroll={scroll}
      dismissible={dismissable}
      padded={false}
    >
      {children}
    </SheetFrame>
  );
}
