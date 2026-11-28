import { useEffect, useId, useRef, useState } from 'react';
import { useServices } from '../context/ServiceContext';

/**
 * Category input with suggestions from the categories already in use. Same size as the other
 * fields: at least 44 px tall and 16 px text on phones and tablets, so iOS does not zoom in.
 */
export default function CategoryCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { services } = useServices();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))].sort();
  const filtered = value.trim()
    ? categories.filter((c) => c.toLowerCase().includes(value.toLowerCase()))
    : categories;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <label htmlFor={inputId} className="text-xs text-gray-400 mb-1 block">
        Category
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type or select category"
        className="w-full min-h-11 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-base sm:text-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg bg-surface-700 border border-surface-600/60 shadow-lg">
          {filtered.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onChange(cat);
                setOpen(false);
              }}
              className="w-full min-h-11 text-left px-3 py-2 text-base sm:text-sm text-gray-200 hover:bg-surface-600 transition-colors"
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
