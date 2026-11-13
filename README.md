# AIKIVO — AI Voice Customer Care

This repository has been repurposed from ReelForge AI to AIKIVO.

## Current release: browser prototype
- Responsive self-service business dashboard
- Create and delete AI executive profiles
- Business profile and knowledge-base editor
- Browser voice test using Web Speech API where supported
- Speech synthesis replies where supported
- Local conversation history

## Important limitations
This is a **local browser prototype**, not a production multi-tenant SaaS. Data stays in the current browser and is not shared across devices or businesses. Browser speech recognition and language support vary. No real telephone calls, telephony routing, shared authentication, cloud persistence, live human handover or production AI orchestration are connected. Do not enter real customer or sensitive business information.

## Production work still required
1. Supabase Auth and trusted business onboarding.
2. PostgreSQL multi-tenant data access with tested Row Level Security.
3. Secure server-side AI orchestration and secrets management.
4. Telephony provider, inbound number and real-time audio streaming.
5. Consent, privacy, retention, monitoring, abuse prevention and billing.
6. End-to-end security and call quality testing.

A starter schema is in `supabase/schema.sql`. It is not automatically applied and does not connect this static website to Supabase.

## Deploy
Enable GitHub Pages in repository Settings → Pages and verify the repository's Pages workflow publishes the root folder.
