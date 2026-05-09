import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class composer: dedupe + Tailwind-aware merge. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
