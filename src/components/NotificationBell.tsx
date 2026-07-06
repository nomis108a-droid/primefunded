'use client';

import { Bell, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';
import { useFirestore } from '@/firebase';
import { orderBy, limit, doc, updateDoc, writeBatch, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { useMemo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBell() {
  const { user } = useAuth();
  const db = useFirestore();
  const [isOpen, setIsOpen] = useState(false);
  const [localNotifications, setLocalNotifications] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !db) return;
    
    // 1. Personal Notifications
    const qNotif = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubNotif = onSnapshot(qNotif, (snap) => {
      setLocalNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Global Broadcasts
    const qBroad = query(
      collection(db, 'broadcasts'),
      orderBy('sentAt', 'desc'),
      limit(5)
    );
    const unsubBroad = onSnapshot(qBroad, (snap) => {
      setBroadcasts(snap.docs.map(d => ({ id: d.id, ...d.data(), isGlobal: true })));
    });

    return () => {
      unsubNotif();
      unsubBroad();
    };
  }, [user, db]);

  const mergedNotifications = useMemo(() => {
    const combined = [...localNotifications, ...broadcasts];
    return combined.sort((a, b) => {
      const timeA = (a.createdAt || a.sentAt)?.seconds || 0;
      const timeB = (b.createdAt || b.sentAt)?.seconds || 0;
      return timeB - timeA;
    }).slice(0, 10);
  }, [localNotifications, broadcasts]);

  const unreadCount = useMemo(() => 
    localNotifications.filter(n => !n.isRead).length
  , [localNotifications]);

  const handleMarkAsRead = async (id: string, isGlobal?: boolean) => {
    if (!user || isGlobal) return; // Global broadcasts are read-only alerts
    const ref = doc(db, 'users', user.uid, 'notifications', id);
    updateDoc(ref, { isRead: true });
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('isRead', '==', false)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { isRead: true });
    });
    await batch.commit();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-secondary/50 group">
          <Bell className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white border-2 border-background animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 bg-card border-border/50 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-secondary/20">
          <h4 className="text-xs font-black uppercase tracking-widest text-white">Notifications</h4>
          {unreadCount > 0 && (
            <button 
              onClick={handleMarkAllAsRead}
              className="text-[9px] uppercase font-black tracking-widest text-primary hover:text-white transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
          {mergedNotifications.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center opacity-40">
              <Bell className="w-8 h-8 mb-2 text-muted-foreground" />
              <p className="text-[10px] uppercase font-bold tracking-widest">No new alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {mergedNotifications.map((n) => (
                <div 
                  key={n.id} 
                  className={cn(
                    "p-4 transition-all cursor-pointer group relative",
                    n.isGlobal ? "bg-primary/10 border-l-2 border-primary" : (!n.isRead ? "bg-secondary/40 border-l-2 border-accent" : "hover:bg-secondary/20")
                  )}
                  onClick={() => handleMarkAsRead(n.id, n.isGlobal)}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <p className={cn("text-[11px] font-black uppercase tracking-tight", (n.isGlobal || !n.isRead) ? "text-white" : "text-muted-foreground")}>
                      {n.isGlobal && <span className="text-primary mr-1">📢</span>}
                      {n.title}
                    </p>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase whitespace-nowrap pt-0.5">
                      { (n.createdAt?.seconds || n.sentAt?.seconds) ? formatDistanceToNow((n.createdAt?.seconds || n.sentAt?.seconds) * 1000) + ' ago' : 'Just now'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 pr-4">
                    {n.message}
                  </p>
                  {!n.isRead && !n.isGlobal && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent" />}
                </div>
              ))}
            </div>
          )}
        </div>
        <Link 
          href="/notifications" 
          className="flex items-center justify-center gap-2 p-3 text-[10px] font-black uppercase tracking-[0.2em] border-t border-border/50 hover:bg-primary hover:text-primary-foreground transition-all text-primary"
          onClick={() => setIsOpen(false)}
        >
          View All <ExternalLink className="w-3 h-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
