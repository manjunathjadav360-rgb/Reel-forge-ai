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
The authenticated Supabase Edge Function `aikivo-ai` is deployed with JWT verification enabled. It loads the signed-in workspace's AI executive, the latest 12 messages and up to 8 knowledge entries ranked for the customer's current question. The public website widget uses the same ranked search. PostgreSQL full-text search uses a generated `tsvector` column and GIN index; the SQL search function is `SECURITY INVOKER`, and each query is scoped to the business and selected AI executive. When configured, the assistant sends this focused context to a server-side OpenAI-compatible chat-completions endpoint. Without a provider key, it uses a conservative FAQ match and offers human follow-up rather than inventing business facts.

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


### Website chat widget
Each AI executive receives a public widget identifier. Owners/admins can enable or disable website chat and copy a one-line script embed from the AI executives page. Add the snippet to a business website to display a floating chat launcher. The public Edge Function validates the widget identifier and enabled state, rate-limits by hashed client IP, stores website conversations/messages in the same workspace inbox, and creates a support ticket when the AI cannot answer from approved knowledge. The widget identifier is public configuration, not a secret; the service-role key remains exclusively in Edge Function secrets. The AI model provider still requires the server-side `AIKIVO_LLM_API_KEY` secret for generated answers; without it the widget uses the approved-knowledge fallback.


### Self-serve business onboarding
New business owners can complete a guided setup in the dashboard: business profile, first AI executive, first approved knowledge answer, assistant preview, and website-chat publishing. Completion is saved on the business workspace row. The wizard is owner/admin-only; existing workspaces with assistants or knowledge were marked as already onboarded when the column was introduced.


## Expanded AI knowledge imports
- Website training now follows up to 8 same-host HTTPS pages linked from the submitted page.
- Document imports support selectable-text PDF and DOCX, plus TXT and Markdown.
- PDF/DOCX are processed in the authenticated Edge Function; scanned image-only PDFs may not contain extractable text.
- Current import limits: PDF/DOCX up to 5 MB; TXT/Markdown up to 100 KB; website crawl up to 8 pages.


### Ranked AI knowledge retrieval
- Knowledge questions and answers are indexed automatically with PostgreSQL full-text search (English stemming plus a simple tokenizer for other configured languages).
- Customer questions are searched with OR-based web-style query parsing and relevance ranking to avoid requiring every word in a customer sentence to appear in an FAQ.
- Dashboard test conversations and the public website widget retrieve up to 8 matching approved knowledge entries instead of loading up to 80 unrelated entries.
- Search is scoped by business and AI executive; the SQL function runs as invoker and respects authenticated workspace RLS.
- This is keyword-based retrieval, not embeddings or semantic vector search. Test with real FAQs in multiple languages before production.


### Semantic knowledge search
- pgvector stores 1536-dimensional embeddings for approved knowledge.
- Workspace owners/admins can build or refresh the semantic index from the Knowledge Base preview.
- Dashboard assistant and website widget use cosine similarity when query embeddings are available, then fall back to the existing multilingual keyword search.
- Configure `AIKIVO_EMBEDDING_API_KEY` (or a compatible `AIKIVO_LLM_API_KEY`), optionally `AIKIVO_EMBEDDING_URL` and `AIKIVO_EMBEDDING_MODEL`. The default model is `text-embedding-3-small`.
- The selected embedding provider must return 1536 dimensions. Embedding provider charges may apply.

- New and imported FAQ/document knowledge automatically triggers a semantic-index refresh when an embedding provider is configured. Editing an answer invalidates its old vector so it can be regenerated. If indexing is unavailable, keyword retrieval continues to work.


## AI answer quality and human handoff

- AI replies are gated by retrieved approved knowledge: semantic matches must score at least 0.45 cosine similarity; keyword matches must have a positive full-text rank.
- If no evidence passes retrieval, AIKIVO returns a fixed verified-information response and recommends human support instead of asking the language model to guess.
- Knowledge and chat history are explicitly treated as untrusted data in the model prompt, not as instructions.
- Unsupported website-widget conversations are escalated and create at most one active handoff ticket per conversation. Dashboard test conversations use the same handoff recommendation and avoid duplicate active tickets.
- Retrieval scores are evidence filters, not calibrated probabilities or a guarantee that every generated answer is correct. Businesses should review AI replies and maintain accurate approved knowledge.


## AI testing and evaluation center
- Workspace owners and admins can run up to 10 sample customer questions per batch against an AI executive.
- Each test returns the proposed answer, retrieval status, and the strongest approved FAQ evidence with its retrieval score.
- Tests are read-only: they do not create customer conversations, send widget messages, or create support tickets.
- Questions with no qualifying approved knowledge are marked for human review. A positive retrieval match is evidence discovery, not proof that a generated answer is factually correct; review results before enabling a customer-facing assistant.
