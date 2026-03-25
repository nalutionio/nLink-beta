# NLink Beta Readiness Checklist

Use this as the final go/no-go checklist before calling the beta complete.

## 0) Phase 0 Product Lock (Required Before Community Build)

Reference: `PHASE0_PRODUCT_LOCK.md`

- [ ] Core product rules signed off.
- [ ] Terminology (`PlugFeed`, `Plug`) signed off.
- [ ] Community MVP scope signed off.
- [ ] Provider guardrails and KPI set signed off.

## 1) Core Product Flows (Required)

Mark each as `PASS [x]` or `FAIL [/]` with date + tester name.

### Auth + Role
- [ ] Client sign up works end-to-end.
- [ ] Provider sign up works end-to-end.
- [ ] Login works for both roles.
- [ ] Logout works for both roles.
- [ ] Role switch works for dual-role accounts.
- [ ] Email verification links return to app correctly.

### Client Journey
- [ ] Client can discover providers.
- [ ] Client can view provider profile.
- [ ] Client can save provider.
- [ ] Client can post a job.
- [ ] Client can edit a posted job.
- [ ] Client can accept/reject proposals.
- [ ] Client can message provider after acceptance flow.

### Provider Journey
- [ ] Provider can discover jobs.
- [ ] Provider can view job detail.
- [ ] Provider can view full client profile from job detail.
- [ ] Provider can send proposal.
- [ ] Provider can view full client profile from proposals list.
- [ ] Provider can message client only under guard rules.

### Profiles + Persistence
- [ ] Provider profile updates persist (name, logo, banner, media).
- [ ] Provider rating/comments display when data exists.
- [ ] Client profile updates persist.
- [ ] Client property profile persists.
- [ ] Property photos save + hidden/visible + ordering persist.

### Notifications/Badges
- [ ] Client message badge increments.
- [ ] Client jobs/proposal-update badge increments.
- [ ] Provider message badge increments.
- [ ] Provider proposals badge increments.
- [ ] Badges clear when the corresponding page is opened.

## 2) Mobile-First UI Stability (Required)

Check on iPhone-size viewport and Android-size viewport.

- [ ] No horizontal scroll on core pages.
- [ ] Bottom nav always visible and not clipped.
- [ ] Message thread layout remains readable.
- [ ] Proposal cards remain readable.
- [ ] Client/Provider full-profile modals are scrollable and usable.

## 3) Security + Data Rules (Required)

Run `supabase/beta_verification.sql` and store output notes.

- [x] RLS is enabled on all core tables. (Mar 6)
- [x] Provider cannot message client before allowed guard condition. (Mar 6)
- [x] Self-interaction guard blocks own listings/chats. (Mar 6)
- [x] Address privacy is preserved in provider-facing UI. (Mar 6)
- [x] No test/dummy fallback profile data leaking into real user views. (Mar 6)

## 4) Operations + Release Hygiene (Required)

- [x] JS syntax sweep passes (`node --check public/js/*.js`). (Mar 6)
- [x] Internal asset/link check passes. (Mar 6)
- [ ] Working rollback commit hash is recorded.
- [ ] `beta-stable` git tag created.
- [ ] Netlify/Supabase env values match expected project.

## 5) Policy + Trust Surface (Required for public beta)

- [ ] Privacy Policy page exists and is linked.
- [ ] Terms & Conditions page exists and is linked.
- [ ] Cookie Policy page exists and is linked.
- [ ] Support contact path works.

## 6) Go/No-Go Signoff

- Product owner signoff: [ ]
- Technical signoff: [ ]
- Security signoff: [ ]
- Beta launch decision: `GO` / `NO-GO`

---

## Execution Order (Final Stage)

1. Run SQL verification (`supabase/beta_verification.sql`).
2. Run full manual flow QA (Section 1 + 2).
3. Fix blockers only (no new feature scope).
4. Re-run QA on failed sections.
5. Freeze + tag + release.
