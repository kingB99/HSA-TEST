// Supabase Edge Function: manage-user
// Creates and removes login accounts on behalf of an authenticated admin.
// The app calls it with the caller's own Supabase session, so the caller
// is verified by Supabase Auth before anything happens.
//
// Deploy once from the Supabase dashboard:
//   Edge Functions, New Function, name "manage-user", paste this file, Deploy.
// No environment variables needed: SUPABASE_URL and the service role key
// are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  let body: any = {};
  try { body = await req.json(); } catch {}

  const action = String(body.action || "");
  const authHeader = req.headers.get("Authorization") || "";

  // Caller identity: Supabase verifies the caller's JWT on this request.
  const caller = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  let callerProfile: any = null;
  const { data: { user: callerUser } } = await caller.auth.getUser();
  if (callerUser) {
    const { data } = await admin.from("users").select().eq("id", callerUser.id).maybeSingle();
    callerProfile = data;
  }

  // Bootstrap: allowed only while NO account exists at all.
  const { count } = await admin.from("users").select("id", { count: "exact", head: true });
  if (action === "bootstrap") {
    if ((count ?? 0) > 0)
      return json({ ok: false, error: "This system is already set up. Sign in instead." }, 403);
    const { email, fullName, password } = body;
    if (!email || !email.includes("@") || !password || password.length < 6 || !fullName)
      return json({ ok: false, error: "A full name, valid email and a 6+ character password are required." }, 400);
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { fullName } });
    if (error) return json({ ok: false, error: error.message }, 400);
    await admin.from("users").insert({
      id: data.user!.id, agency_id: null,
      data: { fullName, email, role: "SUPER_ADMIN" } });
    return json({ ok: true });
  }

  // Everything below needs a signed-in admin.
  const role = callerProfile?.data?.role;
  if (!callerUser || (role !== "AGENCY_ADMIN" && role !== "SUPER_ADMIN"))
    return json({ ok: false, error: "Only administrators can manage accounts." }, 403);

  if (action === "create") {
    const { email, fullName, role: newRole, agencyId } = body;
    if (!email || !email.includes("@") || !fullName)
      return json({ ok: false, error: "A full name and valid email are required." }, 400);
    if (role === "AGENCY_ADMIN" && newRole === "SUPER_ADMIN")
      return json({ ok: false, error: "Only the platform owner can create super admins." }, 403);
    if (role === "AGENCY_ADMIN" && agencyId !== callerProfile.agency_id)
      return json({ ok: false, error: "You can only add accounts to your own company." }, 403);
    // no password set: Supabase emails the person an invitation to set one
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { fullName } });
    if (error) return json({ ok: false, error: error.message }, 400);
    await admin.from("users").insert({
      id: data.user!.id, agency_id: agencyId || null,
      data: { fullName, email, role: newRole || "EMPLOYEE" } });
    return json({ ok: true });
  }

  if (action === "remove") {
    const { userId } = body;
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    if (userId === callerUser.id)
      return json({ ok: false, error: "You cannot remove your own account." }, 400);
    const { data: target } = await admin.from("users").select().eq("id", userId).maybeSingle();
    if (!target) return json({ ok: false, error: "Account not found." }, 404);
    if (role === "AGENCY_ADMIN" && target.agency_id !== callerProfile.agency_id)
      return json({ ok: false, error: "You can only remove accounts from your own company." }, 403);
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown action." }, 400);
});
