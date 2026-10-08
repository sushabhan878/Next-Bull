import { createChart, IChartApi, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Crosshair, Grid, BarChart2,
  TrendingUp, GitBranch,
  Trash2, Eraser, Type, Minus, BarChart3, RotateCcw,
} from 'lucide-react';
import { useTradeWebSocket } from '../../hooks/useTrade';
import { DrawingManager, DrawingPoint } from './chart/drawingManager';
import { OHLCOverlay, OHLCOverlayHandle } from './chart/OHLCOverlay';

// ─── Types ────────────────────────────────────────────────────────────────

type ToolType =
  | 'cursor'
  | 'trendLine'
  | 'channel'
  | 'text'
  | 'hLine'
  | 'delete';

interface ChartPanelProps {
  darkMode: boolean;
  timeframe?: string;
  symbol: string;
}

interface PendingPromptState {
  tool: 'text' | 'hLine';
  point: DrawingPoint;
  x: number;
  y: number;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ChartPanel({ darkMode, timeframe = '1s', symbol }: ChartPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const seriesRef         = useRef<any>(null);
  const volumeSeriesRef   = useRef<any>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [chartType,  setChartType]  = useState<'candlestick' | 'line'>('candlestick');
  const [showGrid,      setShowGrid]      = useState(true);
  const [showVolume,    setShowVolume]    = useState<boolean>(
    () => localStorage.getItem('chart_showVolume') !== 'false'
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPromptState | null>(null);

  // Keep showVolume accessible inside chart useEffect without retriggering it
  const showVolumeRef = useRef(showVolume);

  // Refs for event handler access (avoid stale closures)
  const activeToolRef    = useRef<ToolType>(activeTool);
  const pendingPointsRef = useRef<DrawingPoint[]>([]);
  const drawingMgrRef    = useRef<DrawingManager>(new DrawingManager());
  const ohlcRef          = useRef<OHLCOverlayHandle>(null);

  // Keep darkMode accessible inside chart useEffect without re-running it
  const darkModeRef = useRef(darkMode);
  useEffect(() => { darkModeRef.current = darkMode; }, [darkMode]);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  const allCandlesRef  = useRef<any[]>([]);
  const loadedCountRef = useRef(0);
  const isFetchingRef  = useRef(false);

  // ─── Safe tool switch ──────────────────────────────────────────────

  const switchTool = useCallback((tool: ToolType) => {
    pendingPointsRef.current = [];
    setActiveTool(tool);
    setPendingPrompt(null);
  }, []);

  // ─── Escape key handler ────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pendingPointsRef.current = [];
        setActiveTool('cursor');
        setPendingPrompt(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Delete All handler ────────────────────────────────────────────

  const handleDeleteAll = useCallback(() => {
    try {
      drawingMgrRef.current.deleteAll();
    } catch {
      // Safety catch
    }
  }, []);

  // ─── Reset chart handler ───────────────────────────────────────────

  const handleResetChart = useCallback(() => {
    try {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } catch {
      // Safety catch
    }
  }, []);

  // ─── Live data handler ────────────────────────────────────────────

  const handleLiveTick = useCallback((liveData: any, isHistorical: boolean) => {
    if (!seriesRef.current || !liveData) return;

    const chunkSize = timeframe === '5s' ? 120 : 600;

    try {
      if (isHistorical && Array.isArray(liveData)) {
        allCandlesRef.current = liveData;

        const toTime = (c: any) => Math.floor(new Date(c.bucket_time).getTime() / 1000) as any;
        const initial = liveData.slice(-chunkSize);

        if (chartType === 'candlestick') {
          seriesRef.current.setData(initial.map((c: any) => ({
            time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close,
          })));
        } else {
          seriesRef.current.setData(initial.map((c: any) => ({
            time: toTime(c), value: c.close,
          })));
        }

        volumeSeriesRef.current?.setData(initial.map((c: any) => ({
          time:  toTime(c),
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
        })));

        loadedCountRef.current = initial.length;
        return;
      }

      const t = Math.floor(new Date(liveData.bucket_time).getTime() / 1000);

      if (chartType === 'candlestick') {
        seriesRef.current.update({
          time: t as any, open: liveData.open, high: liveData.high, low: liveData.low, close: liveData.close,
        });
      } else {
        seriesRef.current.update({ time: t as any, value: liveData.close });
      }

      volumeSeriesRef.current?.update({
        time: t as any, value: liveData.volume,
        color: liveData.close >= liveData.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
      });
    } catch (err) {
      console.error('Chart update failed:', err);
    }
  }, [chartType, timeframe]);

  useTradeWebSocket(symbol, timeframe, handleLiveTick);

  // ─── Create / recreate chart ──────────────────────────────────────

  useEffect(() => {
    if (!chartContainerRef.current) return;

    allCandlesRef.current  = [];
    loadedCountRef.current = 0;
    isFetchingRef.current  = false;
    pendingPointsRef.current = [];

    drawingMgrRef.current.destroyAll();

    const chunkSize = timeframe === '5s' ? 120 : 600;
    const gridColor = showGrid ? (darkMode ? '#1E1E1E' : '#e0e0e0') : 'transparent';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
      },
      grid: {
        vertLines: { color: gridColor, style: LineStyle.Solid },
        horzLines: { color: gridColor, style: LineStyle.Solid },
      },
      timeScale: {
        borderColor: darkMode ? '#1E1E1E' : '#e0e0e0',
        timeVisible: true,
        secondsVisible: true,
      },
      rightPriceScale: { borderColor: darkMode ? '#1E1E1E' : '#e0e0e0' },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
      watermark: { visible: false },
    });

    chartRef.current = chart;

    // Main series
    let mainSeries: any;
    if (chartType === 'candlestick') {
      mainSeries = chart.addCandlestickSeries({
        upColor:       darkMode ? '#22c55e' : '#16a34a',
        downColor:     darkMode ? '#ef4444' : '#dc2626',
        borderVisible: false,
        wickUpColor:   darkMode ? '#22c55e' : '#16a34a',
        wickDownColor: darkMode ? '#ef4444' : '#dc2626',
      });
    } else {
      mainSeries = chart.addLineSeries({ color: darkMode ? '#ffffff' : '#111111', lineWidth: 2 });
    }
    seriesRef.current = mainSeries;

    // Bind drawing manager to chart + main series
    drawingMgrRef.current.setChart(chart, mainSeries);

    // Volume series
    const volSeries = chart.addHistogramSeries({
      color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '',
    });
    volumeSeriesRef.current = volSeries;
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // Apply persisted visibility immediately (before data loads)
    volSeries.applyOptions({ visible: showVolumeRef.current });

    mainSeries.setData([]);
    volSeries.setData([]);

    // ─── Lazy-load on scroll ────────────────────────────────────────

    const loadMoreCandles = () => {
      if (isFetchingRef.current) return;
      const all    = allCandlesRef.current;
      const loaded = loadedCountRef.current;
      if (loaded >= all.length) return;

      isFetchingRef.current = true;
      setIsLoadingMore(true);

      const toTime       = (c: any) => Math.floor(new Date(c.bucket_time).getTime() / 1000) as any;
      const oldestIdx    = all.length - loaded;
      const newOldestIdx = Math.max(0, oldestIdx - chunkSize);
      const newSlice     = all.slice(newOldestIdx);

      const visibleRange = chart.timeScale().getVisibleRange();

      if (chartType === 'candlestick') {
        mainSeries.setData(newSlice.map((c: any) => ({
          time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close,
        })));
      } else {
        mainSeries.setData(newSlice.map((c: any) => ({
          time: toTime(c), value: c.close,
        })));
      }

      volSeries.setData(newSlice.map((c: any) => ({
        time:  toTime(c),
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
      })));

      if (visibleRange) {
        chart.timeScale().setVisibleRange(visibleRange);
      }

      loadedCountRef.current = newSlice.length;

      setTimeout(() => {
        isFetchingRef.current = false;
        setIsLoadingMore(false);
      }, 400);
    };

    const handleRangeChange = (range: any) => {
      if (!range) return;
      if (range.from <= 3) loadMoreCandles();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    // ─── Click handler (drawing tools) ──────────────────────────────

    const handleChartClick = (param: any) => {
      try {
        if (!param || !param.point || param.time == null) return;

        const price = mainSeries.coordinateToPrice(param.point.y);
        if (price == null || !isFinite(price)) return;

        const time = typeof param.time === 'number'
          ? param.time
          : Math.floor(new Date(param.time).getTime() / 1000);

        if (!isFinite(time)) return;

        const clickPoint: DrawingPoint = { time, price };
        const tool = activeToolRef.current;
        const mgr = drawingMgrRef.current;

        switch (tool) {
          case 'cursor':
            break;

          case 'trendLine': {
            pendingPointsRef.current.push(clickPoint);
            if (pendingPointsRef.current.length >= 2) {
              const [p1, p2] = pendingPointsRef.current;
              mgr.addTrendLine(p1, p2);
              pendingPointsRef.current = [];
            }
            break;
          }

          case 'channel': {
            pendingPointsRef.current.push(clickPoint);
            if (pendingPointsRef.current.length >= 3) {
              const [p1, p2, p3] = pendingPointsRef.current;
              mgr.addChannel(p1, p2, p3);
              pendingPointsRef.current = [];
            }
            break;
          }

          case 'text': {
            setPendingPrompt({
              tool: 'text',
              point: clickPoint,
              x: param.point.x,
              y: param.point.y,
            });
            break;
          }

          case 'hLine': {
            setPendingPrompt({
              tool: 'hLine',
              point: clickPoint,
              x: param.point.x,
              y: param.point.y,
            });
            break;
          }

          case 'delete': {
            mgr.deleteNearest(clickPoint);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Chart click handler error:', err);
      }
    };
    chart.subscribeClick(handleChartClick);

    // ─── OHLC on crosshair move ──────────────────────────────────────
    //
    // We subscribe here (not in a child component) so that `mainSeries`
    // is the exact same object the chart holds as a Map key.

    const handleCrosshairMove = (param: any) => {
      try {
        const overlay = ohlcRef.current;
        if (!overlay) return;

        if (!param || param.time == null) {
          // Cursor has left the chart
          overlay.clear();
          return;
        }

        // Try seriesData (v4.1+) then seriesPrices (older v4)
        let data: any = null;
        if (param.seriesData && typeof param.seriesData.get === 'function') {
          data = param.seriesData.get(mainSeries);
        }
        if (!data && param.seriesPrices && typeof param.seriesPrices.get === 'function') {
          data = param.seriesPrices.get(mainSeries);
        }

        if (
          data &&
          typeof data.open === 'number' && isFinite(data.open) &&
          typeof data.high === 'number' && isFinite(data.high) &&
          typeof data.low  === 'number' && isFinite(data.low)  &&
          typeof data.close === 'number' && isFinite(data.close)
        ) {
          overlay.update(data.open, data.high, data.low, data.close, darkModeRef.current);
        }
        // If no data for this tick, leave last display as-is
      } catch {
        // Silently ignore
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // ─── Resize ─────────────────────────────────────────────────────

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    window.addEventListener('resize', handleResize);

    // ─── Cleanup ────────────────────────────────────────────────────

    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.unsubscribeClick(handleChartClick); } catch { /* noop */ }
      try { chart.unsubscribeCrosshairMove(handleCrosshairMove); } catch { /* noop */ }
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange); } catch { /* noop */ }
      drawingMgrRef.current.destroyAll();
      try { chart.remove(); } catch { /* noop */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode, chartType, timeframe, symbol]);

  // ─── Volume visibility (no chart rebuild needed) ─────────────────

  useEffect(() => {
    showVolumeRef.current = showVolume;
    localStorage.setItem('chart_showVolume', String(showVolume));
    if (volumeSeriesRef.current) {
      try {
        volumeSeriesRef.current.applyOptions({ visible: showVolume });
      } catch {
        // series might not exist yet
      }
    }
  }, [showVolume]);

  // ─── Grid toggle without chart rebuild ────────────────────────────

  useEffect(() => {
    if (!chartRef.current) return;
    const color = showGrid ? (darkMode ? '#1E1E1E' : '#e0e0e0') : 'transparent';
    chartRef.current.applyOptions({
      grid: {
        vertLines: { color, style: LineStyle.Solid },
        horzLines: { color, style: LineStyle.Solid },
      },
    });
  }, [showGrid, darkMode]);

  // ─── Derived state ────────────────────────────────────────────────

  const cursorStyle = activeTool === 'cursor' ? 'default' : 'crosshair';

  // ─── Toolbar button helper ────────────────────────────────────────

  const ToolBtn = ({ tool, title, icon: Icon }: { tool: ToolType; title: string; icon: any }) => (
    <button
      onClick={() => switchTool(tool)}
      className={`p-1.5 rounded-md transition-all border ${
        activeTool === tool
          ? 'bg-main text-main border-white/20'
          : 'text-muted hover:text-main hover:bg-main/50 border-transparent'
      }`}
      title={title}
    >
      <Icon size={20} />
    </button>
  );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex w-full h-full bg-panel font-sans">
      {/* Left Toolbar — responsive and compact with hidden scrollbar */}
      <div className="shrink-0 border-r border-main flex flex-col items-center py-1 px-1 gap-0.5 bg-panel transition-colors overflow-y-auto max-h-full no-scrollbar">
        <ToolBtn tool="cursor"        title="Cursor"                     icon={Crosshair} />
        <ToolBtn tool="trendLine"     title="Trend Line (2 clicks)"     icon={TrendingUp} />
        <ToolBtn tool="channel"       title="Parallel Channel (3 clicks)" icon={GitBranch} />
        <ToolBtn tool="hLine"        title="Horizontal Level (click to place)" icon={Minus} />
        <ToolBtn tool="text"          title="Text Label (click to place)" icon={Type} />
        <ToolBtn tool="delete"        title="Delete Drawing (click nearest)" icon={Trash2} />

        {/* Delete All button — always visible, not a "tool" */}
        <button
          onClick={handleDeleteAll}
          className="p-1.5 rounded-md transition-all border text-muted hover:text-red-400 hover:bg-red-500/10 border-transparent"
          title="Delete All Drawings"
        >
          <Eraser size={20} />
        </button>

        <button
          onClick={() => setChartType(t => t === 'candlestick' ? 'line' : 'candlestick')}
          className={`p-1.5 rounded-md transition-all border ${chartType === 'line' ? 'bg-main text-main border-white/20' : 'text-muted hover:text-main hover:bg-main/50 border-transparent'}`}
          title="Toggle Chart Type"
        >
          <BarChart2 size={20} />
        </button>

        <button
          onClick={() => setShowVolume(v => !v)}
          className={`p-1.5 rounded-md transition-all border ${
            showVolume
              ? 'bg-main text-main border-white/20'
              : 'text-muted hover:text-main hover:bg-main/50 border-transparent'
          }`}
          title={showVolume ? 'Hide Volume' : 'Show Volume'}
        >
          <BarChart3 size={20} />
        </button>

        <button
          onClick={() => setShowGrid(g => !g)}
          className={`p-1.5 rounded-md transition-all border ${showGrid ? 'bg-main text-main border-white/20' : 'text-muted hover:text-main hover:bg-main/50 border-transparent'}`}
          title="Toggle Grid"
        >
          <Grid size={20} />
        </button>

        <button
          onClick={handleResetChart}
          className="p-1.5 rounded-md transition-all border text-muted hover:text-main hover:bg-main/50 border-transparent"
          title="Reset Chart"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      {/* Chart area */}
      <div className="relative flex-1 min-w-0 h-full">
        <div ref={chartContainerRef} style={{ cursor: cursorStyle }} className="w-full h-full" />

        {/* OHLC overlay — always mounted; hidden when not hovering */}
        {chartType === 'candlestick' && (
          <OHLCOverlay ref={ohlcRef} />
        )}

        {/* Loading indicator */}
        {isLoadingMore && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-panel/90 border border-main text-muted text-xs px-3 py-1 rounded-full pointer-events-none select-none">
            Loading older candles…
          </div>
        )}

        {/* Text Prompt Overlay */}
        {pendingPrompt && (
          <div 
            key={`${pendingPrompt.x}-${pendingPrompt.y}`}
            className="absolute z-50 bg-panel border border-main p-2 rounded shadow-lg flex gap-2 items-center"
            style={{ 
              left: pendingPrompt.x, 
              top: pendingPrompt.y,
              transform: 'translate(-50%, -100%)',
              marginTop: '-10px'
            }}
          >
            <input 
              id="chart-prompt-input"
              autoFocus
              type="text"
              placeholder={pendingPrompt.tool === 'text' ? "Enter text label..." : "Enter label (optional)..."}
              className="bg-main text-sm text-main px-2 py-1 rounded outline-none border border-transparent focus:border-white/20 w-40"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.currentTarget.value;
                  if (pendingPrompt.tool === 'text') {
                    if (val.trim()) drawingMgrRef.current.addText(pendingPrompt.point, val);
                  } else {
                    drawingMgrRef.current.addHorizontalLine(pendingPrompt.point, val.trim() || undefined);
                  }
                  setPendingPrompt(null);
                  setActiveTool('cursor');
                } else if (e.key === 'Escape') {
                  setPendingPrompt(null);
                }
              }}
            />
            <button 
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded transition-colors"
              onClick={() => {
                const input = document.getElementById('chart-prompt-input') as HTMLInputElement;
                if (!input) return;
                const val = input.value;
                if (pendingPrompt.tool === 'text') {
                  if (val.trim()) drawingMgrRef.current.addText(pendingPrompt.point, val);
                } else {
                  drawingMgrRef.current.addHorizontalLine(pendingPrompt.point, val.trim() || undefined);
                }
                setPendingPrompt(null);
                setActiveTool('cursor');
              }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
