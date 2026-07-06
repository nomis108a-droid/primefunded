'use client';

import { useMemo, useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Check, Trash2, Clock, ShieldCheck, XCircle, Wallet, Award, TrendingUp, Info, Megaphone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFirestore } from '@/firebase';
import { orderBy, doc, updateDoc, deleteDoc, writeBatch, collection, getDocs, query, where, limit, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function NotificationsPage() {
  const { user } = useAuth();
  const db = useFirestore();
  const [filter, setFilter] = useState('all');
  const [localNotifications, setLocalNotifications] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) return;
    
    // 1. Personal Notifications
    const qNotif = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubNotif = onSnapshot(qNotif, (snap) => {
      setLocalNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // 2. Global Broadcasts
    const qBroad = query(
      collection(db, 'broadcasts'),
      orderBy('sentAt', 'desc'),
      limit(10)
    );
    const unsubBroad = onSnapshot(qBroad, (snap) => {
      setBroadcasts(snap.docs.map(d => ({ id: d.id, ...d.data(), isGlobal: true })));
    });

    return () => {
      unsubNotif();
      unsubBroad();
    };
  }, [user, db]);

  const filteredNotifications = useMemo(() => {
    const combined = [...localNotifications, ...broadcasts];
    const sorted = combined.sort((a, b) => {
      const timeA = (a.createdAt || a.sentAt)?.seconds || 0;
      const timeB = (b.createdAt || b.sentAt)?.seconds || 0;
      return timeB - timeA;
    });

    if (filter === 'unread') return sorted.filter(n => !n.isRead && !n.isGlobal);
    if (filter === 'global') return sorted.filter(n => n.isGlobal);
    return sorted;
  }, [localNotifications, broadcasts, filter]);

  const handleMarkAsRead = async (id: string) => {
    if (!user) return;
    updateDoc(doc(db, 'users', user.uid, 'notifications', id), { isRead: true });
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    deleteDoc(doc(db, 'users', user.uid, 'notifications', id));
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'notifications'), where('isRead', '==', false));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { isRead: true }));
    await batch.commit();
  };

  const getIcon = (type: string, isGlobal?: boolean) => {
    if (isGlobal) return <Megaphone className="text-primary" />;
    switch (type) {
      case 'kyc_approved': return <ShieldCheck className="text-accent" />;
      case 'kyc_rejected': return <XCircle className="text-destructive" />;
      case 'payout_processed': return <Wallet className="text-primary" />;
      case 'challenge_passed': return <Award className="text-accent" />;
      case 'challenge_failed': return <XCircle className="text-destructive" />;
      case 'referral_earned': return <TrendingUp className="text-primary" />;
      default: return <Bell className="text-muted-foreground" />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Notifications</h1>
            <p className="text-muted-foreground">Manage your alerts and system announcements.</p>
          </div>
          <Button variant="outline" size="sm" className="font-bold border-primary/30 text-primary" onClick={handleMarkAllRead}>
            <Check className="w-4 h-4 mr-2" /> Mark all personal read
          </Button>
        </header>

        <Tabs defaultValue="all" className="w-full mb-8" onValueChange={setFilter}>
          <TabsList className="bg-secondary/50 p-1 rounded-xl">
            <TabsTrigger value="all" className="px-8 font-bold">All</TabsTrigger>
            <TabsTrigger value="unread" className="px-8 font-bold">Unread</TabsTrigger>
            <TabsTrigger value="global" className="px-8 font-bold">Broadcasts</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4 max-w-4xl">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 w-full rounded-3xl bg-secondary/20 animate-pulse" />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center border-2 border-dashed border-border rounded-[2rem] bg-secondary/10">
              <Info className="w-12 h-12 text-muted-foreground opacity-20 mb-4" />
              <h3 className="text-lg font-bold text-white mb-1">No notifications found</h3>
              <p className="text-sm text-muted-foreground">Your alert history is empty.</p>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <Card 
                key={n.id} 
                className={cn(
                  "border-border/50 transition-all group relative overflow-hidden",
                  n.isGlobal ? "bg-primary/5 border-primary/30" : (!n.isRead ? "bg-accent/5 border-accent/20" : "bg-card/40 opacity-80")
                )}
              >
                <CardContent className="p-6 flex items-start gap-6">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border",
                    n.isGlobal ? "bg-primary/10 border-primary/20" : (!n.isRead ? "bg-accent/10 border-accent/20" : "bg-secondary border-border")
                  )}>
                    {getIcon(n.type, n.isGlobal)}
                  </div>
                  <div className="flex-1 space-y-1 pr-12">
                    <div className="flex items-center gap-3">
                      <h3 className={cn("text-lg font-bold", (n.isGlobal || !n.isRead) ? "text-white" : "text-muted-foreground")}>{n.title}</h3>
                      {n.isGlobal && <Badge className="bg-primary text-black text-[10px] font-black h-5 uppercase tracking-widest">SYSTEM</Badge>}
                      {!n.isRead && !n.isGlobal && <Badge className="bg-accent text-black text-[10px] font-black h-5">NEW</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-black tracking-widest pt-2">
                      <Clock className="w-3 h-3" />
                      {(n.createdAt?.seconds || n.sentAt?.seconds) ? format((n.createdAt?.seconds || n.sentAt?.seconds) * 1000, 'PPP p') : 'Just now'}
                    </div>
                  </div>
                  {!n.isGlobal && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.isRead && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent/20 text-accent" onClick={() => handleMarkAsRead(n.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 text-destructive" onClick={() => handleDelete(n.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
