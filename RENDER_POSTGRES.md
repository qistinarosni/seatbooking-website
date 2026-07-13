# Render + Postgres Deployment Plan

This is the recommended production setup for Quety Study Lounge.

## Recommended setup

Use:

1. A Render Postgres database
2. A Render web service for the API
3. Your frontend hosted separately, then connected to the API URL

This is the better option for a real business because Render's default filesystem is ephemeral, while managed Postgres is designed for production data.

## Important current note

The current backend in [workhub-api.js](/Users/qistinarosni/Documents/Codex/2026-07-03/i/Seatbooking/workhub-api.js) still uses SQLite directly.

That means:

1. The app is not yet ready to use `DATABASE_URL` in production
2. We need to refactor the backend from SQLite to Postgres before the final Render deploy
3. The Postgres target schema is now prepared in [workhub-schema.postgres.sql](/Users/qistinarosni/Documents/Codex/2026-07-03/i/Seatbooking/workhub-schema.postgres.sql)

## Step 1: Put the project on GitHub

Push the latest working project to a GitHub repository.

Render will deploy from GitHub, so this is the cleanest setup for updates later.

## Step 2: Create a Render Postgres database

In Render:

1. Click `New`
2. Choose `PostgreSQL`
3. Name it something like `quety-study-lounge-db`
4. Choose the same region you plan to use for the API
5. Create the database

After it is created, copy or save:

1. `Internal Database URL`
2. `External Database URL` if you need outside access

For the app itself, use the internal one when the API is also on Render.

## Step 3: Create the backend web service

In Render:

1. Click `New`
2. Choose `Web Service`
3. Connect your GitHub repo
4. Set the root directory to the project folder if needed
5. Use a Node runtime

Recommended settings:

1. Build command: `npm install`
2. Start command: `npm run api`

## Step 4: Add environment variables

Set these in the Render web service:

1. `HOST=0.0.0.0`
2. `TOKEN_SECRET=` a long random secret
3. `CORS_ORIGIN=` your frontend URL
4. `BUSINESS_TIMEZONE=Asia/Kuala_Lumpur`
5. `RESEND_API_KEY=` if you want real email sending
6. `EMAIL_FROM=` your sender address
7. `EMAIL_REPLY_TO=` your reply-to address
8. `DATABASE_URL=` the Render Postgres internal URL

Do not use `DB_PATH` for the production Postgres version.

## Step 5: Apply the Postgres schema

Before the production launch, the database needs the schema from:

[workhub-schema.postgres.sql](/Users/qistinarosni/Documents/Codex/2026-07-03/i/Seatbooking/workhub-schema.postgres.sql)

This schema matches the current product structure:

1. seats
2. bookings
3. admin accounts
4. vendor accounts
5. menu items
6. food orders
7. payment verification tables
8. activity logs

## Step 6: Refactor the API to Postgres

This is the code step still remaining.

The current backend needs to be changed from:

1. SQLite startup logic
2. SQLite migrations
3. SQLite `?` placeholders
4. synchronous `db.prepare(...).get()/all()/run()`

to:

1. a Postgres connection pool
2. Postgres-compatible SQL
3. transaction handling with Postgres
4. `DATABASE_URL`-based production config

## Step 7: Point the frontend to the backend

Once the backend is live on Render, update the frontend environment value:

```text
VITE_API_BASE_URL=https://your-render-api.onrender.com
```

Then rebuild and redeploy the frontend.

## Step 8: Final production checks

Before opening to customers, test:

1. seat booking creation
2. payment verification
3. admin check-in
4. expired booking handling
5. vendor logins
6. menu edits
7. food payment verification
8. booking confirmation email

## Recommended launch order

The safest order is:

1. finish Postgres backend refactor
2. create Render Postgres
3. deploy backend to Render
4. test with the live backend URL
5. update frontend API URL
6. redeploy frontend
7. run one full end-to-end booking test
