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
    const { mint, name, symbol, imageUrl, website, twitter, telegram } = body;

    if (!mint || typeof mint !== "string") {
      return NextResponse.json({ error: "Missing mint address" }, { status: 400 });
    }
    // Name and symbol are optional - may be null if metadata not found
    const tokenName = (name && typeof name === "string") ? name.trim() : null;
    const tokenSymbol = (symbol && typeof symbol === "string") ? symbol.trim() : null;

    // Check if commitment already exists for this mint
    const { data: existing } = await supabaseService
      .from("commitments")
      .select("mint")
      .eq("mint", mint)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Commitment already exists for this token" }, { status: 409 });
    }

    // Create commitment record
    const { error: commitErr } = await supabaseService
      .from("commitments")
      .insert({
        mint,
        name: tokenName,
        symbol: tokenSymbol,
        creator_wallet: user.wallet_address,
        image_url: imageUrl || null,
        website: website || null,
        twitter: twitter || null,
        telegram: telegram || null,
        escrow_address: mint, // Use mint as escrow for manual mode
        custody_wallet: user.wallet_address,
        payout_wallet: user.wallet_address,
      });

    if (commitErr) {
      console.error("Commitment insert error:", commitErr);
      return NextResponse.json({
        error: `Failed to create commitment: ${commitErr.message}`,
        code: commitErr.code,
      }, { status: 500 });
    }

    // Create/update coins record for activity
    try {
      const { data: existingCoin } = await supabaseService
        .from("coins")
        .select("id")
        .eq("mint_address", mint)
        .single();

      if (!existingCoin) {
        await supabaseService.from("coins").insert({
          name: tokenName || "Unknown Token",
          symbol: tokenSymbol || "",
          mint_address: mint,
        });
      }
    } catch {
      // Ignore coin creation errors
    }

    // Log activity
    try {
      const { data: coin } = await supabaseService
        .from("coins")
        .select("id")
        .eq("mint_address", mint)
        .single();

      if (coin) {
        await supabaseService.from("activity").insert({
          user_id: user.id,
          coin_id: coin.id,
          type: "commitment_created",
        });
      }
    } catch {
      // Ignore activity logging errors
    }

    return NextResponse.json({
      success: true,
      commitment: {
        mint,
      },
    });
  } catch (e: unknown) {
    console.error("/api/commitment/create: exception", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
