'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

export interface Point {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: string;
  points: Point[];
  color: string;
  text?: string;
  locked?: boolean;
}

interface DrawingLayerProps {
  chart: IChartApi;
  series: ISeriesApi<any>;
  symbol: string;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  locked?: boolean;
  hidden?: boolean;
}

export function DrawingLayer({ chart, series, symbol, activeTool, setActiveTool, locked = false, hidden = false }: DrawingLayerProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tempDrawing, setTempDrawing] = useState<Drawing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [revision, setRevision] = useState(0);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(`drawings_v3_${symbol}`);
    if (saved) {
      try {
        setDrawings(JSON.parse(saved));
      } catch (e) {
        setDrawings([]);
      }
    } else {
      setDrawings([]);
    }
    setSelectedId(null);
    setTempDrawing(null);
  }, [symbol]);

  useEffect(() => {
    if (drawings.length > 0 || localStorage.getItem(`drawings_v3_${symbol}`)) {
      localStorage.setItem(`drawings_v3_${symbol}`, JSON.stringify(drawings));
    }
  }, [drawings, symbol]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current?.parentElement) {
        setDimensions({
          width: containerRef.current.parentElement.clientWidth,
          height: containerRef.current.parentElement.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    const handleChartChange = () => setRevision(prev => prev + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleChartChange);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleChartChange);
    };
  }, [chart]);

  // Handle Keyboard Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setDrawings(prev => prev.filter(d => d.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  useEffect(() => {
    if (activeTool === 'eraser') {
      setDrawings([]);
      setSelectedId(null);
      setActiveTool('crosshair');
    }
  }, [activeTool, setActiveTool]);

  const getCoords = useCallback((point: Point) => {
    const x = chart.timeScale().timeToCoordinate(point.time as any);
    const y = series.priceToCoordinate(point.price);
    return { x, y };
  }, [chart, series, revision]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (locked) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(mouseX);
    const price = series.coordinateToPrice(mouseY);

    if (time === null || price === null) return;
    const unixTime = typeof time === 'number' ? time : (new Date(time).getTime() / 1000);

    // If activeTool is crosshair, handle selection or deselection
    if (activeTool === 'crosshair') {
      // In crosshair mode, clicking empty space deselects
      // Children (drawings/handles) stop propagation to prevent this
      setSelectedId(null);
      return;
    }

    // Drag model for Tier 1 tools
    const newTemp: Drawing = {
      id: 'temp',
      type: activeTool,
      points: [{ time: unixTime, price }, { time: unixTime, price }],
      color: '#2962ff',
      text: activeTool === 'text' ? 'Analysis Note' : undefined
    };
    setTempDrawing(newTemp);
    setSelectedId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(mouseX);
    const price = series.coordinateToPrice(mouseY);

    if (time === null || price === null) return;
    const unixTime = typeof time === 'number' ? time : (new Date(time).getTime() / 1000);

    // Case 1: Creating new drawing (live preview)
    if (tempDrawing && !locked) {
      setTempDrawing(prev => prev ? ({
        ...prev,
        points: [prev.points[0], { time: unixTime, price }]
      }) : null);
    }

    // Case 2: Editing existing drawing (dragging a handle)
    if (selectedId && draggedPointIndex !== null && !locked) {
      setDrawings(prev => prev.map(d => {
        if (d.id === selectedId) {
          const newPoints = [...d.points];
          newPoints[draggedPointIndex] = { time: unixTime, price };
          return { ...d, points: newPoints };
        }
        return d;
      }));
    }
  };

  const handleMouseUp = () => {
    if (tempDrawing) {
      const finalDrawing: Drawing = {
        ...tempDrawing,
        id: Math.random().toString(36).substr(2, 9),
      };
      setDrawings(prev => [...prev, finalDrawing]);
      setTempDrawing(null);
      setSelectedId(finalDrawing.id);
      
      // Institutional behavior: return to crosshair after draw to allow manipulation
      setActiveTool('crosshair');
    }
    setDraggedPointIndex(null);
  };

  const getCursorClass = () => {
    if (locked) return 'cursor-default';
    if (activeTool === 'crosshair' || activeTool === 'dot') return 'cursor-crosshair';
    if (activeTool === 'text' || activeTool === 'note') return 'cursor-text';
    return 'cursor-cell';
  };

  const deleteDrawing = (id: string) => {
    setDrawings(prev => prev.filter(d => d.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const renderDrawing = (drawing: Drawing) => {
    const p1 = getCoords(drawing.points[0]);
    const p2 = drawing.points[1] ? getCoords(drawing.points[1]) : p1;

    if (p1.x === null || p1.y === null) return null;

    const isSelected = selectedId === drawing.id;
    const isTemp = drawing.id === 'temp';
    const strokeWidth = isSelected ? 3 : 2;
    const drawingColor = drawing.color || '#2962ff';

    const handleShapeMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!locked && !isTemp) {
        setSelectedId(drawing.id);
      }
    };

    const drawHandles = () => {
      if (!isSelected || locked || isTemp) return null;
      return drawing.points.map((p, idx) => {
        const coords = getCoords(p);
        if (coords.x === null || coords.y === null) return null;
        return (
          <circle
            key={`handle-${drawing.id}-${idx}`}
            cx={coords.x}
            cy={coords.y}
            r={6}
            fill="white"
            stroke={drawingColor}
            strokeWidth={2}
            className="cursor-move pointer-events-auto shadow-xl"
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggedPointIndex(idx);
              setSelectedId(drawing.id);
            }}
          />
        );
      });
    };

    const renderTools = () => {
      if (!isSelected || locked || isTemp) return null;
      return (
        <foreignObject x={p1.x + 15} y={p1.y - 45} width="40" height="40" className="pointer-events-auto">
          <button 
            onClick={(e) => { e.stopPropagation(); deleteDrawing(drawing.id); }}
            className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-red-500 hover:bg-zinc-700 transition-colors shadow-2xl"
          >
            <Trash2 size={16} />
          </button>
        </foreignObject>
      );
    };

    let shape = null;
    const commonProps = {
      stroke: drawingColor,
      strokeWidth: strokeWidth,
      className: cn("cursor-pointer pointer-events-auto", isTemp && "opacity-50"),
      onMouseDown: handleShapeMouseDown
    };

    // Invisible wide hit-area for easier selection
    const hitAreaProps = {
      stroke: "transparent",
      strokeWidth: 15,
      className: "cursor-pointer pointer-events-auto",
      onMouseDown: handleShapeMouseDown
    };

    switch (drawing.type) {
      case 'hline':
        shape = (
          <g>
            <line x1={0} y1={p1.y} x2={dimensions.width} y2={p1.y} {...hitAreaProps} />
            <line x1={0} y1={p1.y} x2={dimensions.width} y2={p1.y} {...commonProps} />
          </g>
        );
        break;
      case 'vline':
        shape = (
          <g>
            <line x1={p1.x} y1={0} x2={p1.x} y2={dimensions.height} {...hitAreaProps} />
            <line x1={p1.x} y1={0} x2={p1.x} y2={dimensions.height} {...commonProps} />
          </g>
        );
        break;
      case 'trend':
        if (p2.x === null || p2.y === null) break;
        shape = (
          <g>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} {...hitAreaProps} />
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} {...commonProps} />
          </g>
        );
        break;
      case 'arrow':
        if (p2.x === null || p2.y === null) break;
        shape = (
          <g onMouseDown={handleShapeMouseDown} className="cursor-pointer pointer-events-auto">
            <defs>
              <marker id={`arrowhead-${drawing.id}`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={drawingColor} />
              </marker>
            </defs>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawingColor} strokeWidth={strokeWidth} markerEnd={`url(#arrowhead-${drawing.id})`} />
          </g>
        );
        break;
      case 'ray':
        if (p2.x === null || p2.y === null) break;
        const rdx = p2.x - p1.x;
        const rdy = p2.y - p1.y;
        const rlen = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rlen > 0) {
          const rex = p1.x + (rdx / rlen) * 5000;
          const rey = p1.y + (rdy / rlen) * 5000;
          if (Number.isFinite(rex) && Number.isFinite(rey)) {
            shape = (
              <g>
                <line x1={p1.x} y1={p1.y} x2={rex} y2={rey} {...hitAreaProps} />
                <line x1={p1.x} y1={p1.y} x2={rex} y2={rey} {...commonProps} />
              </g>
            );
          }
        }
        break;
      case 'rect':
        if (p2.x === null || p2.y === null) break;
        const rx = Math.min(p1.x, p2.x);
        const ry = Math.min(p1.y, p2.y);
        const rw = Math.abs(p1.x - p2.x);
        const rh = Math.abs(p1.y - p2.y);
        shape = (
          <rect x={rx} y={ry} width={rw} height={rh} fill={drawingColor + '11'} {...commonProps} />
        );
        break;
      case 'circle':
        if (p2.x === null || p2.y === null) break;
        const radius = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        shape = (
          <circle cx={p1.x} cy={p1.y} r={radius} fill={drawingColor + '11'} {...commonProps} />
        );
        break;
      case 'fib':
        if (p2.x === null || p2.y === null) break;
        const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const range = drawing.points[1].price - drawing.points[0].price;
        shape = (
          <g className="cursor-pointer pointer-events-auto" onMouseDown={handleShapeMouseDown}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawingColor} strokeWidth={0.5} strokeDasharray="5,5" />
            {ratios.map(r => {
              const fibPrice = drawing.points[0].price + range * r;
              const fibY = series.priceToCoordinate(fibPrice);
              if (fibY === null) return null;
              return (
                <g key={r}>
                  <line x1={Math.min(p1.x, p2.x)} y1={fibY} x2={Math.max(p1.x, p2.x)} y2={fibY} stroke={drawingColor} strokeWidth={1} opacity={0.6} />
                  <text x={Math.max(p1.x, p2.x) + 5} y={fibY + 4} fill={drawingColor} fontSize="10" className="select-none font-bold">{r.toFixed(3)}</text>
                </g>
              );
            })}
          </g>
        );
        break;
      case 'long':
      case 'short':
        if (p2.x === null || p2.y === null) break;
        const isLong = drawing.type === 'long';
        const entry = p1.y;
        const target = p2.y;
        const stopY = entry + (entry - target);
        const boxX = Math.min(p1.x, p2.x);
        const boxW = Math.abs(p1.x - p2.x);
        shape = (
          <g onMouseDown={handleShapeMouseDown} className="cursor-pointer pointer-events-auto">
            <rect x={boxX} y={Math.min(entry, target)} width={boxW} height={Math.abs(entry - target)} fill={isLong ? '#10b98122' : '#ef444422'} stroke={isLong ? '#10b981' : '#ef4444'} strokeWidth={1} />
            <rect x={boxX} y={Math.min(entry, stopY)} width={boxW} height={Math.abs(entry - stopY)} fill={isLong ? '#ef444422' : '#10b98122'} stroke={isLong ? '#ef4444' : '#10b981'} strokeWidth={1} />
            <line x1={boxX} y1={entry} x2={boxX + boxW} y2={entry} stroke="white" strokeWidth={1} opacity={0.5} />
          </g>
        );
        break;
      case 'text':
        shape = (
          <text x={p1.x} y={p1.y} fill="white" fontSize="13" className="select-none cursor-pointer font-bold pointer-events-auto" onMouseDown={handleShapeMouseDown}>
            {drawing.text}
          </text>
        );
        break;
    }

    return (
      <g key={drawing.id}>
        {shape}
        {drawHandles()}
        {renderTools()}
      </g>
    );
  };

  if (hidden) return null;

  return (
    <svg 
      ref={containerRef} 
      className={cn(
        "absolute inset-0 z-30 w-full h-full", 
        (activeTool !== 'crosshair' || selectedId || tempDrawing || draggedPointIndex !== null) ? "pointer-events-auto" : "pointer-events-none",
        getCursorClass()
      )} 
      onMouseDown={handleMouseDown} 
      onMouseMove={handleMouseMove} 
      onMouseUp={handleMouseUp}
    >
      <g>
        {drawings.map(renderDrawing)}
        {tempDrawing && renderDrawing(tempDrawing)}
      </g>
    </svg>
  );
}
