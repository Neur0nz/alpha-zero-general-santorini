# Adding ELO rating updates and pruning stale online games

The current frontend-only implementation records match moves and final results
but it does **not** update player ratings or automatically purge inactive
matches. The sections below outline one way to implement both behaviours on
Supabase so that rating changes and lobby cleanup run reliably on the backend.

## 1. Add an ELO update routine

1. **Create a helper function** that calculates the new ratings for both
   players. Store it in `supabase/functions` or run it once in the SQL editor.
   The snippet below uses the common 32-point K-factor and expects that a
   finished match row includes `winner_id` and `rated = true`.

   ```sql
   create or replace function public.apply_match_result(p_match_id uuid)
   returns void
   language plpgsql
   security definer
   as $$
   declare
     match_record public.matches%rowtype;
     creator public.players%rowtype;
     opponent public.players%rowtype;
     expected_creator float;
     expected_opponent float;
     score_creator float;
     score_opponent float;
     k_factor integer := 32;
   begin
     select * into match_record from public.matches where id = p_match_id;
     if match_record is null or match_record.rated is false then
       return;
     end if;

     if match_record.winner_id is null then
       return; -- ignore unfinished matches
     end if;

     select * into creator from public.players where id = match_record.creator_id;
     select * into opponent from public.players where id = match_record.opponent_id;

     if creator is null or opponent is null then
       return;
     end if;

     expected_creator := 1 / (1 + pow(10, (opponent.rating - creator.rating) / 400.0));
     expected_opponent := 1 / (1 + pow(10, (creator.rating - opponent.rating) / 400.0));

     if match_record.winner_id = creator.id then
       score_creator := 1;
       score_opponent := 0;
     elsif match_record.winner_id = opponent.id then
       score_creator := 0;
       score_opponent := 1;
     else
       score_creator := 0.5;
       score_opponent := 0.5;
     end if;

     update public.players
       set rating = round(rating + k_factor * (score_creator - expected_creator)),
           games_played = games_played + 1,
           updated_at = now()
       where id = creator.id;

     update public.players
       set rating = round(rating + k_factor * (score_opponent - expected_opponent)),
           games_played = games_played + 1,
           updated_at = now()
       where id = opponent.id;
   end;
   $$;
   ```

2. **Trigger the routine** whenever a match finishes. One option is an
   `AFTER UPDATE` trigger that runs when `status` transitions to `completed`.

   ```sql
   create or replace function public.handle_match_completed()
   returns trigger
   language plpgsql
   security definer
   as $$
   begin
     if new.status = 'completed' and old.status is distinct from 'completed' then
       perform public.apply_match_result(new.id);
     end if;
     return new;
   end;
   $$;

   drop trigger if exists match_completed_rating on public.matches;
   create trigger match_completed_rating
     after update on public.matches
     for each row
     execute procedure public.handle_match_completed();
   ```

3. **Call the trigger once per completed match.** The trigger only fires after
   the Supabase client sets `status = 'completed'`, so ensure the frontend does
   that as part of the post-game flow.

4. **Backfill historical games** by running `select public.apply_match_result(id)
   from public.matches where status = 'completed' and rated = true;` once after
   deploying the function.

## 2. Remove or archive stale matches

1. **Define the retention policy.** Decide how long a match can remain in
   `waiting_for_opponent` or `in_progress` before it is considered stale. The
   lobby hook currently marks the creator's own lobbies as abandoned after one
   hour on the client, but moving the logic to Supabase guarantees consistency.

2. **Create a scheduled job** using Supabase Cron (Project Settings → Database →
   Schedules) or an Edge Function invoked by an external scheduler. A simple SQL
   job that runs every 5 minutes could look like this:

   ```sql
   update public.matches
     set status = 'abandoned', updated_at = now()
   where status = 'waiting_for_opponent'
     and created_at < (now() - interval '30 minutes');

   update public.matches
     set status = 'abandoned', updated_at = now()
   where status = 'in_progress'
     and updated_at < (now() - interval '2 hours');
   ```

   Adjust the intervals to match your policy. If you prefer to delete rows
   instead of marking them abandoned, replace the `update` statements with
   `delete` queries.

3. **Prune orphaned move records** in the same job if needed:

   ```sql
   delete from public.match_moves
    where match_id in (
      select id from public.matches
      where status = 'abandoned'
        and updated_at < (now() - interval '7 days')
    );
   ```

4. **Secure the job** by running it as the database owner (the default for
   scheduled scripts) or by wrapping the SQL in a `security definer` function and
   invoking it through an Edge Function that uses the service role key.

Following these steps keeps the online ladder fair (through rating updates) and
prevents the lobby from filling up with stale matches. Re-run `apply_match_result`
whenever you tweak K-factor or scoring rules so the leaderboard stays accurate.
