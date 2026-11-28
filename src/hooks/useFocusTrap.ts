import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.closest('[aria-hidden="true"]') &&
      // Skip controls hidden by CSS (not available in every browser or in jsdom).
      (typeof el.checkVisibility !== 'function' || el.checkVisibility()),
  );
}

/**
 * Keep keyboard focus inside `ref` while it is mounted: focus moves in on open, Tab and
 * Shift+Tab wrap around, Esc calls `onClose`, and focus returns to where it was on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // An element with autoFocus is already focused by React; otherwise the first control.
    if (!node.contains(document.activeElement)) (focusables(node)[0] ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(node);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        e.preventDefault();
        node.focus();
      } else if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [ref]);
}
