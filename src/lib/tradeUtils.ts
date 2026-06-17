
import { differenceInSeconds, isValid } from 'date-fns';

/**
 * Institutional temporal helper: Resolves dates from multiple formats (Number, Firestore Timestamp, String)
 */
export const getTradeDate = (time: any) => {
  if (!time) return null;
  let date;
  if (typeof time === 'number') date = new Date(time * 1000);
  else if (time && typeof time.toDate === 'function') date = time.toDate();
  else date = new Date(time);
  
  if (!date || isNaN(date.getTime())) return null;
  return date;
};

/**
 * Calculates absolute holding time in seconds
 */
export const calculateHoldingTimeSeconds = (open: any, close: any) => {
  const openDate = getTradeDate(open);
  const closeDate = getTradeDate(close);
  if (!openDate || !closeDate) return 0;
  return Math.abs(differenceInSeconds(closeDate, openDate));
};

/**
 * Human-readable duration string for UI
 */
export const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

/**
 * Core Algorithm: Matches Entry/Exit deals to reconstruct positions and compute risk metrics.
 */
export function enrichTrades(trades: any[], defaultLogin: string = 'N/A') {
  if (!trades || trades.length === 0) return [];
  
  const sorted = [...trades].sort((a, b) => {
    const dateA = getTradeDate(a.time || a.date);
    const dateB = getTradeDate(b.time || b.date);
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
  });

  const merged = [];
  const processedTickets = new Set();

  for (const trade of sorted) {
    const ticketId = String(trade.id || trade.ticket);
    if (processedTickets.has(ticketId)) continue;
    
    const profit = trade.pnl || trade.profit || 0;
    if (profit !== 0) {
      const closeDate = getTradeDate(trade.time || trade.date);
      
      const partner = sorted.find(t => {
        const tId = String(t.id || t.ticket);
        return !processedTickets.has(tId) &&
          t.symbol === trade.symbol &&
          (parseFloat(String(t.lots || t.volume)).toFixed(2) === parseFloat(String(trade.lots || trade.volume)).toFixed(2)) &&
          (t.pnl || t.profit || 0) === 0 &&
          (getTradeDate(t.time || t.date)?.getTime() || 0) < (closeDate?.getTime() || 0);
      });

      if (partner) {
        const durationSec = calculateHoldingTimeSeconds(partner.time || partner.date, trade.time || trade.date);
        merged.push({
          ...trade,
          id: ticketId,
          openTime: partner.time || partner.date,
          closeTime: trade.time || trade.date,
          type: partner.type, // Use entry direction
          lots: trade.lots || trade.volume,
          pnl: profit,
          login: trade.login || defaultLogin,
          durationSeconds: durationSec,
          duration: formatDuration(durationSec),
          matched: true
        });
        processedTickets.add(ticketId);
        processedTickets.add(String(partner.id || partner.ticket));
      } else {
        merged.push({
          ...trade,
          id: ticketId,
          openTime: null,
          closeTime: trade.time || trade.date,
          lots: trade.lots || trade.volume,
          pnl: profit,
          login: trade.login || defaultLogin,
          durationSeconds: 0,
          duration: '—',
          matched: false
        });
        processedTickets.add(ticketId);
      }
    }
  }

  // Add remaining open positions
  for (const trade of sorted) {
    const ticketId = String(trade.id || trade.ticket);
    if (!processedTickets.has(ticketId)) {
      merged.push({
        ...trade,
        id: ticketId,
        openTime: trade.time || trade.date,
        closeTime: null,
        pnl: trade.pnl || trade.profit || 0,
        lots: trade.lots || trade.volume,
        login: trade.login || defaultLogin,
        durationSeconds: 0,
        duration: '—',
        matched: false
      });
      processedTickets.add(ticketId);
    }
  }
  
  return merged.sort((a, b) => {
    const dateA = getTradeDate(a.closeTime || a.openTime);
    const dateB = getTradeDate(b.closeTime || b.openTime);
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
  });
}
