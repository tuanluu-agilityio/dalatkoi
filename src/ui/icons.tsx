import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const SoundIcon = ({ on }: { on: boolean }) => (
  <Svg>
    <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5z" />
    {on ? (
      <>
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
        <path d="M18 6.8a7.4 7.4 0 0 1 0 10.4" />
      </>
    ) : (
      <path d="M16 9.5l5 5m0-5l-5 5" />
    )}
  </Svg>
);

export const WalkIcon = () => (
  <Svg>
    <circle cx="13" cy="4.6" r="1.6" />
    <path d="M9 21l2.2-6.2L9.5 12l.9-4.2 3 .4 1.6 3.3 3 1.3M11.2 14.8l3.1 2.2.9 4" />
  </Svg>
);

export const TourIcon = () => (
  <Svg>
    <rect x="3" y="7" width="12.5" height="10" rx="1.5" />
    <path d="M15.5 10.5L21 8v8l-5.5-2.5" />
  </Svg>
);

export const OrbitIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="2.2" />
    <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-22 12 12)" />
  </Svg>
);

export const QualityIcon = () => (
  <Svg>
    <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0" />
    <circle cx="16" cy="7" r="1.8" />
    <circle cx="9" cy="12" r="1.8" />
    <circle cx="18" cy="17" r="1.8" />
  </Svg>
);

export const FullscreenIcon = ({ on }: { on: boolean }) => (
  <Svg>{on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</Svg>
);

export const HelpIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9M12 16.8h0" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const SunIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6" />
  </Svg>
);

export const RainIcon = () => (
  <Svg>
    <path d="M7.5 15.5a4 4 0 0 1-.6-7.95 5.2 5.2 0 0 1 10.1 1.1A3.5 3.5 0 0 1 16.5 15.5z" />
    <path d="M9 18l-.8 2.2M12.4 18l-.8 2.2M15.8 18l-.8 2.2" />
  </Svg>
);

export const BoltIcon = () => (
  <Svg>
    <path d="M13 3.5L6.5 13.5h5l-1 7 6.5-10h-5z" />
  </Svg>
);
