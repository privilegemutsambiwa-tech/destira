# Backups: the daily check and the restore drill

Destira's data lives in one Supabase Postgres database (project
`kqqlvgevrqxvicucpchf`). This page covers what protects it, the check that
runs every day, and the drill that proves a backup really restores. The
owner runs the drill; nothing here is automatic except the daily check.

## What protects the data

| What | Covered by | Notes |
|---|---|---|
| The database (members, matches, messages, payments, events…) | Supabase daily backups, **on paid plans only** | Pro keeps 7 days, Team 14, Enterprise 30. The free plan has **no** automatic backups. |
| | Point-in-time recovery (optional Pro add-on) | Restores to any moment in the window; replaces the daily backups. |
| | The weekly off-site dump below | Yours, kept outside Supabase. Essential on the free plan; still wise on Pro. |
| Photos, voice notes, videos (Storage bucket `user-photos`) | **Nothing yet** | Database backups hold only the file *records*, not the files. Restoring an old backup doesn't bring back deleted files. |
| Passwords of custom database roles | Not in backups | Destira doesn't use custom roles; if that changes, reset them after a restore. |

Supabase's own page: https://supabase.com/docs/guides/platform/backups

## The daily backup check

Once a day the server asks Supabase's Management API which backups exist
(`server/admin/backup-check.ts`). It records the answer and emails an alert
("Database backup missing or late") when anything is wrong. The latest result
and the last 14 days are at the top of the console's **Errors** page, with a
**Check now** button (admins).

### Setting it up (once)

1. Make the table, from the repository folder:
   ```
   npx tsx --env-file=.env scripts/migrate-backup-checks.ts
   ```
2. Make a Supabase personal access token: supabase.com/dashboard/account/tokens,
   signed in to the account that owns the Destira project. Name it "Destira
   backup check".
3. Add it to the **server's** environment on the host as
   `SUPABASE_ACCESS_TOKEN`, then redeploy. Never put it in `.env` files that
   are committed. The project ref is read from `DATABASE_URL`; set
   `SUPABASE_PROJECT_REF=kqqlvgevrqxvicucpchf` too if that ever fails.
4. In the console, check the "Database backup missing or late" alert is on and
   goes to the right address (**Email alerts**).
5. Open **Errors** and press **Check now**. It should say "Backed up · last
   backup N h ago".

A personal access token can do anything your Supabase account can. Keep it
only on the server, and revoke it in the same dashboard page if it leaks.

### What each result means

| Console says | Meaning | What to do |
|---|---|---|
| **Backed up** | The newest finished backup is under 26 hours old, or point-in-time recovery is on. | Nothing. |
| **Backup is late** | The newest backup is over 26 hours old. | Open the project's **Database → Backups** page in Supabase. If the newest is really old, contact Supabase support, and take an off-site dump now (below). |
| **No backups found** | Supabase lists none. Almost always: the project is on the free plan. | Move to Pro for daily backups, and keep the weekly off-site dump going either way. |
| **Couldn't check** | The token was refused, or Supabase didn't answer. | "Refused": make a new token (step 2) and replace it on the server. Otherwise wait for tomorrow's check, or press **Check now** later. |
| **Backup check not set up** | No token on the server. | Do "Setting it up" above. |

## The weekly off-site dump

A copy of the database kept outside Supabase. It needs the PostgreSQL 17 client
tools (`pg_dump`, `pg_restore`); on Windows, install "PostgreSQL 17" and tick
only "Command Line Tools". Use the **session pooler** connection string from
Supabase (**Connect** → Session pooler, port 5432), not the transaction pooler
(port 6543), which `pg_dump` can't use.

```powershell
$env:PGURL = "postgresql://postgres.kqqlvgevrqxvicucpchf:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
pg_dump $env:PGURL --schema=public --format=custom --no-owner --no-privileges --file "destira-$(Get-Date -Format yyyy-MM-dd).dump"
```

Keep the file somewhere that isn't this laptop and isn't Supabase: an
encrypted drive, or a private cloud folder. It holds members' personal data,
so treat it like the database itself. Keep the last four and delete older ones.

## The restore drill (every 3 months, and after big schema changes)

A backup you've never restored is a hope, not a backup. The drill restores
one into a **separate, throwaway** database and checks it. It never touches
production.

**Never** press **Restore** on the production project's Backups page for a
drill. That overwrites the live database and takes the app down while it runs.

### 1. Make the restored copy

Pick one:

- **From a Supabase backup (paid plans).** In the production project:
  **Database → Backups → Restore to a new project**. Supabase calls this
  "duplicating" a project. Pick the newest backup and a throwaway name such as
  `destira-drill-2026-12`. Supabase docs: https://supabase.com/docs/guides/platform/clone-project
- **From the off-site dump (any plan).** Create a new free Supabase project
  `destira-drill-<month>`, then load the dump into it:
  ```powershell
  $env:DRILLURL = "<the new project's session pooler connection string>"
  pg_restore --no-owner --no-privileges --dbname $env:DRILLURL "destira-2026-11-27.dump"
  ```
  A few "already exists" messages for Supabase's own objects are normal.

Note how long this step took. That's roughly how long Destira would be down
in a real disaster.

### 2. Check it

From the repository folder, with the restored copy's connection string:

```powershell
$env:RESTORE_DATABASE_URL = "<the restored copy's connection string>"
npx tsx --env-file=.env scripts/restore-drill.ts
```

The script is read-only on both databases. It sets each session read-only
before any query and prints only counts, never member data. It checks:

- every table Destira defines is there;
- the core tables are there and not empty: members, profiles, matches,
  messages, payments, events, rooms and room messages;
- the copy isn't far behind production (a table with under 80% of
  production's rows is flagged);
- how recent the copy is (newest message, payment and member);
- that it hangs together (no profiles without a member, no messages without
  a match).

It ends with **PASS** or **FAIL** and a line for the log below.

### 3. Record it, then clean up

1. Paste the line it printed into the drill log below. Add who ran it, which
   option you used, and how long step 1 took. Commit the change.
2. Delete the throwaway project in Supabase (**Project settings → General →
   Delete project**). Check its name twice: it must be the `destira-drill-…`
   one.

If it says **FAIL**, the backups can't be trusted until it's fixed. Take an
off-site dump straight away and find out why before anything else.

## In a real disaster

1. Stop writes: put the app in maintenance, or stop the server.
2. Decide how far back to go: the newest backup before the problem started.
3. **Paid plan:** restore into a new project as in the drill, check it with the
   drill script, then point `DATABASE_URL` on the server at it. Restoring in
   place (the production project's **Restore** button) also works, but the
   app is down meanwhile and it can't be undone.
   **Free plan:** restore the newest off-site dump the same way.
4. Run every migration in `scripts/migrate-*.ts` against it (they're safe to
   re-run).
5. Start the server, sign in as a test member, and check Discover, a chat and
   the console.

## Drill log

| Date | Result | What came back | How recent | Who, how, how long |
|---|---|---|---|---|
| | | | | |
