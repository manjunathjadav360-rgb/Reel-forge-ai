import { createClient } from "npm:@supabase/supabase-js@2";

const dashboardOrigin = "https://manjunathjadav360-rgb.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": dashboardOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (req.headers.get("origin") !== dashboardOrigin) return json({ error: "This dashboard origin is not allowed." }, 403);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    let publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!publishable) {
      try {
        const named = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
        if (named.default) publishable = Deno.env.get(named.default) || "";
      } catch { /* handled below */ }
    }
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !publishable || !service) return json({ error: "Server configuration is incomplete." }, 500);
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) return json({ error: "Your session is invalid. Sign in again." }, 401);
    const payload = await req.json();
    const domainId = String(payload.domainId || "");
    const businessId = String(payload.businessId || "");
    if (!validId(domainId) || !validId(businessId)) return json({ error: "A valid website domain and workspace are required." }, 400);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: membership } = await admin.from("business_members").select("member_role")
      .eq("business_id", businessId).eq("user_id", authData.user.id).maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.member_role)) return json({ error: "Only workspace owners and admins can verify website domains." }, 403);
    const { data: domain, error: domainError } = await admin.from("widget_domains")
      .select("id,domain,verification_token,verified_at").eq("id", domainId).eq("business_id", businessId).maybeSingle();
    if (domainError || !domain) return json({ error: "Website domain was not found in this workspace." }, 404);
    if (domain.verified_at) return json({ verified: true, domain: domain.domain, verified_at: domain.verified_at, message: "This hostname is already verified." });
    const recordName = "_aikivo-verification." + domain.domain;
    const recordValue = "aikivo-verification=" + domain.verification_token;
    const dnsUrl = "https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(recordName) + "&type=TXT";
    const dnsResponse = await fetch(dnsUrl, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(10000) });
    if (!dnsResponse.ok) return json({ error: "The DNS provider could not be reached. Please try again." }, 502);
    const dnsResult = await dnsResponse.json();
    const answers = Array.isArray(dnsResult.Answer) ? dnsResult.Answer : [];
    const records = answers.filter((answer: { type?: number }) => answer.type === 16)
      .map((answer: { data?: string }) => String(answer.data || "").replace(/"/g, "").trim());
    if (!records.includes(recordValue)) {
      return json({ verified: false, record_name: recordName, record_value: recordValue, message: "The verification TXT record was not found yet. Add it to your DNS provider, wait for DNS propagation, then verify again." }, 422);
    }
    const { data: updated, error: updateError } = await admin.from("widget_domains")
      .update({ verified_at: new Date().toISOString() }).eq("id", domainId).eq("business_id", businessId)
      .select("id,domain,verified_at").single();
    if (updateError || !updated) return json({ error: "DNS was verified, but the workspace record could not be updated." }, 500);
    return json({ verified: true, domain: updated.domain, verified_at: updated.verified_at, message: "Website domain verified successfully." });
  } catch (error) {
    console.error("aikivo-domain-verify error", error);
    return json({ error: "Could not verify this website domain. Please try again." }, 500);
  }
});
