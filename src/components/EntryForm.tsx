'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Crosshair, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react';
import { action, message } from '@/lib/client';
import { useGeolocation } from '@/hooks/useGeolocation';

export function EntryForm({ mode }: { mode: 'create' | 'join' }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'runner' | 'hunter'>('runner');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const gps = useGeolocation(mode === 'create' && consent);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent) { setFailure('Please agree to location sharing to play.'); return; }
    if (mode === 'create' && !gps.position) { setFailure('A GPS fix is required to set the play area. Enable location permission and try again.'); return; }
    setPending(true); setFailure('');
    try {
      const result = mode === 'create'
        ? await action('create_room', { p_name: name.trim(), p_lat: gps.position!.latitude, p_lng: gps.position!.longitude, p_accuracy: gps.position!.accuracy })
        : await action('join_room', { p_code: code.trim().toUpperCase(), p_name: name.trim(), p_role: role });
      if (result && typeof result === 'object' && 'error' in result && result.error) throw new Error(String(result.error));
      localStorage.setItem('manhunt-location-consent', 'yes');
      const roomCode = mode === 'create' ? (typeof result === 'string' ? result : (result as { code?: string; room?: { code?: string } })?.code ?? (result as { room?: { code?: string } })?.room?.code) : code.trim().toUpperCase();
      if (!roomCode) throw new Error('The room was created but no room code was returned.');
      router.push(`/room/${roomCode}`);
    } catch (e) { setFailure(message(e)); } finally { setPending(false); }
  }

  return <main className="min-h-dvh bg-slate-950 px-5 py-6 text-slate-100"><div className="mx-auto max-w-lg"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16}/> Back</Link>
    <div className="mt-8 flex items-center gap-2 font-mono text-xs tracking-[.2em] text-emerald-400"><Crosshair size={16}/> FIELD SETUP / {mode === 'create' ? '01' : '02'}</div>
    <h1 className="mt-4 text-4xl font-black uppercase tracking-tight sm:text-5xl">{mode === 'create' ? 'Create a room' : 'Join the hunt'}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{mode === 'create' ? 'Your current position sets the center of the play area. You can adjust the rules in the lobby.' : 'Enter the six-character code shared by your host.'}</p>
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-2xl sm:p-7">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Your callsign<input required maxLength={24} value={name} onChange={e=>setName(e.target.value)} placeholder="Enter a display name" className="mt-2 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 text-base normal-case tracking-normal text-white outline-none focus:border-emerald-400"/></label>
      {mode === 'join' && <><label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Room code<input required minLength={6} maxLength={6} value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="ABC123" className="mt-2 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 font-mono text-xl tracking-[.3em] text-white outline-none focus:border-emerald-400"/></label><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Choose your side</p><div className="mt-2 grid grid-cols-2 gap-2">{(['runner','hunter'] as const).map(item=><button type="button" key={item} onClick={()=>setRole(item)} className={`min-h-14 rounded-lg border text-sm font-bold uppercase ${role === item ? item === 'runner' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-orange-400 bg-orange-400/10 text-orange-400' : 'border-slate-700 text-slate-400'}`}>{item}</button>)}</div></div></>}
      <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400"/><span className="text-xs leading-5 text-slate-300"><strong className="block text-sm text-white">I agree to share my location while playing.</strong> Hunters see live Hunter locations and scheduled Runner pings. Radar temporarily reveals precise Runner locations to Hunters. In the mobile app, tracking may continue during a game when the screen is locked. Browser tracking requires the app to stay open.</span></label>
      {mode === 'create' && consent && <div className="flex items-start gap-2 text-xs leading-5 text-slate-400"><MapPin size={16} className="shrink-0 text-emerald-400"/>{gps.position ? `GPS fix acquired · ±${Math.round(gps.position.accuracy)} m` : gps.error || 'Getting your GPS position…'}{gps.error && <button type="button" onClick={gps.retry} className="ml-2 underline">Retry</button>}</div>}
      {failure && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{failure}</p>}
      <button disabled={pending || (mode === 'create' && !gps.position)} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-400 px-4 text-sm font-black uppercase tracking-wider text-slate-950 disabled:opacity-40">{pending ? <LoaderCircle className="animate-spin" size={18}/> : <>{mode === 'create' ? 'Create room' : 'Enter lobby'} <ArrowRight size={18}/></>}</button>
    </form><p className="mt-5 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="shrink-0"/> Location is sensitive. Only play with people you trust. GPS can be inaccurate and does not prove physical contact.</p>
  </div></main>;
}

