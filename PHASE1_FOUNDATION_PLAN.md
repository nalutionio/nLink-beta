# PlugFeed Phase 1 Foundation Plan

Date: March 20, 2026  
Status: Started

Phase 1 goal: lock data model + role/policy enforcement before UI build.

## Step-by-Step Execution

## 1) Apply schema baseline
- Run: `supabase/community_phase1_foundation.sql`
- Confirm tables exist:
  - `community_posts`
  - `community_comments`
  - `community_reactions`
  - `community_plugs`
  - `community_reports`
  - `community_events`

Pass criteria:
- SQL runs without errors.
- RLS enabled on all community tables.

## 2) Validate role transparency rules
- Test `author_role='provider'` with missing `author_provider_id` -> should fail.
- Test `author_role='client'` with non-null `author_provider_id` -> should fail.
- Test provider post with disallowed `post_type` (`ask`, `need_help`) -> should fail.

Pass criteria:
- Invalid role/identity writes blocked at DB layer.

## 3) Validate self-promotion guardrails
- Insert plug row where `recommender_user_id` owns `plugged_provider_id` -> should fail.
- Insert valid recommendation of another provider -> should pass.

Pass criteria:
- Self-plug blocked consistently.

## 4) Validate anti-spam and content restrictions
- Try post/comment with email, URL, or phone number -> should fail.
- Rapid-fire provider comments above threshold -> should fail.
- Duplicate comment body within 24h by same user -> should fail.

Pass criteria:
- Contact/link drops and repetitive spam blocked.

## 5) Validate base read/write access via RLS
- Authenticated users can read non-archived posts/comments.
- Users can create/update/delete only their own posts/comments.
- Reactions and plugs can only be inserted by `auth.uid()`.
- Reports can only be viewed by reporter.

Pass criteria:
- No cross-user write/update/delete permissions.

## 6) Policy matrix signoff
- Confirm this role behavior is accepted:
  - Client: Ask, Need Help, Recommendation, Comment, React, Plug a Pro
  - Plug: Showcase, Tip, Advice, Completed Update, Comment, React
  - Plug cannot DM unless existing contact guard allows it
- Confirm Community stays trust/demand layer, not direct-hire bypass.

Pass criteria:
- Product + Technical signoff captured.

## 7) Phase 1 done checklist
- [x 3/20/26 ] SQL applied in Supabase
- [x 3/20/26] Validation tests run
- [x 3/20/26] Policy matrix signed off
- [x 3/20/26 ] Known limitations captured

## Known limitations for Phase 1
- No moderation dashboard UI yet (reports are stored only).
- No feed ranking model yet (this is data/policy foundation only).
- Contact-block regex is intentionally strict and may need tuning in Phase 2 UX tests.
