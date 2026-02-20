# NLink (NalutionLink)

Mobile-first swipe-based business discovery marketplace (beta).

## Quick Start
- Open `index.html` to land on the marketing page.
- Click “Start Swiping” to enter the swipe experience.
- Saved businesses live at `public/saved.html`.

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
