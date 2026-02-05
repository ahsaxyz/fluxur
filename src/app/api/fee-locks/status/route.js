import { NextResponse } from "next/server";
import { supabaseService } from "@/server/supabase";
import { createHash } from "crypto";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

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
  if (!sess.expires_at || isNaN(new Date(sess.expires_at).getTime()) || new Date(sess.expires_at) <= new Date()) {
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

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mint = searchParams.get("mint");

    if (!mint) {
      return NextResponse.json({ error: "Missing mint" }, { status: 400 });
    }

    const user = await getLoggedInUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseService) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
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

    // Get active lock for this mint
    const { data: lock, error: lockErr } = await supabaseService
      .from("fee_locks")
      .select("id, vault_address, unlock_at, status")
      .eq("mint", mint)
      .eq("creator_wallet", user.wallet_address)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lockErr || !lock) {
      return NextResponse.json({ error: "No active lock found" }, { status: 404 });
    }

    // Get balance from Solana RPC
    let lamports = 0;
    let sol = 0;
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const pubkey = new PublicKey(lock.vault_address);
      lamports = await connection.getBalance(pubkey);
      sol = lamports / LAMPORTS_PER_SOL;
    } catch (rpcErr) {
      console.error("Solana RPC error:", rpcErr);
      // Return 0 balance if RPC fails
    }

    return NextResponse.json({
      vault_address: lock.vault_address,
      unlock_at: lock.unlock_at,
      status: lock.status,
      balance: {
        lamports,
        sol,
      },
    });
  } catch (e: unknown) {
    console.error("/api/fee-locks/status: exception", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
