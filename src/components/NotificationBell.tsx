'use client';

import { Bell, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';
import { useCollection, useFirestore } from '@/firebase';
import { orderBy, limit, doc, updateDoc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBell() {
  const { user } = useAuth();
  const db = useFirestore();
  const [isOpen, setIsOpen] = useState(false);

  // FIXED: Limit to 10 and ensure correct ordering as requested
  const constraints = useMemo(() => [
    orderBy('createdAt', 'desc'),
    limit(10)
  ], []);

  const { data: notifications, loading } = useCollection<any>(
    user ? `users/${user.uid}/notifications` : null,
    constraints
  );

  const unreadCount = useMemo(() => 
    notifications.filter(n => !n.isRead && n.read !== true).length
  , [notifications]);

  const handleMarkAsRead = async (id: string) => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid, 'notifications', id);
    updateDoc(ref, { isRead: true, read: true });
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
      batch.update(d.ref, { isRead: true, read: true });
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
          {loading ? (
            <div className="p-10 text-center flex flex-col items-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Updating feed...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center opacity-40">
              <Bell className="w-8 h-8 mb-2 text-muted-foreground" />
              <p className="text-[10px] uppercase font-bold tracking-widest">No new alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {notifications.map((n) => (
                <div 
                  key={n.id} 
                  className={cn(
                    "p-4 transition-all cursor-pointer group relative",
                    (!n.isRead && n.read !== true) ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-secondary/20"
                  )}
                  onClick={() => handleMarkAsRead(n.id)}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <p className={cn("text-[11px] font-black uppercase tracking-tight", (!n.isRead && n.read !== true) ? "text-white" : "text-muted-foreground")}>
                      {n.title}
                    </p>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase whitespace-nowrap pt-0.5">
                      {n.createdAt?.seconds ? formatDistanceToNow(n.createdAt.seconds * 1000) + ' ago' : 'Just now'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 pr-4">
                    {n.message}
                  </p>
                  {(!n.isRead && n.read !== true) && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />}
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
