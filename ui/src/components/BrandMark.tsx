interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 22 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
      <line x1="12" y1="16.5" x2="12" y2="18.5" />
    </svg>
  );
}
