
"use client";

import { useState, useEffect, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  User, 
  Mail, 
  Shield, 
  CheckCircle2, 
  Phone, 
  Globe, 
  Save, 
  Copy, 
  Loader2, 
  Camera, 
  Trash2,
  Image as ImageIcon 
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { cn, sanitizeInput } from '@/lib/utils';
import { z } from 'zod';
import { uploadImageAsBase64 } from '@/lib/imageUpload';
import Image from 'next/image';

const ProfileSchema = z.object({
  name: z.string().min(2, "Name is too short").max(100, "Name must be under 100 characters"),
  phone: z.string().min(5, "Phone number is too short").max(20, "Phone number is too long"),
  country: z.string().min(2, "Country is required"),
});

/**
 * Deterministic numeric ID generator
 */
function getShortId(uid: string): string {
  if (!uid) return "00000000";
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString().slice(0, 8).padStart(8, '0');
}

export default function ProfilePage() {
  const { user, userData } = useAuth();
  const { toast } = useToast();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    country: ''
  });

  useEffect(() => {
    if (userData && user) {
      setFormData({
        name: userData.name || '',
        phone: userData.phone || '',
        country: userData.country || ''
      });
      
      // Auto-repair/Set short numeric traderId if missing
      const shortId = getShortId(user.uid);
      if (!userData.traderId || userData.traderId !== shortId) {
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { 
          traderId: shortId,
          updatedAt: serverTimestamp() 
        });
      }
    }
  }, [userData, user]);

  const getInitials = (name: string) => {
    if (!name) return 'PF';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ variant: "destructive", title: "Invalid format", description: "Please use JPG, PNG or WebP." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Max database photo size is 2MB." });
      return;
    }

    uploadPhoto(file);
  };

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    setUploading(true);

    try {
      const base64 = await uploadImageAsBase64(file);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { photoURL: base64 });
      setUploading(false);
      toast({ title: "Photo Updated", description: "Your profile picture has been synchronized." });
    } catch (error: any) {
      setUploading(false);
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
    }
  };

  const handleRemovePhoto = async () => {
    if (!user || !userData?.photoURL) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { photoURL: null });
      toast({ title: "Photo Removed", description: "Your profile is back to default." });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!user) return;
    const validation = ProfileSchema.safeParse(formData);
    if (!validation.success) {
      toast({ variant: "destructive", title: "Validation Error", description: validation.error.errors[0].message });
      return;
    }

    setLoading(true);
    const updates = {
      name: sanitizeInput(formData.name),
      phone: sanitizeInput(formData.phone),
      country: sanitizeInput(formData.country),
    };

    const userRef = doc(db, 'users', user.uid);
    updateDoc(userRef, updates)
      .then(() => {
        toast({ title: "Profile Updated", description: "Your personal details have been saved successfully." });
      })
      .catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: userRef.path, operation: 'update', requestResourceData: updates }));
      })
      .finally(() => setLoading(false));
  };

  const copyTraderId = () => {
    const idToCopy = userData?.traderId || getShortId(user?.uid || "");
    if (idToCopy) {
      navigator.clipboard.writeText(idToCopy);
      toast({ title: "Copied!", description: "Trader ID copied to clipboard." });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white">Account Profile</h1>
          <p className="text-muted-foreground">Manage your personal information and account security.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm relative overflow-hidden">
              {uploading && (
                <div className="absolute top-0 left-0 w-full z-20">
                  <Progress value={undefined} className="h-1 bg-transparent rounded-none" />
                </div>
              )}
              
              <CardContent className="pt-10 flex flex-col items-center text-center">
                <div className="relative group mb-6">
                  <Avatar className="w-32 h-32 border-4 border-primary/20 shadow-[0_0_30px_rgba(17,179,245,0.15)] transition-transform duration-300 group-hover:scale-105">
                    {userData?.photoURL ? (
                      <AvatarImage src={userData.photoURL} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-4xl bg-gradient-to-br from-primary to-blue-600 text-white font-bold">
                      {getInitials(userData?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[2px]"
                  >
                    <Camera className="w-8 h-8 text-white" />
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                </div>

                <div className="space-y-1 mb-6">
                  <h2 className="text-2xl font-headline font-bold text-white">{userData?.name || 'Trader'}</h2>
                  <p className="text-sm text-muted-foreground">{userData?.email}</p>
                </div>
                
                <div className="flex flex-col gap-3 w-full mb-8">
                   <div className="flex justify-center gap-4">
                     <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-white transition-colors">Change Photo</button>
                     {userData?.photoURL && (
                       <button onClick={handleRemovePhoto} className="text-[10px] font-black uppercase tracking-widest text-destructive hover:text-white transition-colors">Remove</button>
                     )}
                   </div>
                   <div 
                    className="flex flex-col gap-2 p-3 bg-secondary border border-primary/20 rounded-lg cursor-pointer hover:border-primary/50 transition-colors group text-left" 
                    onClick={copyTraderId}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">TRADER ID:</span>
                      <Copy className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <span className="font-mono text-sm font-bold text-white">{userData?.traderId || getShortId(user?.uid || "")}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full mb-4">
                  <Badge className="bg-primary/20 text-primary border-primary/30 uppercase text-[10px] font-bold tracking-widest px-3 py-1 justify-center">
                    {userData?.tier || 'Bronze'} Tier
                  </Badge>
                  {userData?.kycVerified ? (
                    <Badge className="bg-accent/20 text-accent border-accent/30 uppercase text-[10px] flex gap-1 font-bold tracking-widest px-3 py-1 justify-center">
                      <CheckCircle2 className="w-3 h-3" /> KYC Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground uppercase text-[10px] font-bold tracking-widest px-3 py-1 border-border/50 justify-center">
                      KYC Not Verified
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-white">
                  <Shield className="w-5 h-5 text-primary" /> Security
                </CardTitle>
                <CardDescription>Protect your trading account access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="secondary" className="w-full justify-start h-11 px-4 font-bold text-xs uppercase tracking-widest cursor-pointer group">
                   Change Password <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><CheckCircle2 className="w-3 h-3" /></div>
                </Button>
                <Button variant="secondary" className="w-full justify-start h-11 px-4 font-bold text-xs uppercase tracking-widest cursor-pointer group">
                  Enable 2FA Auth <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><CheckCircle2 className="w-3 h-3" /></div>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-headline text-white">Personal Details</CardTitle>
                <CardDescription>Update your contact information and location details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <User className="w-3.5 h-3.5 text-primary" /> Full Name
                    </Label>
                    <Input 
                      value={formData.name} 
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="bg-secondary/30 h-11 text-white border-border/50 focus:border-primary/50 transition-all"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <Mail className="w-3.5 h-3.5 text-primary" /> Email Address
                    </Label>
                    <Input value={userData?.email || ''} disabled className="bg-secondary/10 text-muted-foreground cursor-not-allowed border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 text-primary" /> Phone Number
                    </Label>
                    <Input 
                      placeholder="+1 (555) 000-0000" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="bg-secondary/30 h-11 text-white border-border/50 focus:border-primary/50 transition-all"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <Globe className="w-3.5 h-3.5 text-primary" /> Country
                    </Label>
                    <Input placeholder="United Kingdom" value={formData.country} onChange={(e) => setFormData({...formData, country: e.target.value})} className="bg-secondary/30 h-11 text-white border-border/50 focus:border-primary/50 transition-all" />
                  </div>
                </div>
                <div className="pt-8 border-t border-border/50">
                  <Button className="font-bold px-10 h-12 rounded-xl cyan-box-glow transition-all cursor-pointer" onClick={handleSave} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    {loading ? 'Saving Changes...' : 'Save All Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
