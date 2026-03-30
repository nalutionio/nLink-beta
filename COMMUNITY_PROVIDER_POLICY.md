# PlugFeed Provider Community Guardrails (Beta)

This document defines provider-side Community guardrails for PlugFeed.

Core product rules:

1. Community creates trust and demand. Discovery converts demand into matches and hires.
2. Neighbors control contact. Plugs earn visibility, not access.

## Visibility and Privacy

What a Plug can see in Community:

- Neighbor display name
- Neighbor profile photo
- City/State only

What is hidden before consent / accepted flow:

- Full address
- Phone
- Email
- Exact property location/details

## Policy Matrix

| Rule | Scope | Enforcement | Action |
|---|---|---|---|
| Transparent identity | Provider posts/comments | `author_role='provider'` requires valid `author_provider_id` owned by user | Reject write |
| Allowed provider post types | Provider posts | Provider can post only: `showcase`, `tip`, `advice`, `completed_update` | Reject write |
| No self-plugging | Community plugs | Recommender cannot plug own provider business | Reject write |
| No contact info or external links | Public posts/comments | Regex content guardrail for phone/email/URL | Reject write |
| Anti-spam rate limits | Provider posts/comments | Burst + duplicate window checks | Reject write + log violation |
| No cold DM from community | Direct/Job messages | Provider can message only after neighbor initiated (or accepted+neighbor first for job thread) | Reject write |
| Role isolation (dual-role) | Posts/comments/plugs | Role-specific checks; provider mode cannot perform neighbor-only intent actions | Reject write |
| Escalation | Repeat violations | Violation table + rolling count | Warn -> mute -> review |

## Escalation Ladder (Recommended)

- 1-2 violations (7 days): warning
- 3-4 violations (7 days): 24h posting mute
- 5+ violations (30 days): suspend + manual review

## Data Contracts (Public Feed)

Provider public fields:

- business name
- category / service label
- provider avatar
- verified plug badge

Neighbor public fields:

- display name
- avatar
- city/state (derived)

No private fields should be included in feed responses.

## Operational Notes

- Maintain an immutable moderation event trail.
- Keep automated actions reversible by admin review.
- Keep all write-path guardrails at DB layer (RLS, trigger, function), not only UI.
