'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Crosshair, Crown, LoaderCircle, Play, Settings2, Users, X } from 'lucide-react';
import { action, message } from '@/lib/client';
import { useRoom } from '@/hooks/useRoom';

const options = [
  { key:'ping_interval', label:'Runner ping interval', suffix:'min', values:[60,180,300,600] },
  { key:'radius', label:'Play area radius', suffix:'m', values:[250,500,1000,2000] },
  { key:'duration', label:'Game duration', suffix:'min', values:[900,1800,3600,5400] },
  { key:'head_start', label:'Runner head start', suffix:'min', values:[0,120,300,600] },
  { key:'catch_radius', label:'Catch radius', suffix:'m', values:[5,10,15,20,25,30,50] },
  { key:'max_players', label:'Maximum players', suffix:'players', values:[2,4,6,8,10,12,16,20,30,40,50] },
] as const;

export function Lobby({ code }: { code: string }) {
  const router = useRouter();
  const { state, error, online, reload } = useRoom(code);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function run(name: string, args: Record<string, unknown> = {}) { setBusy(true); setFailure(''); try { await action(name, { p_code: code, ...args }); await reload(); } catch (e) { setFailure(message(e)); } finally { setBusy(false); } }
  const phase = state?.room.state.toLowerCase();
  useEffect(() => { if (phase === 'ended') router.replace(`/results/${code}`); else if (phase && phase !== 'lobby') router.replace(`/game/${code}`); }, [phase, code, router]);
  if (!state) return <Shell><p className="mt-12 text-slate-400">{error || 'Connecting to the room…'}</p><Link href="/" className="mt-5 inline-block text-emerald-400">Return home</Link></Shell>;
  const { room, me, players } = state;
  if (phase !== 'lobby') return <Shell><p className="mt-12 text-slate-400">Loading mission…</p></Shell>;
  const host = room.host_id === me.user_id || room.host_id === me.id;
  const active = players.filter(p => p.active);
  return <Shell><div className="flex items-center justify-between"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-400"><ArrowLeft size={16}/> Home</Link><span className={`font-mono text-[10px] uppercase tracking-widest ${online ? 'text-emerald-400' : 'text-amber-400'}`}>{online ? '● Connected' : '● Offline'}</span></div>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs tracking-[.2em] text-emerald-400">PRIVATE SESSION / LOBBY</p><h1 className="mt-2 text-4xl font-black uppercase tracking-tight">Assemble your crew.</h1><p className="mt-2 text-sm text-slate-400">Share the room code with players you trust.</p></div><button onClick={()=>{void navigator.clipboard?.writeText(code); setCopied(true); window.setTimeout(()=>setCopied(false),2000);}} className="flex min-h-14 items-center gap-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-5"><span className="font-mono text-xl font-bold tracking-[.22em] text-emerald-400">{code}</span>{copied ? <Check size={17}/> : <Copy size={17}/>}</button></div>
    {(failure || error) && <p role="alert" className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{failure || error}</p>}
    <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_0.9fr]"><section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold uppercase tracking-wider"><Users size={18} className="text-emerald-400"/> Players</h2><span className="font-mono text-xs text-slate-500">{active.length} / {room.max_players}</span></div><div className="mt-5 space-y-2">{active.map(player=><div key={player.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"><span className={`grid h-10 w-10 place-items-center rounded-lg font-black ${player.role === 'runner' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-orange-400/10 text-orange-400'}`}>{player.name.slice(0,1).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2 truncate text-sm font-bold">{player.name} {player.id === me.id && <span className="text-xs font-normal text-slate-500">(you)</span>} {(room.host_id === player.user_id || room.host_id === player.id) && <Crown size={14} className="text-amber-400"/>}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">{player.role} · {player.ready ? 'ready' : 'not ready'}</div></div>{host && player.id !== me.id && <button aria-label={`Remove ${player.name}`} disabled={busy} onClick={()=>void run('kick_player',{p_player:player.id})} className="grid h-10 w-10 place-items-center text-slate-500 hover:text-red-400"><X size={18}/></button>}</div>)}</div>
      <div className="mt-6 border-t border-slate-800 pt-5"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Your role</p><div className="grid grid-cols-2 gap-2">{(['runner','hunter'] as const).map(role=><button key={role} disabled={busy} onClick={()=>void run('update_player',{p_name:me.name,p_role:role,p_ready:me.ready})} className={`min-h-12 rounded-lg border text-sm font-bold uppercase ${me.role === role ? role === 'runner' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-orange-400 bg-orange-400/10 text-orange-400' : 'border-slate-700 text-slate-400'}`}>{role}</button>)}</div><button disabled={busy} onClick={()=>void run('update_player',{p_name:me.name,p_role:me.role,p_ready:!me.ready})} className="mt-3 min-h-12 w-full rounded-lg border border-slate-700 text-sm font-bold uppercase tracking-wide hover:border-emerald-400">{me.ready ? 'Cancel ready' : 'Mark ready'}</button></div>
    </section><section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6"><h2 className="flex items-center gap-2 font-bold uppercase tracking-wider"><Settings2 size={18} className="text-emerald-400"/> Mission settings</h2><p className="mt-2 text-xs text-slate-500">{host ? 'Only you can change the rules.' : 'The host controls these settings.'}</p><div className="mt-4 divide-y divide-slate-800">{options.map(item=><label key={item.key} className="flex min-h-14 items-center justify-between gap-4 text-sm text-slate-300"><span>{item.label}</span><select disabled={!host || busy} value={room[item.key]} onChange={e=>void run('update_settings',{p_settings:{[item.key]:Number(e.target.value)}})} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 font-mono text-xs text-white disabled:opacity-70">{item.values.map(value=><option key={value} value={value}>{item.suffix === 'min' ? value / 60 : value} {item.suffix}</option>)}</select></label>)}<label className="flex min-h-14 items-center justify-between gap-4 text-sm text-slate-300"><span>Catch mode</span><select disabled={!host || busy} value={room.catch_mode} onChange={e=>void run('update_settings',{p_settings:{catch_mode:e.target.value}})} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 font-mono text-xs text-white disabled:opacity-70"><option value="elimination">Elimination</option><option value="conversion">Role conversion</option></select></label></div>
      {host && <button disabled={busy || !active.some(p=>p.role==='runner') || !active.some(p=>p.role==='hunter')} onClick={()=>void run('start_game')} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-black uppercase tracking-wider text-slate-950 disabled:opacity-40">{busy ? <LoaderCircle className="animate-spin" size={18}/> : <><Play size={18}/> Start game</>}</button>}<p className="mt-3 text-xs leading-5 text-slate-500">At least one Runner and one Hunter are required. Keep your screen awake and play safely.</p>
    </section></div><button onClick={async()=>{await run('leave_room'); router.push('/');}} className="mt-5 min-h-11 text-sm text-slate-400 hover:text-white">Leave room</button>
  </Shell>;
}
function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-dvh bg-slate-950 px-5 pb-10 pt-5 text-slate-100"><div className="mx-auto max-w-5xl"><div className="flex items-center gap-2 text-xs font-black tracking-[.2em]"><Crosshair size={19} className="text-emerald-400"/> MAZE-RUNNER<span className="text-emerald-400">.</span></div>{children}</div></main>; }

