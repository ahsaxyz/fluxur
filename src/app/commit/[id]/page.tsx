"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Home, Search, Plus, User, FileText, Map, Clock, Globe, Send, Lock } from "lucide-react";
import BinaryRain from "@/components/BinaryRain";

type CommitmentResponse = {
  mint: string;
  name: string;
  symbol: string;
  metadataUri: string;
  createdAt: string;
  devBuyAmount: number;
  escrowAddress: string;
  custodyWallet: string;
  creatorPayoutWallet: string;
  creatorWallet?: string;
  imageUrl?: string | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
};

function normalizeUrl(kind: "website" | "twitter" | "telegram", value: string) {
  const v = value.trim();
  if (!v) return "";
  if (kind === "website") {
    if (/^https?:\/\//i.test(v)) return v;
    return `https://${v}`;
  }
  if (kind === "twitter") {
    const handle = v.replace(/^https?:\/\/x\.com\//i, "").replace(/^@/, "");
    return `https://x.com/${handle}`;
  }
  if (kind === "telegram") {
    const handle = v.replace(/^https?:\/\/t\.me\//i, "");
    return `https://t.me/${handle}`;
  }
  return v;
}

type FeeLock = {
  id: number;
  vault_address: string;
  unlock_at: string;
  status: string;
};

export default function CommitmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const mint = params.id;
  const { connected, publicKey } = useWallet();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CommitmentResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeLock, setActiveLock] = useState<FeeLock | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/commitment/${mint}`);
        if (!res.ok) throw new Error(await res.text());
        const json: CommitmentResponse = await res.json();
        setData(json);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [mint]);

  // Check if connected wallet is the creator
  const isCreator = connected && publicKey && data?.creatorWallet && publicKey.toBase58() === data.creatorWallet;

  // Fetch active lock if user is creator
  useEffect(() => {
    if (!isCreator) {
      setActiveLock(null);
      return;
    }
    async function fetchLock() {
      try {
        const res = await fetch(`/api/fee-locks?mint=${mint}`);
        if (res.ok) {
          const json = await res.json();
          if (json.lock && json.lock.status === "active") {
            setActiveLock(json.lock);
          } else {
            setActiveLock(null);
          }
        }
      } catch {
        // Ignore errors
      }
    }
    fetchLock();
  }, [isCreator, mint]);

  const websiteHref = data?.website ? normalizeUrl("website", data.website) : "";
  const twitterHref = data?.twitter ? normalizeUrl("twitter", data.twitter) : "https://x.com/FluxurFun";
  const telegramHref = data?.telegram ? normalizeUrl("telegram", data.telegram) : "";

  const pumpLink = `https://pump.fun/coin/${mint}`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      <BinaryRain />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/70 via-[#0a0a0a]/50 to-[#0a0a0a]/90 pointer-events-none z-[1]" />

      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-gray-800/50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <img src="/fluxur-logo.png" alt="Fluxur" className="w-10 h-10 logo-glow" />
            <span className="text-lg font-semibold neon-text hidden sm:inline">FLUXUR</span>
          </Link>
          <button type="button" className="neon-box pulse-glow rounded-full px-4 py-2 flex items-center gap-2 text-sm hover:cursor-default">
            <span className="text-gray-400 text-xs uppercase tracking-wide">$FLUXUR</span>
            <span className="neon-text font-medium">Coming Soon</span>
          </button>
        </div>
        <nav className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <Link href="/" className="icon-btn" aria-label="Home"><Home className="w-5 h-5" /></Link>
            <Link href="/discover" className="icon-btn" aria-label="Discover"><Search className="w-5 h-5" /></Link>
            <Link href="/create" className="icon-btn" aria-label="Create"><Plus className="w-5 h-5" /></Link>
            <Link href="/dashboard" className="icon-btn" aria-label="Dashboard"><User className="w-5 h-5" /></Link>
            <Link href="/docs/platform-overview" className="icon-btn" aria-label="Documentation"><FileText className="w-5 h-5" /></Link>
            <Link href="/roadmap" className="icon-btn" aria-label="Roadmap"><Map className="w-5 h-5" /></Link>
            <a href="https://x.com/FluxurFun" target="_blank" rel="noreferrer noopener" className="icon-btn" aria-label="Twitter">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
          <Link href="/create" className="neon-btn rounded-full px-6 py-2.5 text-sm font-semibold ml-2">Create</Link>
        </nav>
      </header>

      <main className="relative z-10 px-4 sm:px-8 py-8">
        {loading && (
          <div className="max-w-4xl mx-auto neon-box rounded-2xl p-6">Loading commitment...</div>
        )}
        {error && (
          <div className="max-w-4xl mx-auto neon-box rounded-2xl p-6 text-red-400">{error}</div>
        )}
        {data && (
          <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">
            {/* Left: Overview */}
            <div className="lg:col-span-2 space-y-6">
              <div className="neon-box rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    {data.name || "Unknown Token"}{" "}
                    {data.symbol ? (
                      <span className="text-gray-500 font-normal">${data.symbol}</span>
                    ) : (
                      <span className="text-gray-600 font-normal italic text-lg">(metadata not found)</span>
                    )}
                  </h1>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Live
                    </span>
                  </div>
                </div>

                {/* Mint + copy + pump.fun */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-gray-500 text-sm">
                    Mint: <span className="text-cyan-400 break-all">{mint}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="neon-box rounded-md px-3 py-1.5 text-xs"
                      onClick={async () => {
                        await navigator.clipboard.writeText(mint);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={pumpLink}
                      target="_blank"
                      rel="noreferrer"
                      className="neon-btn-secondary rounded-md px-3 py-1.5 text-xs"
                    >
                      View on pump.fun
                    </a>
                  </div>
                </div>

                {/* Social icons */}
                {(websiteHref || twitterHref || telegramHref) && (
                  <div className="mt-4 flex items-center gap-2">
                    {websiteHref && (
                      <a href={websiteHref} target="_blank" rel="noreferrer" className="icon-btn w-8 h-8" title="Website">
                        <Globe className="w-4 h-4" />
                      </a>
                    )}
                    {twitterHref && (
                      <a href={twitterHref} target="_blank" rel="noreferrer" className="icon-btn w-8 h-8" title="Twitter">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                    )}
                    {telegramHref && (
                      <a href={telegramHref} target="_blank" rel="noreferrer" className="icon-btn w-8 h-8" title="Telegram">
                        <Send className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Chart section */}
              <div className="neon-box rounded-2xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Chart</h3>
                <div className="w-full rounded-xl overflow-hidden bg-black/30 h-[420px] sm:h-[600px] lg:h-[720px]">
                  <iframe
                    className="w-full h-full border-0"
                    src={`https://dexscreener.com/solana/${mint}`}
                    title="DexScreener"
                  />
                </div>
              </div>

            </div>

            {/* Right: Receipt */}
            <div className="space-y-6">
              <div className="neon-box rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Receipt</h3>
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-gray-500">Escrow Address</div>
                    <div className="text-white break-all">{data.escrowAddress}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Custody Wallet</div>
                    <div className="text-white break-all">{data.custodyWallet}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Creator Payout Wallet</div>
                    <div className="text-white break-all">{data.creatorPayoutWallet}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Commitment ID</div>
                    <div className="text-white break-all">{mint}</div>
                  </div>
                </div>
              </div>

              {/* Lock Creator Fees button - only show if connected wallet is creator */}
              {isCreator && (
                <button
                  type="button"
                  onClick={() => router.push(`/commit/${mint}/lock`)}
                  className={`w-full rounded-xl px-6 py-4 flex items-center justify-center gap-2 text-sm font-semibold ${activeLock ? "neon-btn-secondary" : "neon-btn"}`}
                >
                  <Lock className="w-4 h-4" />
                  {activeLock ? "View Lock Details" : "Lock Creator Fees"}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
