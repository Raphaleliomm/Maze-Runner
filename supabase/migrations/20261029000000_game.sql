-- Server-authoritative game. Runner coordinates never enter a Realtime publication.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.rooms (
 id uuid primary key default gen_random_uuid(), code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
 host_id uuid not null, state text not null default 'LOBBY' check (state in ('LOBBY','GRACE_PERIOD','ACTIVE','ENDED')),
 center_lat double precision not null check (center_lat between -90 and 90), center_lng double precision not null check (center_lng between -180 and 180),
 ping_interval integer not null default 300 check (ping_interval in (60,180,300,600)), radius integer not null default 500 check (radius in (250,500,1000,2000)),
 duration integer not null default 1800 check (duration in (900,1800,3600,5400)), head_start integer not null default 120 check (head_start in (0,120,300,600)),
 catch_radius integer not null default 15 check (catch_radius between 5 and 50), catch_mode text not null default 'elimination' check (catch_mode in ('elimination','conversion')),
 max_players integer not null default 12 check (max_players between 2 and 50),
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '24 hours'),
 started_at timestamptz, grace_ends_at timestamptz, ends_at timestamptz, ended_at timestamptz, next_ping_at timestamptz, winner text check (winner in ('runners','hunters','none'))
);
create table private.players (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references private.rooms on delete cascade, user_id uuid not null,
 name text not null check (char_length(name) between 1 and 24), role text not null check (role in ('runner','hunter')),
 initial_role text not null check (initial_role in ('runner','hunter')), ready boolean not null default false, active boolean not null default true,
 eliminated boolean not null default false, kicked boolean not null default false, joined_at timestamptz not null default now(), left_at timestamptz,
 radar_used boolean not null default false, radar_until timestamptz, jammer_used boolean not null default false, jammer_pending boolean not null default false,
 unique(room_id,user_id)
);
create index players_room on private.players(room_id);
create table private.join_attempts (user_id uuid primary key, window_started_at timestamptz not null, attempts integer not null check(attempts>0));
create table private.locations (
 player_id uuid primary key references private.players on delete cascade, lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180), accuracy double precision not null check(accuracy between 0 and 10000), recorded_at timestamptz not null default now()
);
create table private.pings (
 player_id uuid primary key references private.players on delete cascade, room_id uuid not null references private.rooms on delete cascade,
 lat double precision not null, lng double precision not null, accuracy double precision not null, recorded_at timestamptz not null, pinged_at timestamptz not null
);
create table private.catches (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references private.rooms on delete cascade,
 hunter_id uuid not null references private.players on delete cascade, runner_id uuid not null references private.players on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','expired')),
 created_at timestamptz not null default now(), resolved_at timestamptz
);
create index catches_room on private.catches(room_id,created_at desc);
create unique index one_pending_catch on private.catches(runner_id) where status='pending';
-- Only invalidations; no location or other sensitive payloads.
create table public.room_events (id bigint generated always as identity primary key, room_id uuid not null references private.rooms on delete cascade, created_at timestamptz not null default now());
create index room_events_created_at on public.room_events(created_at);
alter table public.room_events enable row level security;
revoke all on public.room_events from public, anon, authenticated;
grant select on public.room_events to authenticated;

create function private.is_member(p_room uuid) returns boolean language sql stable security definer set search_path = pg_catalog, private, auth as $$
 select exists(select 1 from private.players where room_id=p_room and user_id=auth.uid() and active)
$$;
create policy member_events on public.room_events for select to authenticated using (private.is_member(room_id));
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
alter publication supabase_realtime add table public.room_events;

create function private.notify(p_room uuid) returns void language sql security definer set search_path = pg_catalog, public as $$ insert into public.room_events(room_id) values(p_room) $$;
create function private.distance_m(a_lat double precision,a_lng double precision,b_lat double precision,b_lng double precision) returns double precision language sql immutable strict set search_path=pg_catalog as $$
 select 6371000.0 * 2 * asin(sqrt(least(1.0, power(sin(radians(b_lat-a_lat)/2),2)+cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lng-a_lng)/2),2))))
$$;
create function private.room_for(p_code text) returns private.rooms language plpgsql security definer set search_path=pg_catalog,private,auth as $$
declare r private.rooms;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from private.rooms where code=upper(trim(p_code)) and expires_at>now() for update;
 if r.id is null or not exists(select 1 from private.players where room_id=r.id and user_id=auth.uid() and active) then raise exception 'Room not found or access denied'; end if;
 return r;
end $$;

create function public.create_room(p_name text,p_lat double precision,p_lng double precision,p_accuracy double precision) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public,auth,extensions as $$
declare r private.rooms; c text; i integer; alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; bytes bytea;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name)) not between 1 and 24 or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 10000 then raise exception 'Invalid player or location'; end if;
 for i in 1..20 loop
  bytes:=extensions.gen_random_bytes(6); c:='';
  for j in 0..5 loop c:=c||substr(alphabet,(get_byte(bytes,j)%length(alphabet))+1,1); end loop;
  begin insert into private.rooms(code,host_id,center_lat,center_lng) values(c,auth.uid(),p_lat,p_lng) returning * into r; exit; exception when unique_violation then null; end;
 end loop;
 if r.id is null then raise exception 'Could not create room'; end if;
 insert into private.players(room_id,user_id,name,role,initial_role) values(r.id,auth.uid(),trim(p_name),'runner','runner');
 perform private.notify(r.id); return jsonb_build_object('code',r.code);
end $$;

create function public.join_room(p_code text,p_name text,p_role text) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; existing private.players; attempt_count integer; t timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name)) not between 1 and 24 or p_role not in ('runner','hunter') then raise exception 'Invalid player'; end if;
 -- Return errors instead of raising: an exception would roll back the counter.
 insert into private.join_attempts(user_id,window_started_at,attempts) values(auth.uid(),t,1)
 on conflict(user_id) do update set
  attempts=case when private.join_attempts.window_started_at<t-interval '5 minutes' then 1 else private.join_attempts.attempts+1 end,
  window_started_at=case when private.join_attempts.window_started_at<t-interval '5 minutes' then t else private.join_attempts.window_started_at end
 returning attempts into attempt_count;
 if attempt_count>20 then return jsonb_build_object('error','Too many attempts. Try again in five minutes.'); end if;
 select * into r from private.rooms where code=upper(trim(p_code)) and expires_at>now() for update;
 if r.id is null then return jsonb_build_object('error','Room unavailable or code invalid.'); end if;
 select * into existing from private.players where room_id=r.id and user_id=auth.uid();
 if existing.id is not null and existing.active then return jsonb_build_object('code',r.code); end if;
 if existing.kicked or r.state<>'LOBBY' or (select count(*) from private.players where room_id=r.id and active)>=r.max_players then return jsonb_build_object('error','Room unavailable or code invalid.'); end if;
 insert into private.players(room_id,user_id,name,role,initial_role) values(r.id,auth.uid(),trim(p_name),p_role,p_role)
 on conflict(room_id,user_id) do update set active=true,left_at=null,name=excluded.name,role=excluded.role,initial_role=excluded.role,ready=false;
 perform private.notify(r.id); return jsonb_build_object('code',r.code);
end $$;

create function public.update_player(p_code text,p_name text default null,p_role text default null,p_ready boolean default null) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms;
begin r:=private.room_for(p_code); if r.state<>'LOBBY' then raise exception 'Lobby is closed'; end if;
 if p_name is not null and length(trim(p_name)) not between 1 and 24 then raise exception 'Invalid name'; end if;
 if p_role is not null and p_role not in ('runner','hunter') then raise exception 'Invalid role'; end if;
 update private.players set name=coalesce(trim(p_name),name),role=coalesce(p_role,role),initial_role=coalesce(p_role,initial_role),ready=coalesce(p_ready,ready) where room_id=r.id and user_id=auth.uid() and active;
 perform private.notify(r.id);
end $$;

create function public.update_settings(p_code text,p_settings jsonb) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms;
begin r:=private.room_for(p_code); if r.host_id<>auth.uid() or r.state<>'LOBBY' then raise exception 'Only the host can change lobby settings'; end if;
 update private.rooms set ping_interval=coalesce((p_settings->>'ping_interval')::integer,ping_interval),radius=coalesce((p_settings->>'radius')::integer,radius),duration=coalesce((p_settings->>'duration')::integer,duration),head_start=coalesce((p_settings->>'head_start')::integer,head_start),catch_radius=coalesce((p_settings->>'catch_radius')::integer,catch_radius),catch_mode=coalesce(p_settings->>'catch_mode',catch_mode),max_players=coalesce((p_settings->>'max_players')::integer,max_players) where id=r.id;
 if (select max_players from private.rooms where id=r.id)<(select count(*) from private.players where room_id=r.id and active) then raise exception 'Maximum is below current player count'; end if;
 perform private.notify(r.id);
end $$;

create function public.start_game(p_code text) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; t timestamptz:=clock_timestamp();
begin r:=private.room_for(p_code); if r.host_id<>auth.uid() or r.state<>'LOBBY' then raise exception 'Only the host can start the lobby'; end if;
 if not exists(select 1 from private.players where room_id=r.id and active and role='runner') or not exists(select 1 from private.players where room_id=r.id and active and role='hunter') then raise exception 'At least one runner and hunter are required'; end if;
 update private.rooms set state=case when head_start=0 then 'ACTIVE' else 'GRACE_PERIOD' end,started_at=t,grace_ends_at=t+make_interval(secs=>head_start),ends_at=t+make_interval(secs=>duration),next_ping_at=t+make_interval(secs=>head_start+ping_interval),expires_at=t+make_interval(secs=>duration)+interval '24 hours' where id=r.id;
 perform private.notify(r.id);
end $$;

create function private.finish(p_room uuid,p_winner text) returns void language plpgsql security definer set search_path=pg_catalog,private,public as $$
begin update private.rooms set state='ENDED',ended_at=clock_timestamp(),winner=p_winner where id=p_room and state<>'ENDED';
 delete from private.locations where player_id in(select id from private.players where room_id=p_room);
 delete from private.pings where room_id=p_room;
 update private.catches set status='expired',resolved_at=clock_timestamp() where room_id=p_room and status='pending';
 perform private.notify(p_room);
end $$;
create function private.check_winner(p_room uuid) returns void language plpgsql security definer set search_path=pg_catalog,private as $$
begin if not exists(select 1 from private.players where room_id=p_room and active and role='runner' and not eliminated) then perform private.finish(p_room,'hunters'); end if; end $$;

-- Scheduler locks the room row, so jammer activation, catches, and concurrent ticks serialize.
create function private.reconcile(p_room uuid) returns void language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare r private.rooms; t timestamptz:=clock_timestamp(); due timestamptz;
begin
 select * into r from private.rooms where id=p_room for update;
 if r.id is null or r.state not in ('GRACE_PERIOD','ACTIVE') then return; end if;
 if t>=r.ends_at then perform private.finish(r.id,'runners'); return; end if;
 if r.state='GRACE_PERIOD' and t>=r.grace_ends_at then update private.rooms set state='ACTIVE' where id=r.id; perform private.notify(r.id); end if;
 if t>=r.next_ping_at then
  due:=r.next_ping_at;
  insert into private.pings(player_id,room_id,lat,lng,accuracy,recorded_at,pinged_at)
   select p.id,r.id,l.lat,l.lng,l.accuracy,l.recorded_at,t from private.players p join private.locations l on l.player_id=p.id
   where p.room_id=r.id and p.active and not p.eliminated and p.role='runner' and not p.jammer_pending and l.recorded_at>=t-interval '30 seconds' and l.accuracy<=100
   on conflict(player_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,recorded_at=excluded.recorded_at,pinged_at=excluded.pinged_at;
  update private.players set jammer_pending=false where room_id=r.id and active and role='runner' and jammer_pending;
  -- Skip missed periods, never publish a burst of historical positions after downtime.
  update private.rooms set next_ping_at=due+make_interval(secs => (floor(extract(epoch from (t-due))/r.ping_interval)::integer+1)*r.ping_interval) where id=r.id;
  perform private.notify(r.id);
 end if;
 update private.catches set status='expired',resolved_at=t where room_id=r.id and status='pending' and created_at<t-interval '60 seconds';
end $$;

create function public.tick_games() returns void language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare x record;
begin
 for x in select id from private.rooms where state in ('GRACE_PERIOD','ACTIVE') and ((state='GRACE_PERIOD' and grace_ends_at<=clock_timestamp()) or next_ping_at<=clock_timestamp() or ends_at<=clock_timestamp()) loop perform private.reconcile(x.id); end loop;
 delete from public.room_events where created_at<now()-interval '1 hour';
 delete from private.join_attempts where window_started_at<now()-interval '1 hour';
 delete from private.rooms where expires_at<now();
end $$;
revoke all on function public.tick_games() from public,anon,authenticated;

create function public.end_game(p_code text) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms;
begin r:=private.room_for(p_code); if r.host_id<>auth.uid() or r.state not in ('GRACE_PERIOD','ACTIVE') then raise exception 'Only the host can end an active game'; end if; perform private.finish(r.id,'none'); end $$;

create function public.leave_room(p_code text) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; p private.players; new_host uuid;
begin r:=private.room_for(p_code); select * into p from private.players where room_id=r.id and user_id=auth.uid() and active;
 delete from private.locations where player_id=p.id; delete from private.pings where player_id=p.id;
 update private.players set active=false,left_at=clock_timestamp(),radar_until=null where id=p.id;
 update private.catches set status='expired',resolved_at=clock_timestamp() where status='pending' and (hunter_id=p.id or runner_id=p.id);
 if r.host_id=auth.uid() then select user_id into new_host from private.players where room_id=r.id and active order by joined_at limit 1; if new_host is not null then update private.rooms set host_id=new_host where id=r.id; end if; end if;
 if r.state in ('GRACE_PERIOD','ACTIVE') then perform private.check_winner(r.id); end if;
 perform private.notify(r.id);
end $$;
create function public.kick_player(p_code text,p_player uuid) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms;
begin r:=private.room_for(p_code); if r.host_id<>auth.uid() then raise exception 'Only the host can remove players'; end if;
 if not exists(select 1 from private.players where id=p_player and room_id=r.id and user_id<>auth.uid() and active) then raise exception 'Player not found'; end if;
 delete from private.locations where player_id=p_player; delete from private.pings where player_id=p_player;
 update private.players set active=false,kicked=true,left_at=clock_timestamp(),radar_until=null where id=p_player;
 update private.catches set status='expired',resolved_at=clock_timestamp() where status='pending' and (hunter_id=p_player or runner_id=p_player);
 if r.state in ('GRACE_PERIOD','ACTIVE') then perform private.check_winner(r.id); end if; perform private.notify(r.id);
end $$;

create function public.update_location(p_code text,p_lat double precision,p_lng double precision,p_accuracy double precision) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; p private.players;
begin r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 if r.state not in ('GRACE_PERIOD','ACTIVE') then raise exception 'Game is not active'; end if;
 select * into p from private.players where room_id=r.id and user_id=auth.uid() and active and not eliminated;
 if p.id is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 10000 then raise exception 'Invalid location or player'; end if;
 insert into private.locations(player_id,lat,lng,accuracy,recorded_at) values(p.id,p_lat,p_lng,p_accuracy,clock_timestamp()) on conflict(player_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,recorded_at=excluded.recorded_at;
 -- Coordinate-free notification; authorised viewers fetch their own filtered snapshot.
 if p.role='hunter' or p.role='runner' then perform private.notify(r.id); end if;
end $$;

create function public.use_radar(p_code text) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; p private.players;
begin r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 select * into p from private.players where room_id=r.id and user_id=auth.uid() and active and not eliminated;
 if r.state<>'ACTIVE' or p.role is distinct from 'hunter' or p.radar_used then raise exception 'Radar unavailable'; end if;
 update private.players set radar_used=true,radar_until=clock_timestamp()+interval '30 seconds' where id=p.id; perform private.notify(r.id);
end $$;
create function public.use_jammer(p_code text) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; p private.players;
begin r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 select * into p from private.players where room_id=r.id and user_id=auth.uid() and active and not eliminated;
 if r.state<>'ACTIVE' or p.role is distinct from 'runner' or p.jammer_used then raise exception 'Jammer unavailable'; end if;
 update private.players set jammer_used=true,jammer_pending=true where id=p.id; perform private.notify(r.id);
end $$;

create function public.request_catch(p_code text,p_runner uuid) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; h private.players; q private.players; hl private.locations; ql private.locations; t timestamptz:=clock_timestamp();
begin r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 select * into h from private.players where room_id=r.id and user_id=auth.uid() and active and not eliminated;
 select * into q from private.players where id=p_runner and room_id=r.id and active and not eliminated;
 if r.state<>'ACTIVE' or h.role<>'hunter' or q.role is distinct from 'runner' or h.id=q.id then raise exception 'Invalid catch'; end if;
 if exists(select 1 from private.catches where hunter_id=h.id and runner_id=q.id and created_at>t-interval '30 seconds') then raise exception 'Please wait before requesting another catch'; end if;
 select * into hl from private.locations where player_id=h.id; select * into ql from private.locations where player_id=q.id;
 if hl.recorded_at is null or ql.recorded_at is null or hl.recorded_at<t-interval '30 seconds' or ql.recorded_at<t-interval '30 seconds' or hl.accuracy>30 or ql.accuracy>30 or private.distance_m(hl.lat,hl.lng,ql.lat,ql.lng)>r.catch_radius+least(10,(hl.accuracy+ql.accuracy)/2) then raise exception 'Players are not close enough or GPS is stale or inaccurate'; end if;
 insert into private.catches(room_id,hunter_id,runner_id) values(r.id,h.id,q.id);
 perform private.notify(r.id);
end $$;
create function public.resolve_catch(p_code text,p_request uuid,p_accept boolean) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; c private.catches; p private.players;
begin r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 select * into p from private.players where room_id=r.id and user_id=auth.uid() and active;
 select * into c from private.catches where id=p_request and room_id=r.id for update;
 if r.state<>'ACTIVE' or c.runner_id is distinct from p.id or c.status is distinct from 'pending' or c.created_at<clock_timestamp()-interval '60 seconds' then raise exception 'Catch request no longer valid'; end if;
 update private.catches set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=clock_timestamp() where id=c.id;
 if p_accept then
  delete from private.locations where player_id=p.id; delete from private.pings where player_id=p.id;
  if r.catch_mode='conversion' then update private.players set role='hunter',jammer_pending=false where id=p.id; else update private.players set eliminated=true,jammer_pending=false where id=p.id; end if;
  perform private.check_winner(r.id);
 end if; perform private.notify(r.id);
end $$;
create function public.surrender(p_code text) returns void language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; p private.players;
begin r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 select * into p from private.players where room_id=r.id and user_id=auth.uid() and active and not eliminated;
 if r.state<>'ACTIVE' or p.role is distinct from 'runner' then raise exception 'Surrender unavailable'; end if;
 delete from private.locations where player_id=p.id; delete from private.pings where player_id=p.id;
 if r.catch_mode='conversion' then update private.players set role='hunter',jammer_pending=false where id=p.id; else update private.players set eliminated=true,jammer_pending=false where id=p.id; end if;
 update private.catches set status='expired',resolved_at=clock_timestamp() where runner_id=p.id and status='pending';
 perform private.check_winner(r.id); perform private.notify(r.id);
end $$;

create function public.room_state(p_code text) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public,auth as $$
declare r private.rooms; me private.players; result jsonb;
begin
 r:=private.room_for(p_code); perform private.reconcile(r.id); select * into r from private.rooms where id=r.id;
 select * into me from private.players where room_id=r.id and user_id=auth.uid() and active;
 select jsonb_build_object(
  'server_now',clock_timestamp(),
  'room',to_jsonb(r),
  'me',to_jsonb(me),
  'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'name',p.name,'role',p.role,'initial_role',p.initial_role,'ready',p.ready,'active',p.active,'eliminated',p.eliminated,'joined_at',p.joined_at,'left_at',p.left_at) order by p.joined_at) from private.players p where p.room_id=r.id),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'lat',l.lat,'lng',l.lng,'accuracy',l.accuracy,'recorded_at',l.recorded_at)) from private.locations l join private.players p on p.id=l.player_id where p.room_id=r.id and p.active and not p.eliminated and (p.id=me.id or p.role='hunter' or (me.role='hunter' and not me.eliminated and me.radar_until>clock_timestamp() and p.role='runner'))),'[]'::jsonb),
  'pings',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.player_id,'lat',p.lat,'lng',p.lng,'accuracy',p.accuracy,'recorded_at',p.recorded_at,'pinged_at',p.pinged_at)) from private.pings p where p.room_id=r.id),'[]'::jsonb),
  'catches',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'hunter_id',c.hunter_id,'runner_id',c.runner_id,'status',c.status,'created_at',c.created_at,'resolved_at',c.resolved_at) order by c.created_at desc) from private.catches c where c.room_id=r.id),'[]'::jsonb),
  'eligibility',coalesce((select jsonb_agg(p.id) from private.players p join private.locations l on l.player_id=p.id join private.locations own on own.player_id=me.id where r.state='ACTIVE' and me.role='hunter' and not me.eliminated and p.room_id=r.id and p.active and not p.eliminated and p.role='runner' and l.recorded_at>clock_timestamp()-interval '30 seconds' and own.recorded_at>clock_timestamp()-interval '30 seconds' and l.accuracy<=30 and own.accuracy<=30 and private.distance_m(l.lat,l.lng,own.lat,own.lng)<=r.catch_radius+least(10,(l.accuracy+own.accuracy)/2)),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- PostgreSQL grants function execution to PUBLIC by default. Explicitly close every
-- internal entry point; the sole exception is the membership predicate for RLS.
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(uuid) to authenticated;
revoke all on function public.create_room(text,double precision,double precision,double precision), public.join_room(text,text,text), public.room_state(text), public.update_player(text,text,text,boolean), public.update_settings(text,jsonb), public.start_game(text), public.end_game(text), public.leave_room(text), public.kick_player(text,uuid), public.update_location(text,double precision,double precision,double precision), public.use_radar(text), public.use_jammer(text), public.request_catch(text,uuid), public.resolve_catch(text,uuid,boolean), public.surrender(text) from public, anon;
grant execute on function public.create_room(text,double precision,double precision,double precision), public.join_room(text,text,text), public.room_state(text), public.update_player(text,text,text,boolean), public.update_settings(text,jsonb), public.start_game(text), public.end_game(text), public.leave_room(text), public.kick_player(text,uuid), public.update_location(text,double precision,double precision,double precision), public.use_radar(text), public.use_jammer(text), public.request_catch(text,uuid), public.resolve_catch(text,uuid,boolean), public.surrender(text) to authenticated;

-- Supabase pg_cron supports second-based schedules. Reconciliation continues even
-- with zero connected clients; each run serializes on its room row.
create extension if not exists pg_cron;
select cron.schedule('manhunt-reconcile', '5 seconds', 'select public.tick_games()');
select cron.schedule('manhunt-cron-log-cleanup', '0 3 * * *', $$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('manhunt-reconcile','manhunt-cron-log-cleanup')) and end_time < now()-interval '7 days'$$);
