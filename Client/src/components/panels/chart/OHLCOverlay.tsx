/**
 * OHLCOverlay.tsx
 *
 * Displays O, H, L, C values in the top-left corner of the chart.
 * The overlay element is rendered by React but its CONTENT is updated
 * imperatively via a forwarded ref (no re-renders on hover).
 *
 * The parent (ChartPanel) is responsible for subscribing to
 * chart.subscribeCrosshairMove and calling updateOHLC / clearOHLC
 * using the stable local `mainSeries` reference — this avoids the
 * Map key mismatch that occurs when passing series refs through props.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';

// ─── Public API ────────────────────────────────────────────────────────────

export interface OHLCOverlayHandle {
  /** Feed a new OHLC snapshot to display. */
  update(o: number, h: number, l: number, c: number, darkMode: boolean): void;
  /** Hide the overlay (cursor has left the chart). */
  clear(): void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const OHLCOverlay = forwardRef<OHLCOverlayHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    update(o, h, l, c, darkMode) {
      const el = containerRef.current;
      if (!el) return;
      el.style.opacity = '1';

      const isUp = c >= o;
      const valueColor = isUp
        ? (darkMode ? '#22c55e' : '#16a34a')
        : (darkMode ? '#ef4444' : '#dc2626');
      const labelColor = darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
      const change = c - o;
      const changePct = o !== 0 ? (change / o) * 100 : 0;
      const sign = change >= 0 ? '+' : '';

      el.innerHTML =
        `<span style="color:${labelColor}">O</span>` +
        `<span style="color:${valueColor}">&thinsp;${o.toFixed(2)}</span>` +
        `<span style="color:${labelColor}; margin-left:10px">H</span>` +
        `<span style="color:${valueColor}">&thinsp;${h.toFixed(2)}</span>` +
        `<span style="color:${labelColor}; margin-left:10px">L</span>` +
        `<span style="color:${valueColor}">&thinsp;${l.toFixed(2)}</span>` +
        `<span style="color:${labelColor}; margin-left:10px">C</span>` +
        `<span style="color:${valueColor}">&thinsp;${c.toFixed(2)}</span>` +
        `<span style="color:${valueColor}; margin-left:14px; font-size:11px; opacity:0.8">` +
        `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)</span>`;
    },
    clear() {
      const el = containerRef.current;
      if (!el) return;
      el.style.opacity = '0';
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 10,
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: '18px',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: 0,
        transition: 'opacity 0.12s ease',
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
      }}
    />
  );
});

OHLCOverlay.displayName = 'OHLCOverlay';
