# AIKIVO — AI Voice Customer Care

This repository has been repurposed from ReelForge AI to AIKIVO.

## Current release
- Responsive business dashboard for managing AI executives.
- Supabase email/password account creation and sign-in.
- Signup trigger creates a business workspace and owner membership.
- Multi-tenant PostgreSQL starter tables with Row Level Security.
- Business workspace name is read from the signed-in user's membership.
- Browser voice playground using Web Speech API where supported.

## Important current limitations
- AI executive profiles, knowledge items and demo conversations are still stored in the browser. They are **not yet synced to the cloud database**.
- The browser voice playground is not a production AI agent and does not place or receive phone calls.
- Real phone calls require a telephony provider, secure server-side endpoint and real-time audio streaming.
- Do not enter real customer or sensitive business information in this prototype.

## Supabase
The browser uses only the project's publishable key in `supabase/config.js`. Never put a service-role or secret key in browser code.
The AIKIVO tables and RLS policies are in `supabase/schema.sql`; the signup workspace trigger is installed in the VYBE Supabase project and its SQL is documented in `supabase/onboarding.sql`.

## Next production steps
1. Sync executive profiles, knowledge and conversation records with Supabase.
2. Add role-aware team invitations and account recovery.
3. Add secure server-side AI orchestration and secrets management.
4. Integrate telephony, consent, human handover and call monitoring.
5. Add billing, privacy/retention controls and end-to-end tests.

## Deploy
Enable GitHub Pages in repository Settings → Pages and verify the Pages workflow publishes the root folder.
