# AIKIVO — AI Voice Customer Care

This repository has been repurposed from ReelForge AI to AIKIVO.

## Current release
- Responsive business dashboard for managing AI executives.
- Supabase email/password account creation and sign-in.
- Signup trigger creates a business workspace and owner membership.
- Multi-tenant PostgreSQL tables with Row Level Security.
- Cloud-saved business profile, AI executives, knowledge items, multi-turn test conversations and a human handoff inbox.
- Browser voice playground using Web Speech API where supported.

## AI engine
The authenticated Supabase Edge Function `aikivo-ai` is deployed with JWT verification enabled. It loads only the signed-in workspace's AI executive, approved knowledge and the latest 12 messages in the selected conversation. When configured, it sends that context to a server-side OpenAI-compatible chat-completions endpoint. Without a provider key, it uses a conservative FAQ match and offers human follow-up rather than inventing business facts.

To enable generative replies, add these **Edge Function secrets** in the Supabase project:
- `AIKIVO_LLM_API_KEY` — provider API key (keep it server-side; never commit it).
- `AIKIVO_LLM_BASE_URL` — optional chat-completions endpoint; defaults to OpenAI's endpoint.
- `AIKIVO_LLM_MODEL` — optional model name; defaults to `gpt-4o-mini`.

The provider key has not been configured yet, so the current test uses knowledge-base backup mode until the business owner configures a provider. Provider usage may incur separate charges.

## Important current limitations
- The browser voice playground is not a production AI agent and does not place or receive phone calls.
- Real phone calls require a telephony provider, secure server-side endpoint and real-time audio streaming.
- Until a provider key is configured, replies use the business FAQ fallback rather than a hosted generative AI model.
- Do not enter real customer or sensitive business information in this prototype.

## Supabase
The browser uses only the project's publishable key in `supabase/config.js`. Never put a service-role or secret key in browser code.
The AIKIVO tables and RLS policies are in `supabase/schema.sql`; the signup workspace trigger is in `supabase/onboarding.sql`.
The app stores workspace records in Supabase and scopes requests by the signed-in user's workspace membership. Database RLS remains the authorization boundary.

## Next production steps
1. Add team invitations and role-aware access controls.
2. Configure an AI provider secret and test multi-turn answers end to end.
3. Integrate telephony, consent, human handover and call monitoring.
4. Add billing, privacy/retention controls and end-to-end tests.

## Deploy
Enable GitHub Pages in repository Settings → Pages and verify the Pages workflow publishes the root folder.


## Team invitations
- Workspace owners and admins can invite teammates by email from Team & permissions.
- Invitees are attached to the inviter's business by the Auth user-created trigger; role data is stored in `business_members`, not user-editable metadata.
- Owners can invite admins, agents and viewers. Admins can invite agents and viewers.
- Team role changes and removals are protected by RLS. Owner accounts cannot be removed or demoted through the dashboard.
- Invitations use Supabase Auth email delivery. Configure the project's Auth email/SMTP settings and allow the GitHub Pages redirect URL if delivery is not enabled.

- This first version supports inviting new email addresses only; existing AIKIVO accounts need a future workspace-switching flow before joining another business.


### Support ticket assignment

Support tickets include an optional `assigned_to` workspace member. Owners and admins can assign tickets to owners, admins, or agents; agents can claim tickets for themselves. The Support inbox includes All, Assigned to me, and Unassigned filters plus active-ticket workload counts. A composite foreign key prevents cross-workspace assignments and automatically clears the assignee when a team member is removed. A database trigger rejects assignments to viewers or users outside the workspace.


### Shared team conversation inbox

The Conversations page is a shared workspace inbox. Team members can view full message threads, owners/admins can assign conversations to any owner/admin/agent, and agents can claim conversations for themselves. Agents can send team replies that are saved in the same conversation history and become part of the context for subsequent AI responses. Resolved conversations are read-only in the team inbox. The database validates conversation assignees against the same business and restricts message creation to support staff roles.
