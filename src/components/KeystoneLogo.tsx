import React, { useId } from 'react';

interface Props {
  className?: string;
  /** Draw the small base bar under the arch (used on the large welcome logo). */
  base?: boolean;
}

/**
 * Keystone AI mark: an arch (what a keystone holds together), the keystone wedge at its top,
 * and a four-point spark for the AI. Gradient from violet to pink.
 */
export const KeystoneLogo: React.FC<Props> = ({ className = 'w-6 h-6', base = false }) => {
  const id = useId().replace(/:/g, '');
  const grad = `ks-grad-${id}`;
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Keystone AI" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={grad} x1="6" y1="6" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C6BFF" />
          <stop offset="0.55" stopColor="#D61EDC" />
          <stop offset="1" stopColor="#FF2D78" />
        </linearGradient>
      </defs>
      <path d="M9 40 V26 C9 16 15 10 24 10 C33 10 39 16 39 26 V40" fill="none" stroke={`url(#${grad})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 3.5 H30 L27.5 11 H20.5 Z" fill={`url(#${grad})`} stroke={`url(#${grad})`} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M24 19 L26.6 24.4 L32 27 L26.6 29.6 L24 35 L21.4 29.6 L16 27 L21.4 24.4 Z" fill={`url(#${grad})`} />
      {base && <rect x="15" y="43.5" width="18" height="3" rx="1.5" fill="#FF2D78" />}
    </svg>
  );
};
