import { useEffect } from 'react';

/**
 * A full-screen chat (position: fixed; inset: 0) that stays in the part of
 * the screen the on-screen keyboard leaves.
 *
 *   useKeyboardInset(shellRef, { active: chatIsOpen, scrollerRef: messagesRef });
 *
 * On an iPhone (Safari and the home-screen app) the keyboard covers the page
 * instead of shrinking it: the bottom of a fixed chat, its message box, goes
 * under the keyboard, and Safari scrolls the whole view to bring the box
 * back, taking the chat's header off the top. window.visualViewport says
 * which part is still visible, so while the keyboard is up the chat is
 * pinned to exactly that part: header at its top, message box just above
 * the keyboard. The latest messages stay in view if they were in view.
 *
 * Where the page itself shrinks for the keyboard (Android's browsers and
 * app web views) the visible part is the whole page, so nothing changes;
 * nor on computers, nor when the page is pinch-zoomed. Without
 * visualViewport it does nothing.
 *
 * While pinned the element has the class `is-keyboard-open` (its stylesheet
 * drops the home-indicator padding under the message box, now behind the
 * keyboard).
 */

// More hidden than this is a keyboard, not a browser toolbar.
const KEYBOARD_MIN = 120;
// "In view": the list was scrolled to within this of its end.
const NEAR_END = 80;

/** What the keyboard covers, in CSS pixels (0 when none, or not measurable). */
export function keyboardCover(vv = typeof window !== 'undefined' ? window.visualViewport : null) {
  if (!vv || vv.scale > 1.05) return 0;
  const layout = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const hidden = layout - vv.height;
  return hidden > KEYBOARD_MIN ? hidden : 0;
}

export default function useKeyboardInset(rootRef, { active = true, scrollerRef } = {}) {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const root = rootRef.current;
    if (!active || !vv || !root) return undefined;

    let frame = 0;
    let pinned = false;
    // Whether the list was at its end before this change (measured on each
    // scroll of it: by a resize it is already the new, shorter list).
    let atEnd = true;
    const scroller = () => scrollerRef?.current || null;
    const measureEnd = () => {
      const s = scroller();
      atEnd = !s || s.scrollHeight - s.scrollTop - s.clientHeight < NEAR_END;
    };

    const unpin = () => {
      pinned = false;
      root.style.top = '';
      root.style.bottom = '';
      root.style.height = '';
      root.style.minHeight = '';
      root.style.maxHeight = '';
      root.classList.remove('is-keyboard-open');
    };

    const apply = () => {
      frame = 0;
      const fixed = getComputedStyle(root).position === 'fixed';
      const cover = fixed ? keyboardCover(vv) : 0;
      const keep = atEnd;
      if (cover) {
        root.style.top = `${Math.max(0, vv.offsetTop)}px`;
        root.style.bottom = 'auto';
        root.style.height = `${vv.height}px`;
        // A min-height meant for the page (the support chat has one) must
        // not push the message box back under the keyboard.
        root.style.minHeight = '0px';
        root.style.maxHeight = 'none';
        root.classList.add('is-keyboard-open');
        pinned = true;
      } else if (pinned) {
        unpin();
      } else {
        return;
      }
      if (keep) {
        const s = scroller();
        if (s) s.scrollTop = s.scrollHeight;
        atEnd = true;
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    measureEnd();
    // Scroll events do not bubble, but the root sees them on the way down:
    // the list can come and go (a chat still loading) without a new listener.
    root.addEventListener('scroll', measureEnd, { capture: true, passive: true });
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    // Opened with the keyboard already up (a chat picked while typing a search).
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', measureEnd, { capture: true });
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      unpin();
    };
  }, [rootRef, scrollerRef, active]);
}
