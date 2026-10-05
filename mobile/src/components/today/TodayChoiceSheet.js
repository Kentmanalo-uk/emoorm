import { useState } from 'react';
import Sheet, { SheetOption } from '../Sheet';

/**
 * One Available Today filter's choices in a bottom sheet
 * (web/src/pages/AvailableToday.jsx ChoiceSheet, the search results' sheet
 * look): a row per choice, a check on the chosen one. A tap applies the
 * choice and closes it.
 *
 * options: [{ key, label }]; value: the chosen key.
 * While it slides away it keeps showing what it showed when open.
 */
export default function TodayChoiceSheet({ open, title, options, value, onPick, onClose }) {
  const [shown, setShown] = useState({ title, options, value });
  if (open && (shown.title !== title || shown.value !== value || shown.options !== options)) setShown({ title, options, value });

  return (
    <Sheet open={open} title={shown.title} onClose={onClose} variant="buyer">
      {shown.options.map((o) => (
        <SheetOption
          key={o.key || 'none'}
          label={o.label}
          selected={shown.value === o.key}
          onPress={() => { onPick(o.key); onClose(); }}
        />
      ))}
    </Sheet>
  );
}
