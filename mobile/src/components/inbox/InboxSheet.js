import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetFrame } from '../Sheet';

/**
 * A bottom sheet for the chat screen (attach a product, report), in the app's
 * one sheet look: the Log in / Sign up sheet's (Sheet.js SheetFrame): a grab
 * handle, a round × at the left, the title (`label`), then the caller's body.
 *
 * children may be a function (safeBottom) => node, to pad the end.
 * `style` is still accepted from older callers.
 */
export default function InboxSheet({ open, onClose, children, maxHeight = 0.8, label }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetFrame safeBottom={false} open={open} onClose={onClose} title={label} maxHeight={maxHeight} scroll={false} padded={false}>
      {typeof children === 'function' ? children(insets.bottom) : children}
    </SheetFrame>
  );
}
