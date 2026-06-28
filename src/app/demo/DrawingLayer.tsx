'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { cn } from '@/lib/utils';

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
}

interface DrawingLayerProps {
  chart: IChartApi;
  series: ISeriesApi<any>;
  symbol: string;
  activeTool: string;
  setActiveTool: (tool: string) => void;
}

export function DrawingLayer({ chart, series, symbol, activeTool, setActiveTool }: DrawingLayerProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tempDrawing, setTempDrawing] = useState<Drawing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [revision, setRevision] = useState(0);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(`drawings_v2_${symbol}`);
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
    if (drawings.length > 0 || localStorage.getItem(`drawings_v2_${symbol}`)) {
      localStorage.setItem(`drawings_v2_${symbol}`, JSON.stringify(drawings));
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

  const getCoords = useCallback((point: Point) => {
    const x = chart.timeScale().timeToCoordinate(point.time as any);
    const y = series.priceToCoordinate(point.price);
    return { x, y };
  }, [chart, series]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pointer') return;
    if (activeTool === 'eraser') {
      setDrawings([]);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(mouseX);
    const price = series.coordinateToPrice(mouseY);

    if (time === null || price === null) return;
    const unixTime = typeof time === 'number' ? time : (new Date(time).getTime() / 1000);

    // 1-Click Tools
    if (['hline', 'vline', 'text'].includes(activeTool)) {
      const newDrawing: Drawing = {
        id: Math.random().toString(36).substr(2, 9),
        type: activeTool,
        points: [{ time: unixTime, price }],
        color: '#3b82f6',
        text: activeTool === 'text' ? 'Analysis Note' : undefined
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('pointer');
      return;
    }

    // 2-Click Tools
    if (!tempDrawing) {
      setTempDrawing({
        id: 'temp',
        type: activeTool,
        points: [{ time: unixTime, price }, { time: unixTime, price }],
        color: '#3b82f6',
      });
    } else {
      const finalDrawing: Drawing = {
        ...tempDrawing,
        id: Math.random().toString(36).substr(2, 9),
        points: [tempDrawing.points[0], { time: unixTime, price }],
      };
      setDrawings(prev => [...prev, finalDrawing]);
      setTempDrawing(null);
      setActiveTool('pointer');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!tempDrawing) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(mouseX);
    const price = series.coordinateToPrice(mouseY);

    if (time === null || price === null) return;
    const unixTime = typeof time === 'number' ? time : (new Date(time).getTime() / 1000);

    setTempDrawing(prev => prev ? ({
      ...prev,
      points: [prev.points[0], { time: unixTime, price }]
    }) : null);
  };

  const renderDrawing = (drawing: Drawing) => {
    const p1 = getCoords(drawing.points[0]);
    const p2 = drawing.points[1] ? getCoords(drawing.points[1]) : p1;

    if (p1.x === null || p1.y === null) return null;

    const isSelected = selectedId === drawing.id;
    const strokeWidth = isSelected ? 2 : 1.5;

    switch (drawing.type) {
      case 'hline':
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            <line x1={0} y1={p1.y} x2={dimensions.width} y2={p1.y} stroke={drawing.color} strokeWidth={strokeWidth} className="cursor-pointer" />
          </g>
        );
      case 'vline':
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            <line x1={p1.x} y1={0} x2={p1.x} y2={dimensions.height} stroke={drawing.color} strokeWidth={strokeWidth} className="cursor-pointer" />
          </g>
        );
      case 'trend':
        if (p2.x === null || p2.y === null) return null;
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawing.color} strokeWidth={strokeWidth} className="cursor-pointer" />
          </g>
        );
      case 'arrow':
        if (p2.x === null || p2.y === null) return null;
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            <defs>
              <marker id={`arrowhead-${drawing.id}`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={drawing.color} />
              </marker>
            </defs>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawing.color} strokeWidth={strokeWidth} markerEnd={`url(#arrowhead-${drawing.id})`} className="cursor-pointer" />
          </g>
        );
      case 'ray':
        if (p2.x === null || p2.y === null) return null;
        // Extend line infinitely in direction of p2
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ex = p1.x + (dx / len) * 5000;
        const ey = p1.y + (dy / len) * 5000;
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            <line x1={p1.x} y1={p1.y} x2={ex} y2={ey} stroke={drawing.color} strokeWidth={strokeWidth} className="cursor-pointer" />
          </g>
        );
      case 'rect':
        if (p2.x === null || p2.y === null) return null;
        const rx = Math.min(p1.x, p2.x);
        const ry = Math.min(p1.y, p2.y);
        const rw = Math.abs(p1.x - p2.x);
        const rh = Math.abs(p1.y - p2.y);
        return (
          <rect key={drawing.id} x={rx} y={ry} width={rw} height={rh} fill={drawing.color + '22'} stroke={drawing.color} strokeWidth={strokeWidth} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }} />
        );
      case 'fib':
        if (p2.x === null || p2.y === null) return null;
        const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const range = drawing.points[1].price - drawing.points[0].price;
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawing.color} strokeWidth={0.5} strokeDasharray="5,5" />
            {ratios.map(r => {
              const fibPrice = drawing.points[0].price + range * r;
              const fibY = series.priceToCoordinate(fibPrice);
              if (fibY === null) return null;
              return (
                <g key={r}>
                  <line x1={Math.min(p1.x, p2.x)} y1={fibY} x2={Math.max(p1.x, p2.x)} y2={fibY} stroke={drawing.color} strokeWidth={1} opacity={0.6} />
                  <text x={Math.max(p1.x, p2.x) + 5} y={fibY + 4} fill={drawing.color} fontSize="10" className="select-none">{r.toFixed(3)}</text>
                </g>
              );
            })}
          </g>
        );
      case 'long':
      case 'short':
        if (p2.x === null || p2.y === null) return null;
        const isLong = drawing.type === 'long';
        const entry = p1.y;
        const target = p2.y;
        const stopY = entry + (entry - target); // Simple mirror for SL in v1
        const boxX = Math.min(p1.x, p2.x);
        const boxW = Math.abs(p1.x - p2.x);
        return (
          <g key={drawing.id} onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }} className="cursor-pointer">
            {/* Profit Zone */}
            <rect x={boxX} y={Math.min(entry, target)} width={boxW} height={Math.abs(entry - target)} fill={isLong ? '#10b98133' : '#ef444433'} stroke={isLong ? '#10b981' : '#ef4444'} strokeWidth={1} />
            {/* Loss Zone */}
            <rect x={boxX} y={Math.min(entry, stopY)} width={boxW} height={Math.abs(entry - stopY)} fill={isLong ? '#ef444433' : '#10b98133'} stroke={isLong ? '#ef4444' : '#10b981'} strokeWidth={1} />
            <line x1={boxX} y1={entry} x2={boxX + boxW} y2={entry} stroke="white" strokeWidth={1} />
          </g>
        );
      case 'text':
        return (
          <text key={drawing.id} x={p1.x} y={p1.y} fill="white" fontSize="12" className="select-none cursor-pointer font-bold" onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}>
            {drawing.text}
          </text>
        );
      default:
        return null;
    }
  };

  return (
    <svg ref={containerRef} className={cn("absolute inset-0 z-30 w-full h-full", activeTool !== 'pointer' ? "cursor-crosshair pointer-events-auto" : "pointer-events-none")} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onClick={() => activeTool === 'pointer' && setSelectedId(null)}>
      <g key={`revision-${revision}`}>
        {drawings.map(renderDrawing)}
        {tempDrawing && renderDrawing(tempDrawing)}
      </g>
    </svg>
  );
}
