import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    let anon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!anon) {
      try {
        const named = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
        if (named.default) anon = Deno.env.get(named.default) || "";
      } catch { /* handled below */ }
    }
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !anon || !service) return json({ error: "Server configuration is incomplete." }, 500);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const token = auth.slice(7);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Your session is invalid." }, 401);
    const payload = await req.json();
    const businessId = String(payload.businessId || "");
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) return json({ error: "A valid workspace is required." }, 400);
    const { data: membership } = await userClient.from("business_members").select("member_role").eq("business_id", businessId).eq("user_id", userData.user.id).maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.member_role)) return json({ error: "Only workspace owners and admins can build the semantic index." }, 403);
    const key = Deno.env.get("AIKIVO_EMBEDDING_API_KEY") || Deno.env.get("AIKIVO_LLM_API_KEY");
    if (!key) return json({ error: "Semantic indexing needs an embedding provider key. Configure AIKIVO_EMBEDDING_API_KEY (or an OpenAI-compatible AIKIVO_LLM_API_KEY) in Supabase Edge Function secrets." }, 424);
    const endpoint = Deno.env.get("AIKIVO_EMBEDDING_URL") || "https://api.openai.com/v1/embeddings";
    const model = Deno.env.get("AIKIVO_EMBEDDING_MODEL") || "text-embedding-3-small";
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: rows, error: rowsError } = await admin.from("knowledge_items").select("id,question,answer")
      .eq("business_id", businessId).is("embedding", null).order("created_at", { ascending: true }).limit(1000);
    if (rowsError) return json({ error: "Could not load knowledge for indexing." }, 500);
    if (!rows?.length) return json({ indexed: 0, remaining: 0, message: "All current knowledge entries are already indexed." });
    let indexed = 0;
    for (let i = 0; i < rows.length; i += 32) {
      const batch = rows.slice(i, i + 32);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: batch.map((row) => (row.question + "\n" + row.answer).slice(0, 6000)) }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return json({ error: "Embedding provider failed (HTTP " + response.status + "). Indexed " + indexed + " entries before the error." }, 502);
      const result = await response.json();
      const vectors = result.data;
      if (!Array.isArray(vectors) || vectors.length !== batch.length) return json({ error: "Embedding provider returned an unexpected batch." }, 502);
      for (let j = 0; j < batch.length; j++) {
        const vector = vectors[j]?.embedding;
        if (!Array.isArray(vector) || vector.length !== 1536 || vector.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n))) {
          return json({ error: "Embedding model must return 1536 dimensions. Choose text-embedding-3-small or a compatible model." }, 422);
        }
        const { error } = await admin.from("knowledge_items").update({ embedding: `[${vector.join(",")}]` }).eq("id", batch[j].id).eq("business_id", businessId);
        if (error) return json({ error: "Could not save a semantic vector. Indexed " + indexed + " entries." }, 500);
        indexed++;
      }
    }
    const { count } = await admin.from("knowledge_items").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("embedding", null);
    return json({ indexed, remaining: count ?? 0, message: "Semantic index updated." });
  } catch (error) {
    console.error("aikivo-embed error", error);
    return json({ error: "Could not build the semantic index. Check provider settings and retry." }, 500);
  }
});
