# Supabase changes for server-side move validation

# Supabase changes for server-side move validation

These steps harden the multiplayer flow so every move and match result is
validated by an Edge Function before it reaches the database.

## 1. Add the authoritative board snapshot to `public.matches`

```sql
alter table public.matches add column if not exists initial_state jsonb;

-- Optional: close out any in-progress matches that predate this migration.
update public.matches
set status = 'abandoned'
where status = 'in_progress' and initial_state is null;

-- Provide a deterministic baseline snapshot for legacy rows so the new code
-- can import them. New matches created through the Edge Function will insert
-- their own randomised start state automatically.
update public.matches
set initial_state = '{
  "version": 1,
  "player": 0,
  "board": [
    [[0,0,0],[1,0,0],[0,0,0],[2,0,0],[0,0,0]],
    [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    [[0,0,0],[-1,0,0],[0,0,0],[-2,0,0],[0,0,0]]
  ],
  "history": [],
  "future": [],
  "gameEnded": [0,0],
  "validMoves": []
}'::jsonb
where initial_state is null;

alter table public.matches
  alter column initial_state set not null;
```

If you prefer to archive older matches instead, delete the legacy rows before
running the final `alter column` statement.

## 2. Restrict direct inserts into `public.match_moves`

The validator uses the service-role key and bypasses Row Level Security, so
regular clients no longer need an `INSERT` policy on `public.match_moves`.
Drop the old policy if it exists:

```sql
drop policy if exists "Participants can record moves" on public.match_moves;
```

## 3. Configure secrets for Edge Functions

Both Edge Functions require the service-role key:

```bash
supabase functions secrets set \
  SUPABASE_URL="https://<project-ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

Run the command from the repository root (the CLI detects `supabase/config.toml`).

## 4. Deploy the new Edge Functions

```bash
supabase functions deploy create-match
supabase functions deploy submit-move
```

After deployment, future lobby operations will use the new functions
automatically.

## 5. Verify realtime streaming

Ensure `public.matches` and `public.match_moves` remain enabled for Realtime
updates so clients receive the authoritative snapshots as soon as they are
inserted.
