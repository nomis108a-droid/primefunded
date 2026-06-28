'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { SlidersHorizontal, Layout, Box, LineChart, Activity, Bell, Calendar, Settings2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: any;
  onSettingsChange: (settings: any) => void;
  onResetScale: () => void;
}

export function ChartSettingsModal({ open, onOpenChange, settings, onSettingsChange, onResetScale }: ChartSettingsModalProps) {
  const updateScale = (key: string, value: any) => {
    onSettingsChange({
      ...settings,
      scales: { ...settings.scales, [key]: value }
    });
  };

  const updateScaleLabels = (key: string, value: boolean) => {
    onSettingsChange({
      ...settings,
      scales: {
        ...settings.scales,
        labels: { ...settings.scales.labels, [key]: value }
      }
    });
  };

  const updateCanvas = (key: string, value: any) => {
    onSettingsChange({
      ...settings,
      canvas: { ...settings.canvas, [key]: value }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 bg-zinc-950 border-zinc-800 text-white overflow-hidden flex flex-col">
        <DialogHeader className="p-6 border-b border-zinc-800">
          <DialogTitle className="text-xl font-headline font-bold">Chart Settings</DialogTitle>
          <DialogDescription className="text-zinc-500 text-xs">Configure your institutional trading environment.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          <Tabs defaultValue="canvas" orientation="vertical" className="flex-1 flex">
            <TabsList className="w-56 h-full flex flex-col items-start justify-start rounded-none bg-zinc-950 border-r border-zinc-800 p-2 gap-1">
              <SettingsTabTrigger value="symbol" icon={<Activity />} label="Symbol" disabled />
              <SettingsTabTrigger value="status" icon={<Activity />} label="Status Line" disabled />
              <SettingsTabTrigger value="scales" icon={<SlidersHorizontal />} label="Scales and Lines" />
              <SettingsTabTrigger value="canvas" icon={<Layout />} label="Canvas" />
              <SettingsTabTrigger value="trading" icon={<Box />} label="Trading" disabled />
              <SettingsTabTrigger value="alerts" icon={<Bell />} label="Alerts" disabled />
              <SettingsTabTrigger value="events" icon={<Calendar />} label="Events" disabled />
              
              <div className="mt-auto w-full pt-4 border-t border-zinc-800 px-2">
                <Button variant="ghost" className="w-full justify-start text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white gap-3" onClick={onResetScale}>
                  <RotateCcw className="w-4 h-4" /> Reset Settings
                </Button>
              </div>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <TabsContent value="canvas" className="m-0 space-y-8">
                <section className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-primary/20 pb-2">Background & Grid</h3>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase text-zinc-400">Background Type</Label>
                      <Select value={settings.canvas.background.type} onValueChange={(v) => updateCanvas('background', { ...settings.canvas.background, type: v })}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-800 h-10"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          <SelectItem value="solid">Solid</SelectItem>
                          <SelectItem value="gradient">Gradient</SelectItem>
                          <SelectItem value="transparent">Transparent</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-3">
                        <Input type="color" value={settings.canvas.background.color} onChange={(e) => updateCanvas('background', { ...settings.canvas.background, color: e.target.value })} className="w-12 h-10 p-1 bg-zinc-900 border-zinc-800" />
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">{settings.canvas.background.color}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase text-zinc-400">Grid Lines</Label>
                      <Select value={settings.canvas.grid.type} onValueChange={(v) => updateCanvas('grid', { ...settings.canvas.grid, type: v })}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-800 h-10"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="horizontal">Horizontal</SelectItem>
                          <SelectItem value="vertical">Vertical</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                           <Label className="text-[9px] uppercase font-bold text-zinc-600">Vert</Label>
                           <Input type="color" value={settings.canvas.grid.vert.color} onChange={(e) => updateCanvas('grid', { ...settings.canvas.grid, vert: { color: e.target.value } })} className="h-8 p-1 bg-zinc-900 border-zinc-800" />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[9px] uppercase font-bold text-zinc-600">Horz</Label>
                           <Input type="color" value={settings.canvas.grid.horz.color} onChange={(e) => updateCanvas('grid', { ...settings.canvas.grid, horz: { color: e.target.value } })} className="h-8 p-1 bg-zinc-900 border-zinc-800" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-primary/20 pb-2">Candle Aesthetics</h3>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase text-emerald-500">Bullish Body</Label>
                      <div className="flex gap-2">
                        <Input type="color" value={settings.canvas.candles.upColor} onChange={(e) => updateCanvas('candles', { ...settings.canvas.candles, upColor: e.target.value, borderUpColor: e.target.value, wickUpColor: e.target.value })} className="h-10 p-1 bg-zinc-900 border-zinc-800" />
                        <Input type="color" value={settings.canvas.candles.borderUpColor} onChange={(e) => updateCanvas('candles', { ...settings.canvas.candles, borderUpColor: e.target.value })} className="h-10 p-1 bg-zinc-900 border-zinc-800" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase text-red-500">Bearish Body</Label>
                      <div className="flex gap-2">
                        <Input type="color" value={settings.canvas.candles.downColor} onChange={(e) => updateCanvas('candles', { ...settings.canvas.candles, downColor: e.target.value, borderDownColor: e.target.value, wickDownColor: e.target.value })} className="h-10 p-1 bg-zinc-900 border-zinc-800" />
                        <Input type="color" value={settings.canvas.candles.borderDownColor} onChange={(e) => updateCanvas('candles', { ...settings.canvas.candles, borderDownColor: e.target.value })} className="h-10 p-1 bg-zinc-900 border-zinc-800" />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-primary/20 pb-2">Overlays & Watermark</h3>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <Label className="text-[11px] font-bold uppercase text-zinc-400">Watermark</Label>
                         <Switch checked={settings.canvas.watermark.visible} onCheckedChange={(v) => updateCanvas('watermark', { ...settings.canvas.watermark, visible: v })} />
                      </div>
                      <Input placeholder="Custom Text..." value={settings.canvas.watermark.text} onChange={(e) => updateCanvas('watermark', { ...settings.canvas.watermark, text: e.target.value })} className="bg-zinc-900 border-zinc-800 text-xs" />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <Label className="text-[11px] font-bold uppercase text-zinc-400">Session Breaks</Label>
                         <Switch checked={settings.canvas.sessionBreaks.enabled} onCheckedChange={(v) => updateCanvas('sessionBreaks', { ...settings.canvas.sessionBreaks, enabled: v })} />
                      </div>
                      <p className="text-[10px] text-zinc-500 italic">Draws vertical lines at day boundaries.</p>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="scales" className="m-0 space-y-8">
                <section className="space-y-6">
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-primary/20 pb-2">Price Axis Control</h3>
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <Label className="text-[11px] font-bold uppercase text-zinc-400">Scale Type</Label>
                        <RadioGroup value={settings.scales.type} onValueChange={(v) => updateScale('type', v)} className="grid grid-cols-2 gap-2">
                          {['regular', 'percent', 'indexed', 'log'].map(t => (
                            <div key={t} className="flex items-center space-x-2 bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                              <RadioGroupItem value={t} id={`type-${t}`} />
                              <Label htmlFor={`type-${t}`} className="text-[10px] font-bold uppercase cursor-pointer">{t}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                      <div className="space-y-4">
                         <Label className="text-[11px] font-bold uppercase text-zinc-400">Axis Labels</Label>
                         <div className="space-y-2">
                            <LabelCheckbox label="Current Price Label" checked={settings.scales.labels.currentPrice} onChange={v => updateScaleLabels('currentPrice', v)} />
                            <LabelCheckbox label="OHLC Values" checked={settings.scales.labels.ohlc} onChange={v => updateScaleLabels('ohlc', v)} />
                            <LabelCheckbox label="Execution Lines" checked={settings.scales.labels.tradeLines} onChange={v => updateScaleLabels('tradeLines', v)} />
                         </div>
                      </div>
                   </div>
                </section>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="p-6 border-t border-zinc-800 bg-zinc-900/50">
          <Button variant="ghost" className="font-bold text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="font-black bg-primary text-black px-10 rounded-xl" onClick={() => onOpenChange(false)}>Save Preferences</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTabTrigger({ value, icon, label, disabled = false }: { value: string, icon: React.ReactNode, label: string, disabled?: boolean }) {
  return (
    <TabsTrigger 
      value={value} 
      disabled={disabled}
      className={cn(
        "w-full justify-start gap-3 h-10 px-4 text-xs font-bold transition-all data-[state=active]:bg-white/5 data-[state=active]:text-primary",
        disabled && "opacity-30 cursor-not-allowed"
      )}
    >
      <span className="w-4 h-4">{icon}</span>
      {label}
    </TabsTrigger>
  );
}

function LabelCheckbox({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={v => onChange(!!v)} />
      <span className="text-[11px] font-medium text-zinc-300">{label}</span>
    </div>
  );
}
