# AIKIVO — AI Voice Customer Care

This repository has been repurposed from ReelForge AI to AIKIVO.

## Current release
- Responsive business dashboard for managing AI executives.
- Supabase email/password account creation and sign-in.
- Signup trigger creates a business workspace and owner membership.
- Multi-tenant PostgreSQL tables with Row Level Security.
- Cloud-saved business profile, AI executives, knowledge items and test conversations.
- Browser voice playground using Web Speech API where supported.

## Important current limitations
- The browser voice playground is not a production AI agent and does not place or receive phone calls.
- Real phone calls require a telephony provider, secure server-side endpoint and real-time audio streaming.
- AI replies currently use the business FAQ keyword matcher, not a hosted generative AI model.
- Do not enter real customer or sensitive business information in this prototype.

## Supabase
The browser uses only the project's publishable key in `supabase/config.js`. Never put a service-role or secret key in browser code.
The AIKIVO tables and RLS policies are in `supabase/schema.sql`; the signup workspace trigger is in `supabase/onboarding.sql`.
The app stores workspace records in Supabase and scopes requests by the signed-in user's workspace membership. Database RLS remains the authorization boundary.

## Next production steps
1. Add team invitations and role-aware access controls.
2. Add secure server-side AI orchestration and secrets management.
3. Integrate telephony, consent, human handover and call monitoring.
4. Add billing, privacy/retention controls and end-to-end tests.

## Deploy
Enable GitHub Pages in repository Settings → Pages and verify the Pages workflow publishes the root folder.
