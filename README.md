# NLink (NalutionLink)

Mobile-first swipe-based business discovery marketplace (beta).

## Quick Start
- Run `./serve.sh` from project root.
- Open `http://localhost:5173/shared/auth-choice.html`.
- Use hard refresh (`Cmd+Shift+R`) after frontend changes.

You can also serve the folder with any static server.

## Project Structure
- `public/shared/landing.html` Landing page
- `public/landing.js` Landing page carousel + provider modal
- `public/client/discover.html` Swipe discovery view (client)
- `public/client/saved.html` Saved businesses view (client)
- `public/shared/auth-choice.html` Role selection entry
- `public/shared/login-*.html` Client/provider login
- `public/shared/signup-*.html` Client/provider signup
- `public/client/` Client dashboards + jobs + profile
- `public/provider/` Provider dashboards + jobs + requests + profile
- `public/styles.css` Shared styles (includes gradient background)
- `public/swipe.js` Swipe gesture logic
- `public/reviews.js` Review renderer
- `public/cropper.js` Image cropper (banner + logo)
- `public/js/auth.js` Supabase auth wiring (legacy)
- `public/js/auth-portal.js` Role-based auth flow
- `public/js/auth-required.js` Signed-in guard
- `public/js/guard.js` Redirect signed-in users
- `public/js/signout.js` Sign out handler
- `public/js/supabase-config.js` Shared Supabase config
- `public/app.js` App controller (filters, saved persistence, modal)
- `public/assets/logormbg.png` App logo
- `public/images/` Placeholder imagery for cards/carousels
- `public/favicon.ico` Site icon
- `public/robots.txt` Crawl rules

## Notes
- Provider/client data is Supabase-backed.
- Saved businesses persist via `localStorage`.
- Payments/subscriptions are **not** implemented (structure only).

## Supabase Auth Setup (Optional)
1. Create a Supabase project.
2. Add your credentials in `/Users/aanyahcook/Documents/naluprojects/nLink-beta/public/js/supabase-config.js`.
3. In Supabase Dashboard, open `Authentication -> URL Configuration`:
   - Site URL: `http://localhost:5173`
   - Redirect URLs:
     - `http://localhost:5173/shared/auth-callback.html`
     - `http://127.0.0.1:5173/shared/auth-callback.html`
4. Run `./serve.sh`, then test:
   - Client signup: `/shared/signup-client.html`
   - Provider signup: `/shared/signup-provider.html`

## Supabase Profile Extension (Required For Full Provider Profile)
1. In Supabase Dashboard, open SQL Editor.
2. Run:
   - `/Users/aanyahcook/Documents/naluprojects/nLink-beta/supabase/provider_profile_extension.sql`
   - `/Users/aanyahcook/Documents/naluprojects/nLink-beta/supabase/provider_hardening.sql`
   - `/Users/aanyahcook/Documents/naluprojects/nLink-beta/supabase/provider_growth.sql`
3. Confirm table exists:
   - `public.provider_profiles`
   - `public.provider_events`
   - Unique owner index on `public.providers(owner_id)`
4. Then restart local server and test provider edit/profile flows.

## Stabilization Baseline (Run Next)
1. In Supabase SQL Editor, run:
   - `/Users/aanyahcook/Documents/naluprojects/nLink-beta/supabase/stabilization_baseline.sql`
2. Verify no SQL errors.
3. Confirm key tables/fields exist and are queryable:
   - `public.clients.avatar_url`
   - `public.clients.banner_url`
   - `public.jobs.status`
   - `public.job_requests.status`
   - `public.provider_profiles.listing_status`

### Patch After Baseline (Client Identity On Jobs)
If you already ran the baseline before commit `4159565`, run this too:
- `/Users/aanyahcook/Documents/naluprojects/nLink-beta/supabase/job_client_identity_snapshot.sql`

### Patch For Job Funnel Tracking
Run this to enable job/request analytics events:
- `/Users/aanyahcook/Documents/naluprojects/nLink-beta/supabase/job_funnel_events.sql`

## Smoke Test Checklist (Before Every Push)
1. Auth flow:
   - Client signup/login redirects to `/client/discover.html`.
   - Provider signup/login redirects to `/provider/dashboard.html`.
2. Client media:
   - `/client/client-profile-edit.html` upload avatar + banner + submit.
   - Reload `/client/client-profile.html` and confirm persistence.
3. Provider media/profile:
   - `/provider/profile-edit.html` save category/services, upload logo/banner, save.
   - Reload `/provider/dashboard.html` and confirm business name + listing status.
4. Jobs flow:
   - Client posts a job on `/client/client-jobs.html`.
   - Provider sees job on `/provider/provider-jobs.html` and requests quote.
   - Client accepts/declines in job detail; statuses update correctly.
5. Discovery/saved:
   - `/client/discover.html` filters return results.
   - Save provider, then verify `/client/saved.html`.
6. No console blockers:
   - Open browser devtools and confirm no new fatal errors on touched pages.
