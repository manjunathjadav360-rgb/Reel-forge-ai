# AIKIVO AI Edge Function

Function: `aikivo-ai`

- Requires a valid Supabase user JWT (`verify_jwt = true`).
- Uses the caller's Authorization header on a Supabase client so database RLS applies.
- Reads the requested executive, its business and only that business's approved knowledge.
- Never accepts a client-supplied business ID.
- Uses a server-side OpenAI-compatible chat-completions provider when configured.
- Without a provider key, returns a conservative FAQ match or asks for human follow-up.

## Supabase Edge Function secrets

Set in the Supabase Dashboard under Edge Function secrets:

- `AIKIVO_LLM_API_KEY` (required for generative AI; keep private)
- `AIKIVO_LLM_BASE_URL` (optional; defaults to OpenAI chat completions)
- `AIKIVO_LLM_MODEL` (optional; defaults to `gpt-4o-mini`)

Do not put provider keys in GitHub Pages or browser JavaScript. Configure billing and provider limits before enabling for customers.
