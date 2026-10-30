'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Crosshair, Eye, Flag, LogOut, Radio, Shield, Users, X, Zap } from 'lucide-react';
import TacticalMap, { type MapLocation } from '@/components/map/TacticalMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import { countdown, useClock, useRoom } from '@/hooks/useRoom';
import { action, message } from '@/lib/client';
import { distanceMeters } from '@/lib/geo/distance';
import { Capacitor } from '@capacitor/core';

const subscribeConsent = (callback: () => void) => { window.addEventListener('storage', callback); return () => window.removeEventListener('storage', callback); };
const readConsent = () => localStorage.getItem('manhunt-location-consent') === 'yes';

export function Game({ code }: { code: string }) {
  const router = useRouter();
  const { state, error, online, offset, reload } = useRoom(code);
  const now = useClock(offset);
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const lastSent = useRef<{ latitude:number; longitude:number; at:number } | null>(null);
  const lastPing = useRef<string | null>(null);
  const pingInitialized = useRef(false);
  const phase = state?.room.state.toLowerCase();
  const sharing = !!state && (phase === 'active' || phase === 'grace_period') && state.me.active && !state.me.eliminated && consent && !leaving;
  const gps = useGeolocation(sharing, true);
  useEffect(()=>{ if (phase === 'lobby') router.replace(`/room/${code}`); if (phase === 'ended') router.replace(`/results/${code}`); },[phase,code,router]);
  useEffect(()=>{
    const pos = gps.position;
    if (!sharing || !online || (!Capacitor.isNativePlatform() && document.visibilityState !== 'visible') || !pos || Date.now()-pos.timestamp > 10000) return;
    const previous=lastSent.current;
    if (previous && (Date.now()-previous.at < 5000 || (distanceMeters(previous,pos)<5 && Date.now()-previous.at < 20000))) return;
    lastSent.current={ latitude:pos.latitude,longitude:pos.longitude,at:Date.now() };
    void action('update_location',{p_code:code,p_lat:pos.latitude,p_lng:pos.longitude,p_accuracy:pos.accuracy}).catch(e=>{lastSent.current=null;setFailure(message(e));});
  },[gps.position,sharing,online,code]);
  useEffect(()=>{
    if (!state) return;
    const mine = state.pings.find(p=>p.player_id === state.me.id) as (typeof state.pings[number] & { pinged_at?: string }) | undefined;
    const ping = mine?.pinged_at;
    if (pingInitialized.current && ping && ping !== lastPing.current) { setNotice('Your position was revealed in a scheduled ping.'); window.setTimeout(()=>setNotice(''),6000); }
    lastPing.current=ping ?? null;
    pingInitialized.current=true;
  },[state]);
  async function run(name: string, args: Record<string, unknown> = {}) { setBusy(true);setFailure('');try {await action(name,{p_code:code,...args});await reload();} catch(e){setFailure(message(e));} finally {setBusy(false);} }
  async function leave(){ setLeaving(true); try { await action('leave_room',{p_code:code}); router.push('/'); } catch(e){setFailure(`Could not leave the room: ${message(e)}. Location sharing is stopped; retry leaving when connected.`);} }
  if (!state) return <main className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-slate-300"><div>{error || 'Connecting to your mission…'}<br/><Link href="/" className="mt-4 inline-block text-emerald-400">Return home</Link></div></main>;
  const {room,me,players,locations,pings,catches,eligibility} = state;
  const host = room.host_id === me.user_id || room.host_id === me.id;
  const playerName=(id:string)=>players.find(p=>p.id===id)?.name || 'Player';
  const mapped=(locations:typeof state.locations):MapLocation[]=>locations.map(l=>({player_id:l.player_id,name:playerName(l.player_id),lat:l.lat,lng:l.lng,accuracy:l.accuracy,updated_at:l.pinged_at ?? l.recorded_at}));
  const hunters=mapped(locations.filter(l=>l.player_id!==me.id && players.some(p=>p.id===l.player_id && p.role==='hunter')));
  const radarLocations=mapped(locations.filter(l=>l.player_id!==me.id && players.some(p=>p.id===l.player_id && p.role==='runner')));
  const radarActive=!!now && !!me.radar_until && new Date(me.radar_until).getTime()>now;
  const pending=catches.find(c=>c.runner_id===me.id && c.status==='pending');
  const targets=eligibility || [];
  const gpsStale = !gps.position || !now || (now - offset)-gps.position.timestamp>30000;
  return <main className="relative h-dvh min-h-[430px] overflow-hidden bg-slate-950 text-white">
    <TacticalMap center={{latitude:room.center_lat,longitude:room.center_lng}} radius={room.radius} own={gps.position} hunters={hunters} pings={mapped(pings)} radar={radarActive ? radarLocations : []} radarActive={radarActive}/>
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-slate-950/95 via-slate-950/70 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black tracking-[.18em]"><Crosshair size={19} className="text-emerald-400"/> MAZE-RUNNER<span className="text-emerald-400">.</span></div><span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase ${me.role==='runner'?'border-emerald-500/40 text-emerald-400':'border-orange-500/40 text-orange-400'}`}>{me.eliminated ? 'Eliminated' : me.role}</span><button onClick={()=>setMenu(true)} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-slate-900/80" aria-label="Open player menu"><Users size={17}/></button></div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-slate-950/80 p-3 shadow-xl backdrop-blur-md"><div><p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Time left</p><p className="font-mono text-xl font-bold tabular-nums">{countdown(room.ends_at,now)}</p></div><div className="border-l border-slate-700 pl-3"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{phase==='grace_period'?'Head start':'Next ping'}</p><p className="font-mono text-xl font-bold tabular-nums text-emerald-400">{countdown(phase==='grace_period'?room.grace_ends_at:room.next_ping_at,now)}</p></div><div className="border-l border-slate-700 pl-3"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Status</p><p className="mt-1 text-xs font-bold uppercase">{phase==='grace_period'?'Head start':phase}</p><p className={`mt-1 font-mono text-[9px] ${!online || gpsStale?'text-amber-400':'text-emerald-400'}`}>{!online?'OFFLINE':gpsStale?'GPS STALE':`GPS ±${Math.round(gps.position!.accuracy)}M`}</p></div></div>
      {(!online || error || failure || gps.error || notice) && <div role="status" className="pointer-events-auto mt-2 rounded-lg border border-amber-400/30 bg-slate-950/95 p-3 text-xs leading-5 text-amber-200">{!online ? 'You are offline. Locations and game actions will sync when the connection returns.' : failure || gps.error || error || notice}{gps.error && <button onClick={gps.retry} className="ml-2 underline">Retry GPS</button>}</div>}
    </div></div>
    {!consent && <div className="absolute inset-0 z-[900] grid place-items-center bg-slate-950/90 p-5"><div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6"><h2 className="text-xl font-black uppercase">Enable location sharing</h2><p className="mt-3 text-sm leading-6 text-slate-300">Your location is shared while you participate. Hunters see live Hunter locations, scheduled Runner pings, and precise Runner locations during Radar. Keep this app open; background tracking is not guaranteed.</p><button onClick={()=>{localStorage.setItem('manhunt-location-consent','yes');window.dispatchEvent(new Event('storage'));}} className="mt-5 min-h-12 w-full rounded-lg bg-emerald-400 font-bold text-slate-950">I agree and enable GPS</button><button onClick={()=>void leave()} className="mt-3 min-h-11 w-full text-sm text-slate-400">Leave game</button></div></div>}
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10"><div className="pointer-events-auto mx-auto flex max-w-xl gap-2">{me.role==='hunter' && !me.eliminated ? <><button disabled={busy || me.radar_used || phase!=='active'} onClick={()=>void run('use_radar')} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-slate-900/95 text-xs font-black uppercase tracking-wider text-cyan-300 disabled:opacity-40"><Radio size={17}/>{radarActive ? `Radar ${countdown(me.radar_until,now)}` : me.radar_used?'Radar used':'Radar hack'}</button><button disabled={busy || targets.length===0 || phase!=='active'} onClick={()=>{if(targets.length===1) void run('request_catch',{p_runner:targets[0]}); else setMenu(true);}} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-40"><Crosshair size={17}/> {targets.length>1?'Select target':'Tag runner'}</button></> : !me.eliminated ? <><button disabled={busy || me.jammer_used || phase!=='active'} onClick={()=>void run('use_jammer')} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-slate-900/95 text-xs font-black uppercase tracking-wider text-emerald-300 disabled:opacity-40"><Zap size={17}/>{me.jammer_pending?'Signal jammed':me.jammer_used?'Jammer used':'Activate jammer'}</button><button disabled={busy || phase!=='active'} onClick={()=>void run('surrender')} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-slate-900/95 text-xs font-bold uppercase tracking-wider disabled:opacity-40"><Flag size={17}/> I was caught</button></> : <div className="rounded-xl bg-slate-900/90 p-4 text-sm">You have been eliminated. You can follow the match until it ends.</div>}</div><p className="mx-auto mt-2 max-w-xl text-center font-mono text-[9px] uppercase tracking-wider text-slate-400">Keep app open · GPS is proximity assistance, not proof of contact</p></div>
    {pending && <div className="absolute inset-0 z-[1000] grid place-items-center bg-slate-950/85 p-5"><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-orange-500/40 bg-slate-900 p-6 text-center shadow-2xl"><Crosshair size={36} className="mx-auto text-orange-400"/><h2 className="mt-4 text-2xl font-black uppercase">You&apos;ve been tagged!</h2><p className="mt-3 text-sm text-slate-300">{playerName(pending.hunter_id)} claims to have caught you.</p><button disabled={busy} onClick={()=>void run('resolve_catch',{p_request:pending.id,p_accept:true})} className="mt-6 min-h-12 w-full rounded-lg bg-orange-500 font-bold text-slate-950">Confirm catch</button><button disabled={busy} onClick={()=>void run('resolve_catch',{p_request:pending.id,p_accept:false})} className="mt-2 min-h-12 w-full rounded-lg border border-slate-700 font-bold">Reject catch</button></div></div>}
    {menu && <div className="absolute inset-0 z-[800] flex justify-end bg-slate-950/70"><div className="h-full w-full max-w-sm overflow-auto border-l border-slate-700 bg-slate-900 p-5 pb-12"><div className="flex items-center justify-between"><h2 className="text-xl font-black uppercase">Mission roster</h2><button onClick={()=>setMenu(false)} aria-label="Close menu" className="grid h-11 w-11 place-items-center"><X/></button></div><p className="mt-2 text-xs text-slate-400">Room {code} · {players.filter(p=>p.active).length} players</p><div className="mt-5 space-y-2">{players.filter(p=>p.active).map(p=><div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-950 p-3"><div><p className="text-sm font-bold">{p.name}{p.id===me.id?' (you)':''}</p><p className={`mt-1 font-mono text-[10px] uppercase ${p.role==='runner'?'text-emerald-400':'text-orange-400'}`}>{p.eliminated?'eliminated':p.role}</p></div>{targets.includes(p.id) && <button onClick={()=>{void run('request_catch',{p_runner:p.id});setMenu(false);}} className="min-h-10 rounded-lg bg-orange-500 px-4 text-xs font-bold text-slate-950">TAG</button>}</div>)}</div><p className="mt-6 flex gap-2 text-xs leading-5 text-slate-400"><Eye size={16} className="shrink-0"/> Hunters see live Hunter locations and scheduled Runner pings. Radar reveals active Runners precisely for 30 seconds.</p><p className="mt-4 flex gap-2 text-xs leading-5 text-slate-400"><Shield size={16} className="shrink-0"/> Stay aware of traffic and private property. Browser GPS may pause when the screen locks.</p>{host && <button disabled={busy} onClick={()=>void run('end_game')} className="mt-6 min-h-12 w-full rounded-lg border border-red-500/40 text-sm font-bold text-red-300">End game for everyone</button>}<button onClick={()=>void leave()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 text-sm text-slate-300"><LogOut size={16}/> Leave and stop sharing</button></div></div>}
  </main>;
}



