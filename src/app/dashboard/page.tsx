"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home, Search, Plus, User, FileText, Map } from "lucide-react";
import BinaryRain from "@/components/BinaryRain";
import WalletButton from "@/components/WalletButton";
import WalletConnectCard from "@/components/WalletConnectCard";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/components/AuthProvider";

type ActivityItem = {
  id: number;
  type: string;
  created_at: string;
  coin: { id: number; name: string; symbol: string; mint_address?: string | null } | null;
};

export default function DashboardPage() {
  const { connected } = useWallet();
  const { user, loading: authLoading } = useAuth();
  const [recent, setRecent] = useState<ActivityItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (authLoading) return; // wait for auth state
      if (!user || !connected) {
        setRecent([]);
        return;
      }
      setLoadingRecent(true);
      try {
        const res = await fetch("/api/activity", { cache: "no-store" });
        const json = await res.json();
        if (!ignore) setRecent(json.items || []);
      } finally {
        if (!ignore) setLoadingRecent(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [user, authLoading, connected]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Binary Rain Background */}
      <BinaryRain />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/40 to-[#0a0a0a]/80 pointer-events-none z-[1]" />

      {/* Header */}
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
            <Link href="/dashboard" className="icon-btn active" aria-label="Dashboard"><User className="w-5 h-5" /></Link>
            <Link href="/docs/platform-overview" className="icon-btn" aria-label="Documentation"><FileText className="w-5 h-5" /></Link>
            <Link href="/roadmap" className="icon-btn" aria-label="Roadmap"><Map className="w-5 h-5" /></Link>
            <a href="https://x.com/FluxurFun" target="_blank" rel="noreferrer noopener" className="icon-btn" aria-label="Twitter">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
          <WalletButton />
        </nav>
      </header>

      {/* Main Content */}
      <main className="relative z-10 px-4 sm:px-8 py-8 max-w-6xl mx-auto">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold neon-text">Dashboard</h1>
        </div>

        {/* Connect Wallet Card */}
        <WalletConnectCard
          title="Connect your wallet"
          description="View your claimable $FLUXUR, holdings, and voting history."
        />

        {/* Recent Activity Section */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">Recent Activity</h2>
          <div className="neon-box rounded-xl p-8">
            {authLoading ? (
              <p className="text-gray-500">Loading…</p>
            ) : !user ? (
              <p className="text-gray-500">No recent activity</p>
            ) : loadingRecent ? (
              <p className="text-gray-500">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="text-gray-500">No recent activity</p>
            ) : (
              <ul className="space-y-4">
                {recent.map((a) => {
                  const href = a.coin?.mint_address ? `/commit/${a.coin.mint_address}` : "/commitments";
                  const walletShort = user?.wallet_address ? `${user.wallet_address.slice(0,4)}...${user.wallet_address.slice(-4)}` : "";
                  return (
                    <li key={a.id}>
                      <a href={href} className="block neon-box rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-cyan-500/10 transition-shadow">
                        <div className="p-6">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{a.coin?.name || "Unknown"}</span>
                                <span className="text-gray-500 text-sm">{a.coin?.symbol || ""}</span>
                              </div>
                            </div>
                            <div className="text-gray-500 text-sm">{walletShort}</div>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-gray-800/50">
                            <div className="flex items-center gap-2 text-gray-500 text-sm">
                              <span className="text-xs uppercase">CA</span>
                              {a.coin?.mint_address ? (
                                <a href={href} className="font-mono hover:text-white">
                                  {`${a.coin.mint_address.slice(0,4)}...${a.coin.mint_address.slice(-4)}`}
                                </a>
                              ) : (
                                <span className="font-mono">Unknown</span>
                              )}
                            </div>
                            <div className="text-gray-400 text-xs">{new Date(a.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
