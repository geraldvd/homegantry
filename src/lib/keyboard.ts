/** True while the user types somewhere: single-key shortcuts must not fire then. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes(target.type);
  }
  return false;
}

const CARD = '[data-card]';

/** Every card on the page in reading order (collapsed groups are not rendered). */
export function cardElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(CARD)];
}

export function cardOf(el: Element | null): HTMLElement | null {
  return el instanceof HTMLElement ? el.closest<HTMLElement>(CARD) : null;
}

function hasLayout(rect: DOMRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

/**
 * The card an arrow key moves to. Left/Right (and Home/End) follow reading order across groups.
 * Up/Down go to the nearest card in the row above or below; without a layout (or a grid row to
 * go to) they fall back to the previous or next card.
 */
export function targetCard(
  cards: readonly HTMLElement[],
  current: HTMLElement,
  key: string,
): HTMLElement | undefined {
  const i = cards.indexOf(current);
  if (i === -1) return cards[0];
  if (key === 'Home') return cards[0];
  if (key === 'End') return cards[cards.length - 1];
  if (key === 'ArrowRight') return cards[Math.min(i + 1, cards.length - 1)];
  if (key === 'ArrowLeft') return cards[Math.max(i - 1, 0)];
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return undefined;

  const down = key === 'ArrowDown';
  const fallback = cards[down ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0)];
  const from = current.getBoundingClientRect();
  if (!hasLayout(from)) return fallback;
  const centre = (r: DOMRect) => (r.left + r.right) / 2;
  let best: { el: HTMLElement; dy: number; dx: number } | undefined;
  for (const el of cards) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const dy = down ? r.top - from.bottom : from.top - r.bottom;
    if (dy < -1) continue; // not in a row below (or above)
    const dx = Math.abs(centre(r) - centre(from));
    if (!best || dy < best.dy - 1 || (Math.abs(dy - best.dy) <= 1 && dx < best.dx)) {
      best = { el, dy, dx };
    }
  }
  return best?.el ?? fallback;
}

/** Open a service link the same way a click on its card does. */
export function openLink(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}
