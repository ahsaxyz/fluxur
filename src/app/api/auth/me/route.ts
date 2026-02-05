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

export async function GET(request: Request) {
  try {
    if (!supabaseService) return NextResponse.json({ user: null }, { status: 200 });
    const cookieHeader = request.headers.get("cookie");
    const token = readCookie(cookieHeader, "sb_session");
    if (!token) return NextResponse.json({ user: null }, { status: 200 });
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: sess, error: sessErr } = await supabaseService
      .from("user_sessions")
      .select("id, user_id, expires_at")
      .eq("token_hash", tokenHash)
      .order("id", { ascending: false })
      .limit(1)
      .single();
    if (sessErr || !sess) return NextResponse.json({ user: null }, { status: 200 });
    if (!sess.expires_at || isNaN(new Date(sess.expires_at).getTime()) || new Date(sess.expires_at) <= new Date()) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const { data: user, error: userErr } = await supabaseService
      .from("users")
      .select("id, wallet_address")
      .eq("id", sess.user_id)
      .single();
    if (userErr || !user) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user });
  } catch (e: unknown) {
    console.error("/api/auth/me: exception", e);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
