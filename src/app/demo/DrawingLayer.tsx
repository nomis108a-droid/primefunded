'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { cn } from '@/lib/utils';

export interface Point {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: 'trend' | 'hline' | 'vline' | 'ray' | 'rect' | 'fib' | 'long' | 'short' | 'text' | 'arrow' | 'priceLabel' | 'srZone' | 'sdZone';
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

  // Load drawings from local storage
  useEffect(() => {
    const saved = localStorage.getItem(`drawings_${symbol}`);
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

  // Save drawings to local storage
  useEffect(() => {
    if (drawings.length > 0 || localStorage.getItem(`drawings_${symbol}`)) {
      localStorage.setItem(`drawings_${symbol}`, JSON.stringify(drawings));
    }
  }, [drawings, symbol]);

  // Handle Resize and Chart Changes
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

    // Logic for single-click tools
    if (activeTool === 'hline') {
      const newDrawing: Drawing = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'hline',
        points: [{ time: unixTime, price }],
        color: '#ffffff',
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('pointer');
      return;
    }

    // Logic for multi-click tools (Trend, Rect)
    if (!tempDrawing) {
      setTempDrawing({
        id: 'temp',
        type: activeTool as any,
        points: [{ time: unixTime, price }, { time: unixTime, price }],
        color: '#3b82f6',
      });
    } else {
      // Second click completes the drawing
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
    const strokeWidth = isSelected ? 2 : 1;

    switch (drawing.type) {
      case 'hline':
        return (
          <line
            key={drawing.id}
            x1={0}
            y1={p1.y}
            x2={dimensions.width}
            y2={p1.y}
            stroke={drawing.color}
            strokeWidth={strokeWidth}
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}
          />
        );
      case 'trend':
        if (p2.x === null || p2.y === null) return null;
        return (
          <line
            key={drawing.id}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={drawing.color}
            strokeWidth={strokeWidth}
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}
          />
        );
      case 'rect':
        if (p2.x === null || p2.y === null) return null;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p1.x - p2.x);
        const h = Math.abs(p1.y - p2.y);
        return (
          <rect
            key={drawing.id}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={drawing.color + '22'}
            stroke={drawing.color}
            strokeWidth={strokeWidth}
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setSelectedId(drawing.id); }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <svg
      ref={containerRef}
      className={cn(
        "absolute inset-0 z-30 w-full h-full",
        activeTool !== 'pointer' ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onClick={() => activeTool === 'pointer' && setSelectedId(null)}
    >
      <g key={`revision-${revision}`}>
        {drawings.map(renderDrawing)}
        {tempDrawing && renderDrawing(tempDrawing)}
      </g>
    </svg>
  );
}
