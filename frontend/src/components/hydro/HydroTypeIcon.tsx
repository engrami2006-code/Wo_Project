import type { HydroSystemType } from '../../types/api';
import { cn } from '../../utils/cn';

/** Small pictograms for each hydroponic system type (24×24, stroke-based like the icon set). */
export function HydroTypeIcon({ type, className }: { type: HydroSystemType | string; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: cn('h-5 w-5', className),
    'aria-hidden': true,
  };
  switch (type) {
    case 'NFT': // sloped gully with a thin nutrient film
      return (
        <svg {...common}>
          <path d="M3 9l18 4" />
          <path d="M3 12l18 4" />
          <path d="M5 10.6c2 .2 4 .6 6 1.1" strokeOpacity=".55" />
          <path d="M7 9.4V6.5M12 10.5V7.5M17 11.6V8.7" />
          <path d="M6 6.5c.6-1 1.4-1 2 0M11 7.5c.6-1 1.4-1 2 0M16 8.7c.6-1 1.4-1 2 0" />
        </svg>
      );
    case 'DWC': // tank with air bubbles under a net pot
      return (
        <svg {...common}>
          <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M9 8l1 4h4l1-4" />
          <path d="M12 3v5" />
          <circle cx="8" cy="17" r=".8" />
          <circle cx="12" cy="15.5" r=".8" />
          <circle cx="15.5" cy="17.5" r=".8" />
        </svg>
      );
    case 'EBB_FLOW': // flood tray with up/down flow
      return (
        <svg {...common}>
          <path d="M3 13h18v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M8 3v7M5.5 7.5L8 10l2.5-2.5" />
          <path d="M16 10V3M13.5 5.5L16 3l2.5 2.5" />
          <path d="M5 15.5h14" strokeOpacity=".5" />
        </svg>
      );
    case 'DRIP': // emitter line with a drop
      return (
        <svg {...common}>
          <path d="M3 6h18" />
          <path d="M8 6v3M16 6v3" />
          <path d="M8 11.5c-1 1.4-1.6 2.3-1.6 3a1.6 1.6 0 0 0 3.2 0c0-.7-.6-1.6-1.6-3z" />
          <path d="M16 11.5c-1 1.4-1.6 2.3-1.6 3a1.6 1.6 0 0 0 3.2 0c0-.7-.6-1.6-1.6-3z" />
          <path d="M4 21h16" />
        </svg>
      );
    case 'WICK': // pot over reservoir joined by a wick
      return (
        <svg {...common}>
          <path d="M6 4h12l-1.5 6h-9z" />
          <path d="M12 10v5c0 1.5 1.2 2 2 3" />
          <path d="M4 14h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </svg>
      );
    case 'AEROPONICS': // roots in mist
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M12 6v5M12 9l-2.5 3M12 9l2.5 3" />
          <circle cx="6" cy="15" r=".7" />
          <circle cx="9" cy="17.5" r=".7" />
          <circle cx="12" cy="15.5" r=".7" />
          <circle cx="15" cy="18" r=".7" />
          <circle cx="18" cy="15" r=".7" />
          <path d="M4 21h16" />
        </svg>
      );
    case 'RAFT': // floating raft on a pond
      return (
        <svg {...common}>
          <path d="M5 11h14v2H5z" />
          <path d="M9 11V7M15 11V7" />
          <path d="M8 7c.6-1 1.4-1 2 0M14 7c.6-1 1.4-1 2 0" />
          <path d="M3 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
        </svg>
      );
    case 'SUBSTRATE': // grow bag with media grains
      return (
        <svg {...common}>
          <path d="M5 9h14l-1.5 11h-11z" />
          <path d="M12 9V4M12 6c1.5-1.6 3-1.6 4 0M12 6c-1.5-1.6-3-1.6-4 0" />
          <circle cx="9" cy="13" r=".7" />
          <circle cx="12" cy="15" r=".7" />
          <circle cx="15" cy="13" r=".7" />
          <circle cx="10.5" cy="17.5" r=".7" />
          <circle cx="13.5" cy="17.5" r=".7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
