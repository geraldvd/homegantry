import { cardElements } from './keyboard';

/**
 * Keep keyboard focus on the page when a card goes away (hiding a service removes its card, and
 * focus would fall back to <body>). Call `expectCardRemoval` just before the card is removed and
 * `restoreFocusAfterRemoval` after each render: once the card is gone, focus moves to the next
 * card in reading order, else the previous one, else the main landmark.
 */
let pending: { id: string; next?: string; prev?: string } | null = null;

function cardById(id: string | undefined): HTMLElement | undefined {
  return id === undefined ? undefined : cardElements().find((c) => c.dataset.id === id);
}

export function expectCardRemoval(id: string): void {
  const cards = cardElements();
  const i = cards.findIndex((c) => c.dataset.id === id);
  if (i === -1) return;
  pending = { id, next: cards[i + 1]?.dataset.id, prev: cards[i - 1]?.dataset.id };
}

/** The removal did not happen (the request failed): forget it. */
export function cancelCardRemoval(id: string): void {
  if (pending?.id === id) pending = null;
}

export function restoreFocusAfterRemoval(): void {
  if (!pending || cardById(pending.id)) return;
  const { next, prev } = pending;
  pending = null;
  // Only when focus was lost with the card: never take it from where the user moved it.
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  const target = cardById(next) ?? cardById(prev) ?? document.getElementById('main');
  target?.focus();
}
