/**
 * drawingManager.ts
 *
 * Pure-logic drawing manager for TradingView Lightweight Charts.
 * Manages trend lines, parallel channels,
 * text markers (candle-snapped), horizontal level labels, and deletion.
 *
 * Every public method is wrapped in try-catch for safety.
 *
 * DESIGN DECISIONS:
 * - Channel/Position: uses Series Primitives for BOUNDED translucent fills.
 *   This avoids the "infinite fill" issue of AreaSeries.
 * - Text tool: uses series markers (setMarkers) snapped to candle time.
 * - hLine: uses priceLine API on mainSeries.
 */

import { IChartApi, ISeriesApi, LineStyle, ISeriesPrimitive, ISeriesPrimitivePaneView, ISeriesPrimitivePaneRenderer } from 'lightweight-charts';

// ─── Drawing Primitive: Bounded Fill ───────────────────────────────────────
//
// Custom renderer that draws a filled polygon on the chart canvas.
// Used for parallel channels and position tool zones.

class BoundedFillRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(
    private _points: DrawingPoint[],
    private _color: string,
    private _series: ISeriesApi<any>,
    private _chart: IChartApi
  ) {}

  draw(target: any) {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const coords = this._points.map((p) => ({
        x: this._chart.timeScale().timeToCoordinate(p.time as any),
        y: this._series.priceToCoordinate(p.price),
      }));

      // Skip if any point is off-chart or invalid
      if (coords.some((c) => c.x === null || c.y === null)) return;

      ctx.beginPath();
      ctx.moveTo(coords[0].x!, coords[0].y!);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x!, coords[i].y!);
      }
      ctx.closePath();
      ctx.fillStyle = this._color;
      ctx.fill();
    });
  }
}

class BoundedFillPrimitive implements ISeriesPrimitive {
  private _series: ISeriesApi<any> | undefined;
  private _chart: IChartApi | undefined;

  constructor(
    private _points: DrawingPoint[],
    private _color: string
  ) {}

  attached(param: any) {
    this._series = param.series;
    this._chart = param.chart;
  }

  detached() {
    this._series = undefined;
    this._chart = undefined;
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    if (!this._series || !this._chart) return [];
    return [
      {
        renderer: () => new BoundedFillRenderer(this._points, this._color, this._series!, this._chart!),
      },
    ];
  }
}

// ─── Types ────────────────────────────────────────────────────────────────

export type DrawingType =
  | 'trendLine'
  | 'channel'
  | 'text'
  | 'hLine';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  metadata?: { label?: string };
  seriesRefs: ISeriesApi<any>[];
  /** For hLine: stores the priceLine reference on mainSeries */
  priceLineRef?: any;
  /** Custom drawing primitives attached to the series */
  primitives?: ISeriesPrimitive[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

let _idCounter = 0;

function generateId(): string {
  _idCounter += 1;
  return `drawing_${Date.now()}_${_idCounter}`;
}

function isValidPoint(p: unknown): p is DrawingPoint {
  if (!p || typeof p !== 'object') return false;
  const pt = p as DrawingPoint;
  return (
    typeof pt.time === 'number' &&
    isFinite(pt.time) &&
    typeof pt.price === 'number' &&
    isFinite(pt.price)
  );
}

function isValidPointArray(points: unknown[], requiredCount: number): points is DrawingPoint[] {
  if (!Array.isArray(points) || points.length < requiredCount) return false;
  for (let i = 0; i < requiredCount; i++) {
    if (!isValidPoint(points[i])) return false;
  }
  return true;
}

function sortByTime<T extends { time: any }>(a: T, b: T): number {
  return (a.time as number) - (b.time as number);
}

// ─── Drawing Manager Class ────────────────────────────────────────────────

export class DrawingManager {
  private chart: IChartApi | null = null;
  private mainSeries: ISeriesApi<any> | null = null;
  private drawings: Map<string, Drawing> = new Map();

  /** Bind the manager to a chart + main series instance. */
  setChart(chart: IChartApi | null, mainSeries?: ISeriesApi<any> | null): void {
    this.chart = chart;
    this.mainSeries = mainSeries ?? null;
  }

  /** Get all current drawings. */
  getDrawings(): Drawing[] {
    return Array.from(this.drawings.values());
  }

  /** Get drawing count. */
  getDrawingCount(): number {
    return this.drawings.size;
  }

  // ─── Helper: create a LineSeries ────────────────────────────────────

  private createLine(
    color: string,
    width: number,
    style: number,
    data: { time: any; value: number }[]
  ): ISeriesApi<'Line'> | null {
    if (!this.chart) return null;
    const s = this.chart.addLineSeries({
      color,
      lineWidth: width,
      lineStyle: style,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    s.setData(data.sort(sortByTime));
    return s;
  }

  // ─── Helper: rebuild markers on mainSeries ─────────────────────────

  private rebuildMarkers(): void {
    try {
      if (!this.mainSeries) return;

      const markers: any[] = [];

      for (const drawing of this.drawings.values()) {
        if (drawing.type !== 'text') continue;
        if (!drawing.points[0] || !isValidPoint(drawing.points[0])) continue;
        const label = drawing.metadata?.label ?? '';
        if (!label) continue;

        markers.push({
          time: drawing.points[0].time as any,
          position: 'aboveBar' as const,
          color: '#f59e0b',
          shape: 'circle' as const,
          text: label,
        });
      }

      markers.sort(sortByTime);
      this.mainSeries.setMarkers(markers);
    } catch (err) {
      console.error('[DrawingManager] rebuildMarkers error:', err);
    }
  }

  // ─── Trend Line ─────────────────────────────────────────────────────

  addTrendLine(p1: DrawingPoint, p2: DrawingPoint): string | null {
    try {
      if (!this.chart) return null;
      if (!isValidPoint(p1) || !isValidPoint(p2)) return null;

      const data = [
        { time: p1.time as any, value: p1.price },
        { time: p2.time as any, value: p2.price },
      ];
      const series = this.createLine('#3b82f6', 2, LineStyle.Solid, data);
      if (!series) return null;

      const id = generateId();
      this.drawings.set(id, {
        id,
        type: 'trendLine',
        points: [p1, p2],
        seriesRefs: [series],
      });
      return id;
    } catch (err) {
      console.error('[DrawingManager] addTrendLine error:', err);
      return null;
    }
  }

  // ─── Parallel Channel (with BOUNDED fill) ──────────────────────────

  addChannel(p1: DrawingPoint, p2: DrawingPoint, p3: DrawingPoint): string | null {
    try {
      if (!this.chart || !this.mainSeries) return null;
      if (!isValidPointArray([p1, p2, p3], 3)) return null;

      const priceOffset = p3.price - p1.price;

      // Edge 1: p1 → p2
      const edge1 = this.createLine('#8b5cf6', 1, LineStyle.Solid, [
        { time: p1.time as any, value: p1.price },
        { time: p2.time as any, value: p2.price },
      ]);

      // Edge 2: parallel, offset by priceOffset
      const edge2 = this.createLine('#8b5cf6', 1, LineStyle.Solid, [
        { time: p1.time as any, value: p1.price + priceOffset },
        { time: p2.time as any, value: p2.price + priceOffset },
      ]);

      // Midline (dashed)
      const mid = this.createLine('rgba(139,92,246,0.4)', 1, LineStyle.Dashed, [
        { time: p1.time as any, value: p1.price + priceOffset / 2 },
        { time: p2.time as any, value: p2.price + priceOffset / 2 },
      ]);

      if (!edge1 || !edge2 || !mid) return null;

      // Create bounded fill primitive
      const corners = [
        p1,
        p2,
        { time: p2.time, price: p2.price + priceOffset },
        { time: p1.time, price: p1.price + priceOffset },
      ];
      const fillPrimitive = new BoundedFillPrimitive(corners, 'rgba(139,92,246,0.15)');
      this.mainSeries.attachPrimitive(fillPrimitive);

      const id = generateId();
      this.drawings.set(id, {
        id,
        type: 'channel',
        points: [p1, p2, p3],
        seriesRefs: [edge1, edge2, mid],
        primitives: [fillPrimitive],
      });
      return id;
    } catch (err) {
      console.error('[DrawingManager] addChannel error:', err);
      return null;
    }
  }

  // ─── Text Tool (candle-snapped markers) ────────────────────────────

  addText(point: DrawingPoint, label: string): string | null {
    try {
      if (!this.chart || !this.mainSeries) return null;
      if (!isValidPoint(point)) return null;
      if (!label || typeof label !== 'string' || label.trim().length === 0) return null;

      const trimmed = label.trim().substring(0, 50);

      const id = generateId();
      this.drawings.set(id, {
        id,
        type: 'text',
        points: [point],
        metadata: { label: trimmed },
        seriesRefs: [],
      });

      this.rebuildMarkers();
      return id;
    } catch (err) {
      console.error('[DrawingManager] addText error:', err);
      return null;
    }
  }

  // ─── Horizontal Level Label ────────────────────────────────────────

  addHorizontalLine(point: DrawingPoint, label?: string): string | null {
    try {
      if (!this.chart || !this.mainSeries) return null;
      if (!isValidPoint(point)) return null;

      const title = label && typeof label === 'string' && label.trim().length > 0
        ? label.trim().substring(0, 30)
        : `$${point.price.toFixed(2)}`;

      const priceLine = this.mainSeries.createPriceLine({
        price: point.price,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });

      const id = generateId();
      this.drawings.set(id, {
        id,
        type: 'hLine',
        points: [point],
        metadata: { label: title },
        seriesRefs: [],
        priceLineRef: priceLine,
      });
      return id;
    } catch (err) {
      console.error('[DrawingManager] addHorizontalLine error:', err);
      return null;
    }
  }

  // ─── Delete Nearest ────────────────────────────────────────────────

  deleteNearest(clickPoint: DrawingPoint): string | null {
    try {
      if (!this.chart) return null;
      if (!isValidPoint(clickPoint)) return null;

      let nearestId: string | null = null;
      let nearestDist = Infinity;

      for (const [id, drawing] of this.drawings) {
        for (const pt of drawing.points) {
          if (!isValidPoint(pt)) continue;
          const dt = (clickPoint.time - pt.time) / 60;
          const dp = clickPoint.price - pt.price;
          const dist = Math.sqrt(dt * dt + dp * dp);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestId = id;
          }
        }
      }

      if (nearestId) {
        return this.removeDrawing(nearestId);
      }
      return null;
    } catch (err) {
      console.error('[DrawingManager] deleteNearest error:', err);
      return null;
    }
  }

  /** Remove a specific drawing by id. */
  removeDrawing(id: string): string | null {
    try {
      const drawing = this.drawings.get(id);
      if (!drawing) return null;
      const wasText = drawing.type === 'text';

      // Remove chart series
      for (const series of drawing.seriesRefs) {
        try {
          if (this.chart) this.chart.removeSeries(series);
        } catch {
          // Series might already be removed
        }
      }

      // Remove priceLine if present (for hLine drawings)
      if (drawing.priceLineRef && this.mainSeries) {
        try {
          this.mainSeries.removePriceLine(drawing.priceLineRef);
        } catch {
          // PriceLine might already be removed
        }
      }

      // Detach primitives if present
      if (drawing.primitives && this.mainSeries) {
        for (const primitive of drawing.primitives) {
          try {
            this.mainSeries.detachPrimitive(primitive);
          } catch {
            // Primitive might already be detached
          }
        }
      }

      this.drawings.delete(id);

      if (wasText) {
        this.rebuildMarkers();
      }

      return id;
    } catch (err) {
      console.error('[DrawingManager] removeDrawing error:', err);
      return null;
    }
  }

  // ─── Delete All ────────────────────────────────────────────────────

  deleteAll(): void {
    try {
      const ids = Array.from(this.drawings.keys());
      for (const id of ids) {
        this.removeDrawing(id);
      }
      this.drawings.clear();

      try {
        if (this.mainSeries) this.mainSeries.setMarkers([]);
      } catch {
        // mainSeries might be gone
      }
    } catch (err) {
      console.error('[DrawingManager] deleteAll error:', err);
    }
  }

  // ─── Cleanup (unmount) ─────────────────────────────────────────────

  destroyAll(): void {
    this.deleteAll();
    this.chart = null;
    this.mainSeries = null;
  }
}
