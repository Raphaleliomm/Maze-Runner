-- Run as the database owner against a disposable Supabase project, after migration:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/game.sql
-- Everything, including the temporary room and coordinates, is rolled back.
begin;
do $$
declare a uuid:='10000000-0000-4000-8000-000000000001'; b uuid:='10000000-0000-4000-8000-000000000002'; outsider uuid:='10000000-0000-4000-8000-000000000003';
 v_code text; v_room_id uuid; runner uuid; hunter uuid; claim uuid; s jsonb; first_ping jsonb;
begin
 if has_table_privilege('authenticated','private.locations','SELECT') or has_function_privilege('authenticated','private.finish(uuid,text)','EXECUTE') then raise exception 'Private objects exposed'; end if;
 if abs(private.distance_m(0,0,0,1)-111194.9)>10 then raise exception 'Distance calculation failed'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 v_code:=public.create_room('Runner',52,13,5)->>'code';
 select id into v_room_id from private.rooms where private.rooms.code=v_code;
 select id into runner from private.players where user_id=a and private.players.room_id=v_room_id;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.join_room(v_code,'Hunter','hunter');
 select id into hunter from private.players where user_id=b and private.players.room_id=v_room_id;
 begin perform public.start_game(v_code); raise exception 'non-host started'; exception when others then if sqlerrm='non-host started' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.update_settings(v_code,'{"head_start":0,"ping_interval":60}'::jsonb);
 perform public.start_game(v_code);
 begin perform public.start_game(v_code); raise exception 'duplicate start'; exception when others then if sqlerrm='duplicate start' then raise; end if; end;
 perform public.update_location(v_code,52,13,5);
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.update_location(v_code,52.01,13,5);
 s:=public.room_state(v_code);
 if jsonb_array_length(s->'locations')<>1 or jsonb_array_length(s->'eligibility')<>0 then raise exception 'Runner privacy or distant eligibility failed'; end if;
 begin perform public.request_catch(v_code,runner); raise exception 'distant catch allowed'; exception when others then if sqlerrm='distant catch allowed' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 begin perform public.room_state(v_code); raise exception 'outsider saw room'; exception when others then if sqlerrm='outsider saw room' then raise; end if; end;
 for i in 1..20 loop
  s:=public.join_room('AAAAAA','Outsider','hunter');
  if s->>'error' is null then raise exception 'Invalid code accepted'; end if;
 end loop;
 s:=public.join_room(v_code,'Outsider','hunter');
 if s->>'error' not like 'Too many attempts%' then raise exception 'Join rate limit failed'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.use_jammer(v_code);
 update private.rooms set next_ping_at=clock_timestamp()-interval '1 second' where id=v_room_id;
 perform private.reconcile(v_room_id);
 if exists(select 1 from private.pings where player_id=runner) or (select jammer_pending from private.players where id=runner) then raise exception 'Jammer failed'; end if;
 update private.rooms set next_ping_at=clock_timestamp()-interval '1 second' where id=v_room_id;
 perform private.reconcile(v_room_id);
 select to_jsonb(p) into first_ping from private.pings p where player_id=runner;
 if first_ping is null then raise exception 'Scheduled ping missing'; end if;
 perform public.update_location(v_code,52.00001,13,5);
 if (select to_jsonb(p) from private.pings p where player_id=runner)<>first_ping then raise exception 'Ping was not static'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.use_radar(v_code);
 s:=public.room_state(v_code); if jsonb_array_length(s->'locations')<>2 then raise exception 'Radar failed'; end if;
 update private.players set radar_until=clock_timestamp()-interval '1 second' where id=hunter;
 s:=public.room_state(v_code); if jsonb_array_length(s->'locations')<>1 then raise exception 'Radar did not expire'; end if;
 perform public.update_location(v_code,52,13,5);
 s:=public.room_state(v_code); if jsonb_array_length(s->'eligibility')<>1 then raise exception 'Nearby eligibility failed'; end if;
 perform public.request_catch(v_code,runner);
 select id into claim from private.catches where runner_id=runner and status='pending';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.resolve_catch(v_code,claim,true);
 if (select state from private.rooms where id=v_room_id)<>'ENDED' or (select winner from private.rooms where id=v_room_id)<>'hunters' then raise exception 'Catch/end failed'; end if;
 begin perform public.resolve_catch(v_code,claim,true); raise exception 'duplicate resolution'; exception when others then if sqlerrm='duplicate resolution' then raise; end if; end;

 -- A second match covers grace, conversion and old-location removal.
 perform set_config('request.jwt.claim.sub',a::text,true);
 v_code:=public.create_room('Runner',52,13,5)->>'code';
 select id into v_room_id from private.rooms where private.rooms.code=v_code;
 select id into runner from private.players where user_id=a and private.players.room_id=v_room_id;
 perform public.update_settings(v_code,'{"head_start":120,"ping_interval":60,"catch_mode":"conversion"}'::jsonb);
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.join_room(v_code,'Hunter','hunter');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.start_game(v_code);
 perform public.update_location(v_code,52,13,5);
 if (select state from private.rooms where id=v_room_id)<>'GRACE_PERIOD' or exists(select 1 from private.pings where private.pings.room_id=v_room_id) then raise exception 'Grace period failed'; end if;
 update private.rooms set grace_ends_at=clock_timestamp()-interval '1 second' where id=v_room_id;
 perform private.reconcile(v_room_id);
 if (select state from private.rooms where id=v_room_id)<>'ACTIVE' or exists(select 1 from private.pings where private.pings.room_id=v_room_id) then raise exception 'Grace transition or early ping failed'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.update_location(v_code,52,13,5);
 perform public.request_catch(v_code,runner);
 select id into claim from private.catches where runner_id=runner and status='pending';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.resolve_catch(v_code,claim,true);
 if (select role from private.players where id=runner)<>'hunter' or exists(select 1 from private.locations where player_id=runner) then raise exception 'Conversion leaked old location'; end if;

 -- Ending a match removes both current fixes and static ping coordinates.
 v_code:=public.create_room('Runner',52,13,5)->>'code';
 select id into v_room_id from private.rooms where private.rooms.code=v_code;
 perform public.update_settings(v_code,'{"head_start":0,"ping_interval":60}'::jsonb);
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.join_room(v_code,'Hunter','hunter');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.start_game(v_code);
 perform public.update_location(v_code,52,13,5);
 update private.rooms set next_ping_at=clock_timestamp()-interval '1 second' where id=v_room_id;
 perform private.reconcile(v_room_id);
 if not exists(select 1 from private.pings where private.pings.room_id=v_room_id) then raise exception 'Expected ping before end'; end if;
 perform public.end_game(v_code);
 s:=public.room_state(v_code);
 if jsonb_array_length(s->'pings')<>0 or jsonb_array_length(s->'locations')<>0 then raise exception 'Coordinates survived game end'; end if;
 raise notice 'Game integration checks passed';
end $$;
-- Exercise the public invalidation table under the actual authenticated role.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin if not exists(select 1 from public.room_events) then raise exception 'Member cannot read invalidations'; end if; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.room_events) then raise exception 'Outsider can read invalidations'; end if; end $$;
reset role;
rollback;
