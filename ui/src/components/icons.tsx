import type { SVGProps } from 'react';

/**
 * Lucide-style minimal icons (stroke=1.5). Inlined as SVG so the bundle
 * doesn't pay for a full icon library when we only need ~20 glyphs.
 */

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'fill' | 'stroke'> {
  size?: number;
  stroke?: number;
  fill?: string;
}

function Icon({ size = 16, stroke = 1.5, fill = 'none', children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconLock = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>
);
export const IconUnlock = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></Icon>
);
export const IconCalendar = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Icon>
);
export const IconClock = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>
);
export const IconTrending = (p: IconProps) => (
  <Icon {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></Icon>
);
export const IconBars = (p: IconProps) => (
  <Icon {...p}><path d="M3 3v18h18" /><rect x="7" y="13" width="3" height="6" /><rect x="12" y="9" width="3" height="10" /><rect x="17" y="5" width="3" height="14" /></Icon>
);
export const IconClaim = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14" /><polyline points="6 13 12 19 18 13" /><line x1="4" y1="22" x2="20" y2="22" /></Icon>
);
export const IconCopy = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>
);
export const IconExternal = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></Icon>
);
export const IconInfo = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></Icon>
);
export const IconWallet = (p: IconProps) => (
  <Icon {...p}><path d="M20 12V8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" /><path d="M22 12h-4a2 2 0 1 0 0 4h4" /></Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>
);
export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}><polyline points="9 18 15 12 9 6" /></Icon>
);
export const IconChevronDown = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><polyline points="6 9 12 15 18 9" /></Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><polyline points="20 6 9 17 4 12" /></Icon>
);
export const IconSun = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></Icon>
);
export const IconMoon = (p: IconProps) => (
  <Icon {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Icon>
);
export const IconGitHub = (p: IconProps) => (
  <Icon {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></Icon>
);
export const IconAdd = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
);
export const IconStairs = (p: IconProps) => (
  <Icon {...p}><path d="M3 20h4v-4h4v-4h4V8h4V4" /></Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Icon>
);
export const IconAlert = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>
);
export const IconX = (p: IconProps) => (
  <Icon size={p.size ?? 14} {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
);
