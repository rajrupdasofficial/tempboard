# tempboard

Temporary clipboard + file sharing with one-time OTPs.
Next.js 16 (App Router, plain JavaScript) · Server Actions · Vercel Blob (direct browser uploads) · Upstash Redis.

## Run
```bash
nvm use                      # Node 22
npm install                  # creates package-lock.json -> commit it
cp .env.example .env.local   # fill every value
npm run dev
```
Deploy: connect the repo to Vercel, add the five variables from `.env.example`, deploy. `vercel.json` registers the cleanup cron.

## validated as untrusted input.
- OTP keys are stored as HMAC(APP_SECRET, otp). Stored text and file metadata are AES-256-GCM encrypted with a key derived from APP_SECRET + OTP.
- OTPs are single use (atomic `GETDEL`). File downloads are counted atomically (`INCR`).
- Rate limits per client on every action, plus an hourly lockout after 20 wrong OTP guesses, plus an hourly upload byte quota.
- Upload tokens are minted server-side per file (server-chosen path, size cap, 2 h expiry). Only files the server authorised can be attached to an OTP; sizes are re-read from Vercel Blob.
- Clickjacking: CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
