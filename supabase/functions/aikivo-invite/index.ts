import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://manjunathjadav360-rgb.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== "https://manjunathjadav360-rgb.github.io") {
      return reply({ error: "This website is not allowed to invite team members." }, 403);
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Sign in is required." }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !publishableKey || !serviceRoleKey) {
      return reply({ error: "Server invitation configuration is incomplete." }, 500);
    }

    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authHeader.slice(7);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Your session is invalid. Sign in again." }, 401);

    const payload = await req.json();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const role = String(payload.role ?? "agent");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return reply({ error: "Enter a valid email address." }, 400);
    }
    if (!["admin", "agent", "viewer"].includes(role)) return reply({ error: "Choose a valid team role." }, 400);

    const { data: membership, error: memberError } = await userClient
      .from("business_members")
      .select("business_id,member_role")
      .eq("user_id", authData.user.id)
      .limit(1)
      .maybeSingle();
    if (memberError || !membership || !["owner", "admin"].includes(membership.member_role)) {
      return reply({ error: "Only workspace owners and admins can invite teammates." }, 403);
    }
    if (membership.member_role === "admin" && role === "admin") {
      return reply({ error: "Only the workspace owner can invite another admin." }, 403);
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: alreadyMember, error: lookupError } = await admin
      .from("business_members")
      .select("user_id")
      .eq("business_id", membership.business_id)
      .ilike("email", email)
      .maybeSingle();
    if (lookupError) return reply({ error: "Could not check current team membership." }, 500);
    if (alreadyMember) return reply({ error: "This person is already a member of your workspace." }, 409);

    const { data: inviteRow, error: inviteRowError } = await admin
      .from("business_invitations")
      .insert({
        business_id: membership.business_id,
        email,
        member_role: role,
        invited_by: authData.user.id,
      })
      .select("id")
      .single();
    if (inviteRowError) {
      if (inviteRowError.code === "23505") return reply({ error: "An invitation for this email is already pending." }, 409);
      return reply({ error: "Could not prepare the invitation." }, 500);
    }

    const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://manjunathjadav360-rgb.github.io/Reel-forge-ai/",
      data: { aikivo_invitation: true },
    });
    if (sendError) {
      await admin.from("business_invitations").delete().eq("id", inviteRow.id);
      return reply({ error: sendError.message || "Supabase could not send the invitation email." }, 400);
    }

    return reply({ ok: true, message: "Invitation email sent.", email, role });
  } catch (error) {
    console.error("aikivo-invite error", error);
    return reply({ error: "Could not send the invitation. Please try again." }, 500);
  }
});
