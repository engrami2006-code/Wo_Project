/**
 * Abstract field illustration drawn in SVG: crop rows converging toward the horizon,
 * an irrigation line and droplets. Purely decorative.
 */
export function HeroArt({ className }: { className?: string }) {
  const rows = Array.from({ length: 11 }, (_, i) => i);
  // droplets fall from the emitters of the irrigation line along the top edge
  const drops = [
    { x: 96, y: 82, s: 0.55 },
    { x: 196, y: 94, s: 0.7 },
    { x: 296, y: 80, s: 0.5 },
    { x: 396, y: 96, s: 0.75 },
    { x: 496, y: 84, s: 0.55 },
  ];
  return (
    <svg viewBox="0 0 560 420" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hero-row" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#10B981" stopOpacity="0.05" />
          <stop offset="1" stopColor="#10B981" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="hero-drop" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#E0F7FF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#0EA5E9" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id="hero-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="430" cy="214" r="120" fill="url(#hero-sun)" />
      {/* horizon */}
      <path d="M0 232 C 140 220, 420 220, 560 232" stroke="#A7F3D0" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
      {/* crop rows converging to a vanishing point */}
      {rows.map((i) => {
        const xb = -120 + i * 80;
        return (
          <path
            key={i}
            d={`M ${280 + (i - 5) * 6} 232 C ${280 + (i - 5) * 22} 300, ${xb + 60} 360, ${xb} 430`}
            stroke="url(#hero-row)"
            strokeWidth={2 + Math.abs(5 - i) * 0.25}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
      {/* plants along the rows */}
      {rows.flatMap((i) =>
        [0.35, 0.6, 0.85].map((tt, j) => {
          const xb = -120 + i * 80;
          const x0 = 280 + (i - 5) * 6;
          const x = x0 + (xb - x0) * tt;
          const y = 232 + (430 - 232) * tt;
          const r = 2.2 + tt * 4;
          return <circle key={`${i}-${j}`} cx={x} cy={y} r={r} fill="#34D399" fillOpacity={0.18 + tt * 0.35} />;
        }),
      )}
      {/* irrigation line */}
      <path d="M40 58 H 520" stroke="#99F6E4" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
      {[96, 196, 296, 396, 496].map((x) => (
        <circle key={x} cx={x} cy={58} r="3.5" fill="#99F6E4" fillOpacity="0.7" />
      ))}
      {/* droplets */}
      {drops.map((d, i) => (
        <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
          <path d="M0 -20 C -7 -9, -12 -3, -12 4 a12 12 0 0 0 24 0 C 12 -3, 7 -9, 0 -20 Z" fill="url(#hero-drop)" />
          <path d="M-5 4 a6 6 0 0 0 4 5" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
