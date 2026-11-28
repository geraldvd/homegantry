import { useState } from 'react';
import { useIconSource } from '../context/IconSourceContext';
import { iconCandidates } from '../lib/icons';

const COLORS = [
  'bg-cyan-700',
  'bg-violet-700',
  'bg-emerald-700',
  'bg-rose-700',
  'bg-amber-700',
  'bg-blue-700',
  'bg-pink-700',
  'bg-teal-700',
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Props {
  slug: string;
  name: string;
  size?: number;
  /** Next to the visible name (cards, group headings): hidden from screen readers. */
  decorative?: boolean;
}

export default function ServiceIcon({ slug, name, size = 48, decorative = false }: Props) {
  const source = useIconSource();
  const candidates = iconCandidates(slug, source);
  // Remember which URL failed rather than an index, so a changed icon or source starts over.
  const [failed, setFailed] = useState<readonly string[]>([]);
  const src = candidates.find((url) => !failed.includes(url));

  if (!src) {
    const letter = name.charAt(0).toUpperCase() || '?';
    return (
      <div
        aria-hidden={decorative || undefined}
        className={`${colorFor(name)} rounded-lg flex items-center justify-center text-white font-bold shrink-0`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={decorative ? '' : name}
      width={size}
      height={size}
      className="rounded-lg object-contain shrink-0"
      onError={() => setFailed((urls) => [...urls, src])}
    />
  );
}
