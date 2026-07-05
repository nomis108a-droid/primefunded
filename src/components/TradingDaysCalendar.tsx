'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  TrendingUp,
  Info
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  addMonths, 
  subMonths,
  isSameDay,
  isToday as isActualToday
} from 'date-fns';
import { cn } from '@/lib/utils';
import { getTradeDate } from '@/lib/tradeUtils';

interface TradingDaysCalendarProps {
  accountId: string;
  trades: any[];
  minTradingDays: number;
}

/**
 * Institutional Trading Day Boundary Helper
 * Returns the window for a given physical day (Day start at 02:00 UTC)
 */
function getTradingDayWindow(date: Date) {
  const start = new Date(date);
  start.setUTCHours(2, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { start, end };
}

export function TradingDaysCalendar({ accountId, trades, minTradingDays }: TradingDaysCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // 1. Calendar Logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  // 2. Performance & Rule Calculation
  const stats = useMemo(() => {
    const tradeDaysSet = new Set<string>();
    const now = new Date();

    // Map trades to their trading days
    trades.forEach(t => {
      const openDate = getTradeDate(t.openedAt);
      if (!openDate) return;

      // Determine which 02:00 UTC window this openDate belongs to
      const d = new Date(openDate);
      const hours = d.getUTCHours();
      const windowStart = new Date(d);
      if (hours < 2) windowStart.setUTCDate(d.getUTCDate() - 1);
      windowStart.setUTCHours(2, 0, 0, 0);
      
      tradeDaysSet.add(windowStart.toISOString());
    });

    return {
      activeDaysCount: tradeDaysSet.size,
      tradeDaysSet
    };
  }, [trades]);

  const getDayData = (date: Date) => {
    const { start, end } = getTradingDayWindow(date);
    const now = new Date();
    
    const isPast = now > end;
    const isActive = now >= start && now <= end;
    const isFuture = now < start;

    const dayTrades = trades.filter(t => {
      const openDate = getTradeDate(t.openedAt);
      return openDate && openDate >= start && openDate < end;
    });

    const dayPnl = trades
      .filter(t => {
        if (t.status !== 'closed') return false;
        const closeDate = getTradeDate(t.closedAt);
        return closeDate && closeDate >= start && closeDate < end;
      })
      .reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);

    const hasTrade = dayTrades.length > 0;

    return {
      isPast,
      isActive,
      isFuture,
      hasTrade,
      dayPnl
    };
  };

  return (
    <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xl flex flex-col h-full">
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-sm font-headline font-bold flex items-center gap-2 text-white">
            <CalendarIcon className="w-4 h-4 text-primary" /> Trading Journal
          </CardTitle>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-white/5 rounded-md transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 min-w-[80px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-white/5 rounded-md transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
             <span className="text-muted-foreground">Session Consistency</span>
             <span className="text-primary">{stats.activeDaysCount} / {minTradingDays} Days</span>
          </div>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Trading day: 02:00 {"\u2192"} 02:00 UTC</p>
          <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
             <div 
               className="h-full bg-primary transition-all duration-500 shadow-[0_0_10px_rgba(17,179,245,0.4)]" 
               style={{ width: `${Math.min(100, (stats.activeDaysCount / (minTradingDays || 1)) * 100)}%` }} 
             />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
        <div className="grid grid-cols-7 border-y border-white/5 bg-secondary/20">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-tighter text-zinc-500">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 flex-1">
          {days.map((day, i) => {
            const { isPast, isActive, isFuture, hasTrade, dayPnl } = getDayData(day);
            const inMonth = isSameMonth(day, monthStart);
            
            return (
              <div 
                key={i} 
                className={cn(
                  "aspect-square p-1 border-r border-b border-white/5 flex flex-col items-center justify-between relative transition-colors",
                  !inMonth && "bg-black/20 opacity-20",
                  inMonth && "hover:bg-white/[0.02]"
                )}
              >
                <span className={cn(
                  "text-[10px] font-mono",
                  isActive ? "text-primary font-black underline decoration-2 underline-offset-4" : "text-zinc-500"
                )}>
                  {format(day, 'd')}
                </span>

                <div className="flex flex-col items-center gap-0.5">
                  {!isFuture && inMonth && (
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shadow-sm",
                      hasTrade 
                        ? isActive ? "bg-amber-500 animate-pulse" : "bg-emerald-500" 
                        : "bg-destructive/40"
                    )} />
                  )}
                  {dayPnl !== 0 && inMonth && (
                    <span className={cn(
                      "text-[8px] font-black tabular-nums tracking-tighter",
                      dayPnl > 0 ? "text-emerald-500" : "text-destructive"
                    )}>
                      {dayPnl > 0 ? '+' : ''}{dayPnl.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/5 bg-secondary/10 shrink-0">
           <div className="flex flex-wrap gap-4 justify-center">
             <LegendItem color="bg-emerald-500" label="Traded" />
             <LegendItem color="bg-destructive/40" label="Inactive" />
             <LegendItem color="bg-amber-500" label="Active Session" />
           </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-1.5 h-1.5 rounded-full", color)} />
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
  );
}
