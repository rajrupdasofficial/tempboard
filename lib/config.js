export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;  // 1 GB per OTP
export const MAX_LINES = 20000;                       // clipboard lines
export const MAX_TEXT_BYTES = 700_000;                // sealed + base64 must stay under Upstash's ~1 MB request cap
export const CLIP_TTL = 60 * 30;                      // clipboard OTP lives 30 min
export const FILE_TTL = 60 * 60 * 24 * 15;            // file OTP lives 15 days (cron wipes anyway)
export const MAX_DOWNLOADS = 5;
export const UPLOAD_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // per client, per hour (protects your Blob bill)
export const FAIL_LOCK_THRESHOLD = 20;                // wrong OTP guesses per hour before a client is locked out
