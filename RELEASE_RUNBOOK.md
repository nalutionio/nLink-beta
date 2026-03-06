# NLink Beta Release Runbook

## Pre-Release Freeze

1. Freeze feature work.
2. Only allow blocker fixes.
3. Confirm current branch is clean enough to tag.

## Validation Commands

Run locally:

```bash
./serve.sh
```

In a separate terminal:

```bash
for f in public/js/*.js; do node --check "$f" || exit 1; done
```

Run Supabase verification SQL:
- Open Supabase SQL Editor
- Run: `supabase/beta_verification.sql`
- Save screenshot/export of results for signoff

## Manual QA Sweep

Use `BETA_READINESS.md` and mark PASS/FAIL.
Required:
- Auth + role switching
- Client and provider core journeys
- Messaging and proposal guards
- Profile persistence (including client property profile)
- Mobile viewport checks (no horizontal overflow)

## Release Tagging

When all required items are PASS:

```bash
git add .
git commit -m "chore: beta stabilization and readiness"
git tag beta-stable-YYYYMMDD
```

Push:

```bash
git push origin main --tags
```

## Rollback Plan

1. Identify last known good tag/commit.
2. Re-deploy that commit on hosting.
3. If rollback needs schema revert, apply reverse migration SQL only after DB backup.

Record:
- Last good commit:
- Last good tag:
- Rollback owner:

## Post-Release Smoke (15 min)

1. Client signup/login.
2. Provider signup/login.
3. Post one job as client.
4. Send one proposal as provider.
5. Accept proposal as client.
6. Exchange one message each direction.
7. Verify badge counts update/clear.

If any fail: stop rollout and revert.
