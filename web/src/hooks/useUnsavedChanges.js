import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmAction } from '../lib/confirm';

/**
 * While a form has unsaved changes, leaving it asks first.
 *
 *   useUnsavedChanges(dirty)
 *
 * Covers closing or reloading the tab (the browser's own prompt) and every
 * in-app link: the sidebar, tab bars, menus and buttons rendered as links.
 * The app uses <BrowserRouter>, which cannot block a navigation, so the
 * browser's Back button and code that calls navigate() itself (a form's own
 * Save or Cancel) are not stopped.
 */
export default function useUnsavedChanges(dirty, {
  title = 'Leave without saving?',
  message = 'Your changes on this page are not saved yet.',
} = {}) {
  const navigate = useNavigate();
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; });

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location.pathname + window.location.search;
      if (url.pathname + url.search === here) return;
      e.preventDefault();
      e.stopPropagation();
      confirmAction({ title, message, confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true }).then((leave) => {
        if (!leave) return;
        dirtyRef.current = false;
        navigate(url.pathname + url.search + url.hash);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    // Capture: before React Router's own link handler.
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, title, message, navigate]);
}
