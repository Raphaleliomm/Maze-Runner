'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ensureIdentity, message } from '@/lib/client';

export type Role = 'runner' | 'hunter';
export type Player = { id: string; user_id: string; name: string; role: Role; initial_role: Role; ready: boolean; active: boolean; eliminated: boolean; radar_until?: string | null; jammer_pending?: boolean; radar_used?: boolean; jammer_used?: boolean };
export type Room = { id: string; code: string; host_id: string; state: string; center_lat: number; center_lng: number; radius: number; ping_interval: number; duration: number; head_start: number; catch_radius: number; catch_mode: string; max_players: number; started_at?: string; grace_ends_at?: string; ends_at?: string; next_ping_at?: string; ended_at?: string; winner?: string };
export type Location = { player_id: string; lat: number; lng: number; accuracy?: number | null; recorded_at: string; pinged_at?: string };
export type CatchRequest = { id: string; hunter_id: string; runner_id: string; status: string; created_at: string };
export type Snapshot = { server_now: string; room: Room; players: Player[]; locations: Location[]; pings: Location[]; catches: CatchRequest[]; eligibility: string[]; me: Player };

const subscribeOnline = (callback: () => void) => { window.addEventListener('online', callback); window.addEventListener('offline', callback); return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback); }; };
const readOnline = () => navigator.onLine;

export function useRoom(code: string) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const online = useSyncExternalStore(subscribeOnline, readOnline, () => true);
  const [offset, setOffset] = useState(0);
  const pending = useRef(false);
  const reload = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const db = await ensureIdentity();
      const { data, error: err } = await db.rpc('room_state', { p_code: code });
      if (err) throw err;
      const snapshot = data as Snapshot;
      if (!snapshot?.room) throw new Error('Room not found or you are no longer a member.');
      setOffset(new Date(snapshot.server_now).getTime() - Date.now());
      setState(snapshot); setError('');
    } catch (e) { const detail = message(e); if (detail.includes('Room not found or access denied')) setState(null); setError(detail); } finally { pending.current = false; }
  }, [code]);
  useEffect(() => {
    const onOnline = () => { if (navigator.onLine) void reload(); };
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOnline);
    const initial = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void reload(); }, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOnline); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);
  const roomId=state?.room.id;
  useEffect(()=>{
    if (!roomId) return;
    let disposed=false;
    let cleanup: (()=>void) | undefined;
    void ensureIdentity().then(db=>{
      if (disposed) return;
      const channel=db.channel(`room-${roomId}`).on('postgres_changes',{event:'*',schema:'public',table:'room_events',filter:`room_id=eq.${roomId}`},()=>void reload()).subscribe(status=>{if(status==='SUBSCRIBED') void reload();});
      cleanup=()=>{void channel.unsubscribe();};
    }).catch(e=>setError(message(e)));
    return ()=>{disposed=true;cleanup?.();};
  },[roomId,reload]);
  return { state, error, online, offset, reload };
}

export function useClock(offset: number) {
  const [now, setNow] = useState(0);
  useEffect(() => { const first = window.setTimeout(() => setNow(Date.now()), 0); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => { window.clearTimeout(first); window.clearInterval(timer); }; }, []);
  return now ? now + offset : 0;
}

export function countdown(date: string | null | undefined, now: number) {
  if (!date || !now) return '--:--';
  const seconds = Math.max(0, Math.ceil((new Date(date).getTime() - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
