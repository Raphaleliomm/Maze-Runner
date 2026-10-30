import Link from 'next/link';
import { ArrowRight, Crosshair, MapPinned, Radio, ShieldCheck } from 'lucide-react';

export default function Home() {
  return <main className="min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 pb-8 pt-6 sm:px-10">
      <header className="flex items-center justify-between"><Link href="/" className="flex items-center gap-2 text-sm font-black tracking-[.22em]"><Crosshair className="text-emerald-400" size={23}/> MAZE-RUNNER<span className="text-emerald-400">.</span></Link><span className="font-mono text-[10px] tracking-[.2em] text-slate-500">LIVE FIELD SYSTEM / 01</span></header>
      <section className="relative flex flex-1 flex-col justify-center py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
        <div className="relative z-10"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/5 px-3 py-1.5 font-mono text-[10px] tracking-[.2em] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> YOUR CITY IS THE PLAYGROUND</div>
          <h1 className="max-w-xl text-6xl font-black uppercase leading-[.9] tracking-[-.06em] sm:text-8xl">The hunt<br/><span className="text-emerald-400">is on.</span></h1>
          <p className="mt-7 max-w-md text-base leading-7 text-slate-400">A real-world game of pursuit. Create a private room, pick a side, and turn the streets into your playing field.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/create" className="flex min-h-14 items-center justify-between gap-12 rounded-xl bg-emerald-400 px-6 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:bg-emerald-300">Create a room <ArrowRight size={19}/></Link><Link href="/join" className="flex min-h-14 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 px-7 text-sm font-bold uppercase tracking-wider transition hover:border-slate-500">Join with code</Link></div>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[10px] uppercase tracking-wider text-slate-500"><span className="flex items-center gap-2"><ShieldCheck size={14}/> Private rooms</span><span className="flex items-center gap-2"><MapPinned size={14}/> Real-world GPS</span><span className="flex items-center gap-2"><Radio size={14}/> Live multiplayer</span></div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute right-[-100px] top-1/4 h-[360px] w-[360px] opacity-30 sm:h-[500px] sm:w-[500px] lg:relative lg:right-auto lg:top-auto lg:opacity-100"><div className="absolute inset-0 rounded-full border border-emerald-500/20 bg-[repeating-radial-gradient(circle,transparent_0_58px,rgba(52,211,153,.12)_59px_60px)]"><div className="absolute left-1/2 top-0 h-full w-px bg-emerald-400/15"/><div className="absolute left-0 top-1/2 h-px w-full bg-emerald-400/15"/><div className="absolute left-[31%] top-[35%] h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_30px_10px_rgba(52,211,153,.4)]"/><div className="absolute left-[67%] top-[62%] h-4 w-4 rounded-full bg-orange-500 shadow-[0_0_30px_10px_rgba(249,115,22,.4)]"/><div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/30"/></div></div>
      </section><footer className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-5 font-mono text-[10px] uppercase tracking-wider text-slate-500"><span>Built for the chase</span><span>Play responsibly · Stay aware of your surroundings</span></footer>
    </div>
  </main>;
}
