# PlugFeed Phase 0 Product Lock

Date: March 18, 2026  
Status: In Progress

This document locks Phase 0 decisions before Community MVP build starts.

## 1) Core Product Rules (Non-Negotiable)

### Rule A: Trust-to-Hire
Community creates trust and demand. Discovery converts demand into matches and hires.

Required user flow:

`Community -> Discovery -> Message/Proposal -> Hire`

Community does not replace hiring mechanics.

### Rule B: User-Controlled Contact
Providers (Plugs) earn visibility, not direct access.

Allowed private contact paths:
- User messages provider first.
- Provider sends proposal and user responds.

No cold provider outreach from Community.

## 2) Terminology Lock (UI Copy)

Product name:
- `PlugFeed`

Role naming:
- Provider is called `Plug` in UI.
- Keep backend schema names (`provider`, `providers`) for now to avoid migration risk.

CTA naming:
- `View Plug`
- `Plug a Pro`
- `Swipe Local Plugs`
- `Request Proposal`

## 3) Community Scope Lock (Phase 2 Lightweight MVP)

In scope:
- Community tab feed
- Post types: `Ask`, `Need Help`, `Showcase`, `Recommendation`
- Comments
- Reactions
- `Plug a Pro` in thread context
- Conversion CTAs back to hiring flows

Out of scope:
- General social timeline features
- Open provider DMs from feed context
- Ads marketplace behavior
- Complex ranking algorithm work

## 4) Provider Guardrails Lock

Providers can:
- Comment publicly
- Share expertise and showcases
- React
- Be recommended by others

Providers cannot:
- DM users without allowed contact path
- Post as fake clients/homeowners
- Recommend themselves
- Drop phone/email/external links in community content
- Spam repetitive promotion

All provider content must show transparent role identity.

## 5) KPI Lock (Phase 0 Baseline)

Primary KPIs:
- Community-to-hiring action rate
  - Percent of community sessions that trigger `Swipe`, `Post Job`, `Request Proposal`, or `View Plug`
- Time to first provider interaction
- Proposal acceptance rate
- 7-day return rate

Secondary KPIs:
- Avg comments per service-intent post
- `Plug a Pro` usage rate
- Reported spam/moderation rate

## 6) Definition of Done for Phase 0

- [x 3/20/26] Core product rules approved
- [x 3/20/26 ] Terminology approved
- [x 3/20/26 ] Community MVP scope frozen
- [x 3/20/26 ] Provider guardrails frozen
- [x 3/20/26] KPI set approved
- [x 3/20/26 ] Product lock signoff recorded

## 7) Signoff

- Product: [ ]
- Technical: [ ]
- Trust/Safety: [ ]

