# Try Jobs — MVP

"Lightweight screen → paid try-day → informed decision." Employers post a
try-day opening; seekers express interest from the public board; an AI voice
agent phones them for a 5-minute structured screening; the employer reviews
the scored summary, books the candidate, and pays through Stripe; both sides
leave feedback afterwards.

Built per `PRD v1.0` — only **[MVP]** scope is implemented.

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js (App Router) — public board + employer dashboard + API routes, deployable to Railway as a single Node service |
| DB / auth / RLS | Supabase (Postgres, magic-link auth for employers) |
| Voice screening | VAPI outbound call (transient assistant per call) + end-of-call webhook |
| SMS + fallback screening | Twilio (notifications, and the same questions over SMS when a call fails) |
| SMS screening scoring | Anthropic API (`claude-opus-4-8`, same rubric as the voice channel) |
| Payments | Stripe Checkout (charge to platform; manual payout for MVP) |
| Email | Resend |

## Local setup

```sh
cd try-jobs
npm install
cp .env.example .env.local   # fill in every key
npm run dev
```

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`
   (SQL editor or `supabase db push`). Enable email (magic link) auth.
2. Create a VAPI account, buy/import a Twilio number into VAPI for outbound
   calls, and set `VAPI_PHONE_NUMBER_ID`. Set any string as
   `VAPI_WEBHOOK_SECRET` — it's echoed back on webhooks.
3. Point your Twilio number's **inbound SMS webhook** at
   `POST {APP_URL}/api/webhooks/twilio/sms`.
4. Create a Stripe webhook endpoint for `checkout.session.completed` at
   `POST {APP_URL}/api/webhooks/stripe`.
5. `npm run test` / `npm run typecheck` / `npm run build`.

For webhook development use a tunnel (e.g. `railway up` on a dev environment,
or ngrok) and set `NEXT_PUBLIC_APP_URL` to the tunnel URL.

## End-to-end flow

1. **Employer** signs in with a magic link, completes a profile, posts an
   opening (`/employer/openings/new`) — title, location, try-day slot, rate,
   3–5 must-have attributes.
2. **Seeker** finds it on `/`, submits name + phone (`POST /api/interest`).
   The server applies rate limits, upserts the seeker, creates the
   application, and triggers an outbound VAPI call.
3. **Screening**: the voice agent asks 3 fixed + up to 4 attribute-derived
   questions (hard cap ~5 min, consent up front). VAPI posts the
   end-of-call report to `/api/webhooks/vapi`, which stores the transcript,
   recording URL, 3-line summary, per-attribute notes, and 1–5 fit score.
   If the call fails, the same questions go out one-by-one over SMS
   (`/api/webhooks/twilio/sms`) and are scored by Claude with the same rubric.
4. **Review & book**: the employer sees candidates ranked by score with the
   fairness note, plays the recording, and books (`POST /api/bookings`) —
   which redirects to Stripe Checkout. `checkout.session.completed` confirms
   the booking and sends SMS + email confirmations to both sides.
5. **Post try-day**: the employer clicks "Mark try-day complete", both
   parties get signed feedback links (`/feedback/<token>`), and the
   employer's outcome submission marks the payment **released**.

## Fairness guardrail (PRD §6 / §11.4)

The exact scoring guardrail lives in `src/lib/screening.ts`
(`FAIRNESS_GUARDRAIL`) and is injected into *both* the voice agent's analysis
prompts and the SMS-fallback scoring prompt: score job-relevant signal only;
never weight accent, fluency, grammar, or speech disfluency. The employer UI
surfaces this note next to every candidate list so scores are interpreted
correctly.

## Rate limiting / call-cost guardrails (PRD §11.5)

- Per-opening screening cap (`openings.screening_cap`, default 25).
- Per-phone limit: max 3 applications per hour, one application per opening
  (unique constraint).

## Assumptions made (surfaced per PRD instructions)

These follow the PRD's flagged assumptions; each is a decision the founder
should confirm:

1. **§11.1 Payment splitting** — implemented the simplest flow: Stripe
   Checkout charges the employer the full try-day amount into the platform
   account; the payout (minus `PLATFORM_FEE_PERCENT`, default 10%) is made
   **manually** after the employer's feedback marks it released.
   `seekerPayoutCents()` computes the amount. Stripe Connect is the proper
   marketplace solution — decision still open.
2. **Single Node service** — the PRD lists "Node service on Railway" +
   Next.js frontend; this MVP ships them as one Next.js app (API routes are
   the Node service). Splitting later is mechanical.
3. **Canada/CAD only** (§2) — phone normalization defaults to +1; Stripe
   charges CAD.
4. **Email provider** — the PRD says "transactional email" without naming
   one; Resend was chosen for setup speed. Swappable in `src/lib/email.ts`.
5. **Feedback trigger** — the PRD says "after the scheduled try-day, both
   parties get a feedback prompt". MVP triggers this from an explicit
   employer action ("Mark try-day complete") instead of a scheduled job.
6. **Voice agent model** — the VAPI assistant uses `claude-haiku-4-5` for
   low-latency conversation; analysis/scoring quality lives in the prompts.
7. **Seeker PII** — employers see a candidate's phone number only after
   payment is made for a booking (enforced in the app layer; row access via
   RLS).

## Out of scope / flagged, not built (PRD §11–12)

- **Employment-law exposure (§11.2):** no legal/contract language is
  generated anywhere; "paid try-day" classification needs human/legal review
  before launch.
- **Cold start (§11.3):** product problem, not addressed in code.
- Native apps, background checks, payroll/tax, seeker dashboards,
  reviews/reputation, multi-slot scheduling, multi-country.

## Deploying to Railway

- Root directory: `try-jobs`. Build: `npm run build`. Start: `npm start`
  (binds `$PORT`).
- Set every variable from `.env.example`.
- Update the Twilio/Stripe/VAPI webhook URLs to the production domain.
