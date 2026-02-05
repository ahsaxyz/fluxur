import { NextResponse } from "next/server";
import { supabaseService } from "@/server/supabase";
import { createHash } from "crypto";

function readCookie(header: string | null, key: string): string | null {
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === key) return rest.join("=");
  }
  return null;
}

async function getLoggedInUser(request: Request) {
  if (!supabaseService) return null;
  const cookieHeader = request.headers.get("cookie");
  const token = readCookie(cookieHeader, "sb_session");
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: sess, error: sessErr } = await supabaseService
    .from("user_sessions")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (sessErr || !sess) return null;
  if (
    !sess.expires_at ||
    isNaN(new Date(sess.expires_at).getTime()) ||
    new Date(sess.expires_at) <= new Date()
  ) {
    return null;
  }

  const { data: user, error: userErr } = await supabaseService
    .from("users")
    .select("id, wallet_address")
    .eq("id", sess.user_id)
    .single();

  if (userErr || !user) return null;
  return user;
}

/**
 * POST /api/fee-locks/withdraw
 *
 * Marks a fee lock as withdrawn after successful on-chain withdrawal.
 * Verifies that the user is the creator of the commitment.
 */
export async function POST(request: Request) {
  try {
    const user = await getLoggedInUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseService) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const body = await request.json();
    const { mint, tx } = body;

    if (!mint || typeof mint !== "string") {
      return NextResponse.json({ error: "Missing mint" }, { status: 400 });
    }

    if (!tx || typeof tx !== "string") {
      return NextResponse.json({ error: "Missing tx signature" }, { status: 400 });
    }

    // Get commitment to verify creator
    const { data: commitment, error: commitErr } = await supabaseService
      .from("commitments")
      .select("creator_wallet")
      .eq("mint", mint)
      .single();

    if (commitErr || !commitment) {
      return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    }

    // Verify user is the creator
    if (commitment.creator_wallet !== user.wallet_address) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Mark active lock as withdrawn (and ensure we actually updated 1 row)
    const { data: updated, error: updateErr } = await supabaseService
      .from("fee_locks")
      .update({
        status: "withdrawn",
        withdrawn_at: new Date().toISOString(),
        withdraw_tx: tx,
      })
      .eq("mint", mint)
      .eq("creator_wallet", user.wallet_address)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error("[fee-locks/withdraw] Update error:", updateErr);
      return NextResponse.json({ error: "Failed to update lock status" }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: "No active lock found to mark withdrawn" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[fee-locks/withdraw] Exception:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
