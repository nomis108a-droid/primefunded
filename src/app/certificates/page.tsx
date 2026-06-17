"use client";

import { Navigation } from '@/components/Navigation';
import { Award, Download, Calendar, ShieldCheck, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function CertificatesPage() {
  const { userData, loading } = useAuth();
  const certificates = userData?.certificates || [];

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white">Your Certificates</h1>
          <p className="text-muted-foreground text-sm">Verified proof of your trading excellence and institutional achievements.</p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-3xl bg-secondary/20 animate-pulse border border-border/30" />
            ))}
          </div>
        ) : certificates.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-border/30 rounded-[2.5rem] bg-secondary/5">
            <div className="p-8 bg-primary/10 rounded-full border border-primary/20 shadow-[0_0_50px_rgba(17,179,245,0.1)]">
              <Award className="w-16 h-16 text-primary opacity-40" />
            </div>
            <div className="max-w-xs space-y-2">
              <h3 className="text-2xl font-headline font-bold text-white">No certificates yet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pass an evaluation phase or achieve live funding to earn your official PrimeFunded credentials.
              </p>
            </div>
            <Button variant="outline" className="font-bold border-primary/30 text-primary" asChild>
              <a href="/challenges">Start Challenge</a>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {certificates.map((cert: any, idx: number) => (
              <Card key={idx} className="bg-card/40 border-border/50 hover:border-primary/40 transition-all duration-300 group overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-0">
                  <div className="aspect-[1.6/1] bg-secondary/20 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid-white opacity-5" />
                    <Award className="w-24 h-24 text-primary opacity-10 group-hover:scale-110 transition-transform duration-700" />
                    <FileText className="absolute w-10 h-10 text-white opacity-0 group-hover:opacity-40 transition-all duration-500" />
                    
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <Button asChild className="font-bold cyan-box-glow px-6 h-11 rounded-xl">
                          <a href={cert.url} target="_blank" rel="noopener noreferrer">
                            <Download className="w-4 h-4 mr-2" /> Download Certificate
                          </a>
                       </Button>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    <div>
                      <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{cert.label}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{cert.plan}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Verified Account</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-black tracking-[0.1em]">
                        <Calendar className="w-3 h-3 text-primary/50" />
                        {cert.date ? format(new Date(cert.date), 'MMM d, yyyy') : 'Recently Issued'}
                      </div>
                      <div className="flex items-center gap-1.5">
                         <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                         <span className="text-[9px] font-black uppercase text-emerald-500 tracking-tighter">Blockchain Verified</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-20 p-10 rounded-[3rem] bg-primary/5 border border-primary/20 text-center max-w-3xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-16 -mt-16" />
          <h3 className="text-2xl font-headline font-bold text-white mb-4">Share Your Success</h3>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8">
            You've joined the elite 1% of traders. Share your verified achievements on LinkedIn or Twitter and tag @PrimeFunded to be featured in our trader spotlight.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="outline" className="font-bold border-white/10 hover:bg-secondary rounded-xl h-12 px-8">View Rulebook</Button>
            <Button variant="secondary" className="font-bold rounded-xl h-12 px-8">Client Showcase</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
