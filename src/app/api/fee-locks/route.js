import { NextResponse } from "next/server";
import { supabaseService } from "@/server/supabase";
import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";

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

  const expiresAt = new Date(sess.expires_at);
  if (!sess.expires_at || isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
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

function getProgramId(): PublicKey {
  const raw =
    process.env.FLUXUR_TIMELOCK_PROGRAM_ID ||
    process.env.NEXT_PUBLIC_FLUXUR_TIMELOCK_PROGRAM_ID ||
    process.env.PROGRAM_ID ||
    process.env.NEXT_PUBLIC_PROGRAM_ID;

  if (!raw) {
    throw new Error(
      "Missing program id env var. Set FLUXUR_TIMELOCK_PROGRAM_ID (server) or NEXT_PUBLIC_FLUXUR_TIMELOCK_PROGRAM_ID (client)."
    );
  }
  return new PublicKey(raw);
}

function derivePdas(mint: string) {
  const programId = getProgramId();
  const mintPk = new PublicKey(mint);

  const [lockPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lock"), mintPk.toBuffer()],
    programId
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), mintPk.toBuffer()],
    programId
  );

  return { programId, mintPk, lockPda, vaultPda };
}

export async function POST(request: Request) {
  try {
    const user = await getLoggedInUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseService) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const mint = body?.mint;
    const unlock_at = body?.unlock_at;

    if (!mint || typeof mint !== "string") {
      return NextResponse.json({ error: "Missing mint" }, { status: 400 });
    }
    if (!unlock_at || typeof unlock_at !== "string") {
      return NextResponse.json({ error: "Missing unlock_at" }, { status: 400 });
    }

    // Validate unlock_at is a valid future date
    const unlockDate = new Date(unlock_at);
    if (isNaN(unlockDate.getTime()) || unlockDate <= new Date()) {
      return NextResponse.json({ error: "unlock_at must be a future date" }, { status: 400 });
    }

    // Commitment -> verify creator
    const { data: commitment, error: commitErr } = await supabaseService
      .from("commitments")
      .select("creator_wallet")
      .eq("mint", mint)
      .single();

    if (commitErr || !commitment) {
      return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    }

    if (commitment.creator_wallet !== user.wallet_address) {
      return NextResponse.json({ error: "Not authorized - not the creator" }, { status: 403 });
    }

    // Only 1 active lock per mint
    const { data: existingLock, error: existingErr } = await supabaseService
      .from("fee_locks")
      .select("id")
      .eq("mint", mint)
      .eq("status", "active")
      .maybeSingle();

    if (existingErr) {
      console.error("[fee-locks] existing lock check error:", existingErr);
      return NextResponse.json({ error: "Failed to check existing lock" }, { status: 500 });
    }

    if (existingLock) {
      return NextResponse.json({ error: "A lock already exists for this mint" }, { status: 409 });
    }

    // IMPORTANT: Store the PDA vault address (program-owned), not a random keypair.
    const { vaultPda } = derivePdas(mint);

    const { data: lock, error: insertErr } = await supabaseService
      .from("fee_locks")
      .insert({
        mint,
        creator_wallet: user.wallet_address,
        vault_address: vaultPda.toBase58(),
        unlock_at: unlockDate.toISOString(),
        status: "active",
      })
      .select("id, vault_address, unlock_at, status, created_at")
      .single();

    if (insertErr || !lock) {
      console.error("[fee-locks] insert error:", insertErr);
      return NextResponse.json(
        {
          error: insertErr?.message ? `fee_locks insert failed: ${insertErr.message}` : "fee_locks insert failed",
          code: insertErr?.code,
          hint: insertErr?.hint,
          details: insertErr?.details,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: lock.id,
      vault_address: lock.vault_address,
      unlock_at: lock.unlock_at,
      status: lock.status,
      created_at: lock.created_at,
    });
  } catch (e: unknown) {
    console.error("/api/fee-locks POST: exception", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal server error" }, { status: 500 });
  }
}

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

    const { data: commitment, error: commitErr } = await supabaseService
      .from("commitments")
      .select("creator_wallet")
      .eq("mint", mint)
      .single();

    if (commitErr || !commitment) {
      return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    }

    if (commitment.creator_wallet !== user.wallet_address) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: lock, error: lockErr } = await supabaseService
      .from("fee_locks")
      .select("id, vault_address, unlock_at, status, created_at, withdrawn_at, withdraw_tx")
      .eq("mint", mint)
      .eq("creator_wallet", user.wallet_address)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lockErr) {
      console.error("[fee-locks] fetch lock error:", lockErr);
      return NextResponse.json({ error: "Failed to fetch lock" }, { status: 500 });
    }

    return NextResponse.json({ lock: lock || null });
  } catch (e: unknown) {
    console.error("/api/fee-locks GET: exception", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
