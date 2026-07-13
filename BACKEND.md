# Quety Study Lounge Backend

This backend gives the seat-booking frontend real storage and real API routes.

Run it locally:

```bash
npm run api
```

The API starts at:

```text
http://localhost:4000
```

Default demo logins:

```text
Admin:  admin / workhub2024
Desk:   desk1 / desk1234
Vendor superadmin: vendoradmin / vendorhub2024
Cafe vendor:       cafeadmin / cafe2024
Pizza vendor:      sliceadmin / slice2024
```

Migrate local SQLite admin/vendor accounts into Postgres:

```bash
DATABASE_URL="your-render-or-postgres-url" npm run migrate:accounts
```

Optional if your local SQLite file is not `workhub.sqlite`:

```bash
DATABASE_URL="your-render-or-postgres-url" SQLITE_DB_PATH=workhub-updated.sqlite npm run migrate:accounts
```

Important routes:

```text
GET    /api/health
GET    /api/seats?date=2026-07-03&startHour=10&duration=2
POST   /api/bookings
POST   /api/mock-bookings
GET    /api/bookings/:ref
POST   /api/bookings/:ref/email
POST   /api/bookings/:ref/check-in
POST   /api/admin/login
GET    /api/admin/bookings
GET    /api/menu
POST   /api/food-orders
POST   /api/vendors/login
GET    /api/vendors/orders
PATCH  /api/vendors/orders/:id
PATCH  /api/vendors/menu/:id
POST   /api/vendors/menu
```

Production environment variables:

```text
PORT=4000
HOST=0.0.0.0
TOKEN_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://qistinarosni.github.io
DATABASE_URL=postgresql://user:password@host:5432/database
BUSINESS_TIMEZONE=Asia/Kuala_Lumpur
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM=Quety Study Lounge <bookings@your-domain.com>
EMAIL_REPLY_TO=hello@your-domain.com
```

The backend now targets Postgres for production and expects `DATABASE_URL` at runtime.

For the production Postgres route on Render, see:

[RENDER_POSTGRES.md](/Users/qistinarosni/Documents/Codex/2026-07-03/i/Seatbooking/RENDER_POSTGRES.md)

## Current booking rules

```text
Focus Pods: RM 5/hour for 1-2 hours, RM 3/hour for 3+ hours, including Level 2 seats L2A1-L2A2, L2B1-L2B4, L2R1-L2R6, and private room seats PR1-PR5
Discussion Tables: RM 20/hour for 1-2 hours, RM 15/hour for 3+ hours
Whole Discussion Room: RM 60/hour, bookable up to 3 days ahead
```

Focus Pods and individual Discussion Tables are same-day bookings only. Whole-room bookings block all individual discussion tables at the same time, and individual discussion table bookings block whole-room bookings at the same time.

## Admin and email notes

Customer-facing pages do not show an admin button. Staff can open the admin login by adding `?admin=1` or `#admin` to the website URL. On the local Vite server, `/seatbooking-website/admin` is also supported.

Booking confirmation emails are sent automatically after a paid booking is created. Without `RESEND_API_KEY` and `EMAIL_FROM`, the backend uses mock email mode and logs/prepares the email content for development. With those environment variables, the backend sends the confirmation through Resend.
