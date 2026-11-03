# VANTAGE

Storefront + admin panel for VANTAGE, a t-shirt brand. Orders are confirmed manually over WhatsApp — there's no online checkout.

## Running it

```bash
npm start
```

- `http://localhost:3000` — storefront
- `http://localhost:3000/admin` — admin panel

On Windows, `start-store.bat` does the same thing.

## Admin login

Username is `admin`. Password comes from `ADMIN_PASSWORD` in your env; without it, the local default is `2026`. In production with no password set, a random one gets printed to the server logs on first boot. Change it from the admin panel once you're in.

## What's here

- Storefront with a product catalog and a custom design studio (upload a logo, pick a shirt color, preview it)
- Admin panel — login, product CRUD, order list with filters/status updates, setup readiness check
- Manual WhatsApp payment flow (the old online checkout endpoints return `410`)
- Optional email notifications (EmailJS) on new orders
- Legal pages: privacy, shipping, returns, terms
- Dynamic `robots.txt` / `sitemap.xml`, basic security headers

## Data

Products, orders, customers, and the admin account are stored in Supabase (Postgres). Run `supabase-schema.sql` once in the Supabase SQL Editor before first boot. Design upload images still live on local disk under `data/design-uploads/`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need.

```
PORT=3000
ADMIN_PASSWORD=
ADMIN_PASSWORD_MIN_LENGTH=6

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional, for order notifications (EmailJS):

```
ADMIN_NOTIFY_EMAIL=
ADMIN_NOTIFY_EMAILS=
SUPPORT_REPLY_TO_EMAIL=

EMAILJS_SERVICE_ID=
EMAILJS_TEMPLATE_CUSTOMER_ID=
EMAILJS_TEMPLATE_ADMIN_ID=
EMAILJS_PUBLIC_KEY=
EMAILJS_PRIVATE_KEY=
```

## Deploying (Render)

`render.yaml` is already set up. Push to GitHub, spin up a new Web Service from the repo, and Render picks up the config automatically. Add `ADMIN_PASSWORD` (and anything else you're using) as a secret env var, then check `/api/health` and `/robots.txt` once it's live.

## Notes

Opening `index.html` directly through something like Live Server falls back to frontend-only mode — fine for quick UI checks, but you need `npm start` for anything that touches the backend (admin, saved orders, setup status).
