import { useEffect } from 'react';

/**
 * Phones: tables under `root` are drawn as one card per row (AdminPhone.css),
 * and each cell shows its column's name beside its value. The names come
 * from the table's own header, copied onto every cell as `data-label`, so no
 * page has to repeat them. It runs again whenever rows come or go.
 *
 * @param {Boolean} enabled - only on phones
 * @param {{current: HTMLElement|null}} rootRef - the content area
 */
export default function useTableCardLabels(enabled, rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return undefined;

    const label = () => {
      root.querySelectorAll('table').forEach((table) => {
        const heads = [...table.querySelectorAll(':scope > thead th')].map((th) => th.textContent.trim());
        if (heads.length === 0) return;
        table.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
          let col = 0;
          [...tr.children].forEach((cell) => {
            const text = heads[col] || '';
            if (cell.getAttribute('data-label') !== text) cell.setAttribute('data-label', text);
            col += Number(cell.colSpan || 1);
          });
        });
      });
    };

    label();
    // Rows arrive after loading, paging and filtering; attribute changes are
    // not watched, so labelling never feeds itself.
    const observer = new MutationObserver(label);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, rootRef]);
}
