import { useState } from 'react';

const ICON_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png';

const COLORS = [
  'bg-cyan-700', 'bg-violet-700', 'bg-emerald-700', 'bg-rose-700',
  'bg-amber-700', 'bg-blue-700', 'bg-pink-700', 'bg-teal-700',
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
}

export default function ServiceIcon({ slug, name, size = 48 }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed || !slug) {
    const letter = name.charAt(0).toUpperCase() || '?';
    return (
      <div
        className={`${colorFor(name)} rounded-lg flex items-center justify-center text-white font-bold shrink-0`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {letter}
      </div>
    );
  }

  // If slug is already a full URL, use it directly (fixes double-CDN bug)
  const src = slug.startsWith('http://') || slug.startsWith('https://')
    ? slug
    : `${ICON_CDN}/${slug}.png`;

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="rounded-lg object-contain shrink-0"
      onError={() => setFailed(true)}
    />
  );
}
