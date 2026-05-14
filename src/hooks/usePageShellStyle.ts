import type { CSSProperties } from 'react';
import { useIsMobile } from './useIsMobile';

/** Consistent outer page padding and vertical rhythm for desktop vs mobile. */
export function usePageShellStyle(opts: {
  maxWidth: number;
  gap: number;
  /** Default `24px 32px`. Use e.g. `24px 28px` (Team) or `32px` (Import). */
  paddingDesktop?: string;
}): CSSProperties {
  const isMobile = useIsMobile();
  const padding = isMobile ? 16 : (opts.paddingDesktop ?? '24px 32px');
  const gap = isMobile ? Math.max(16, opts.gap - 4) : opts.gap;
  return {
    padding,
    maxWidth: opts.maxWidth,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap,
  };
}
