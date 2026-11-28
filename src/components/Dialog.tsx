import { useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Width from the `sm` breakpoint up; below it the dialog fills the screen. */
  size?: 'sm' | 'md';
}

/**
 * Modal dialog: labelled by its title, traps focus, closes with Esc, the close button or a click
 * on the backdrop. Full-screen on phones, a centred panel from the `sm` breakpoint (640 px) up.
 */
export default function Dialog({ title, onClose, children, size = 'md' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto bg-surface-800 sm:border sm:border-surface-600/60 sm:rounded-xl shadow-2xl sm:mx-4 p-5 sm:p-6 focus:outline-none ${
          size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md'
        }`}
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-100 mb-4 pr-10">
          {title}
        </h2>
        {children}
        {/* Last in the tab order, so focus starts on the first field; shown top right. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
        >
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
