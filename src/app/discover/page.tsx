"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Search, Plus, User, FileText, Map, RefreshCw, Globe, Copy, Send, X } from "lucide-react";
import BinaryRain from "@/components/BinaryRain";
import WalletButton from "@/components/WalletButton";

type FilterTab = "spotlight" | "new" | "hot" | "locked" | "all";
type SortOption = "newest" | "amount_desc" | "oldest";

type ProjectItem = {
  mint: string;
  name: string;
  symbol: string;
  image_url?: string | null;
  banner_url?: string | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  created_at: string;
  // Optional fields for future escrowed amount support
  vault_balance?: number | string | null;
  escrowed_amount?: number | string | null;
};

type ActivityItem = {
  id: number;
  type: string;
  created_at: string;
  coin?: { name: string; symbol: string } | null;
  user?: { wallet_address: string } | null;
};

// Flag to show $FLUXUR coming soon placeholder in Spotlight
// Set to false and add real spotlight projects when ready
const SPOTLIGHT_PLACEHOLDER_FLUXUR = true;

/**
 * Placeholder card for the Spotlight section when no real projects are available.
 * Shows a blurred $FLUXUR "Coming soon" card.
 */
function SpotlightComingSoonCard() {
  return (
    <div className="neon-box rounded-2xl overflow-hidden relative cursor-not-allowed select-none">
      {/* Blurred background content */}
      <div className="filter blur-[6px] pointer-events-none">
        {/* Banner header */}
        <div className="h-32 bg-gradient-to-r from-cyan-900/30 via-purple-900/30 to-cyan-900/30 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/fluxur-logo.png"
              alt="FLUXUR"
              className="w-20 h-20 opacity-30"
            />
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl neon-box flex items-center justify-center overflow-hidden">
              <img
                src="/fluxur-logo.png"
                alt="FLUXUR"
                className="w-12 h-12 object-cover"
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-white">FLUXUR</span>
                <span className="text-gray-500 text-sm">$FLUXUR</span>
              </div>
              <p className="text-gray-400 text-sm">
                The official Fluxur platform token. Lock creator fees, earn rewards.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-800/50">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <span className="text-xs uppercase">CA</span>
              <span className="font-mono">FLXR...SOON</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-gray-500">
                <Globe className="w-4 h-4" />
              </div>
              <div className="text-gray-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Centered overlay text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
        <div className="text-center">
          <h3 className="text-2xl font-bold neon-text mb-2">$FLUXUR</h3>
          <span className="px-4 py-1.5 rounded-full text-sm font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Parse a potential escrowed amount value to a number.
 * Handles strings like "120.5 SOL", numbers, null/undefined.
 */
function parseEscrowedAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  // Try to parse string - remove "SOL" suffix and whitespace
  const cleaned = String(value).replace(/\s*SOL\s*/i, "").trim();
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>("spotlight");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const [newItems, setNewItems] = useState<ProjectItem[]>([]);
  const [loadingNew, setLoadingNew] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [recent, setRecent] = useState<ActivityItem[]>([]);
  useEffect(() => {
    let ignore = false;
    async function loadRecent() {
      try {
        const res = await fetch("/api/activity", { cache: "no-store" });
        const json = await res.json();
        if (!ignore) setRecent(json.items || []);
      } catch {}
    }
    loadRecent();
    const id = setInterval(loadRecent, 15000);
    return () => { ignore = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    async function fetchList() {
      if (activeTab !== "new" && activeTab !== "all" && activeTab !== "locked") return;
      setLoadingNew(true);
      try {
        // For "locked" tab, fetch only commitments with active fee locks
        const url = activeTab === "locked"
          ? "/api/commitments?limit=50&locked=true"
          : "/api/commitments?limit=50";
        const res = await fetch(url);
        const json = await res.json();
        setNewItems(json.items || []);
      } catch {
        setNewItems([]);
      } finally {
        setLoadingNew(false);
      }
    }
    fetchList();
  }, [activeTab, refreshTick]);

  /**
   * Filter and sort the items based on search query and sort option.
   * Order: base dataset -> search filter -> sort
   */
  const filteredAndSortedItems = useMemo(() => {
    let items = [...newItems];

    // 1. Apply search filter (case-insensitive)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      items = items.filter((item) => {
        const nameMatch = (item.name || "").toLowerCase().includes(query);
        const symbolMatch = (item.symbol || "").toLowerCase().includes(query);
        const mintMatch = (item.mint || "").toLowerCase().includes(query);
        return nameMatch || symbolMatch || mintMatch;
      });
    }

    // 2. Apply sort
    items.sort((a, b) => {
      switch (sortBy) {
        case "newest": {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA; // Descending (newest first)
        }
        case "oldest": {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateA - dateB; // Ascending (oldest first)
        }
        case "amount_desc": {
          // Sort by escrowed amount descending
          // Use vault_balance or escrowed_amount if available
          const amountA = parseEscrowedAmount(a.vault_balance ?? a.escrowed_amount);
          const amountB = parseEscrowedAmount(b.vault_balance ?? b.escrowed_amount);
          return amountB - amountA; // Descending (most escrowed first)
        }
        default:
          return 0;
      }
    });

    return items;
  }, [newItems, searchQuery, sortBy]);

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "spotlight", label: "Spotlight" },
    { id: "new", label: "New" },
    { id: "hot", label: "Hot" },
    { id: "locked", label: "Locked" },
    { id: "all", label: "All" },
  ];

  // Check if search is active and has no results
  const hasSearchQuery = searchQuery.trim().length > 0;
  const noSearchResults = hasSearchQuery && filteredAndSortedItems.length === 0 && !loadingNew;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Binary Rain Background */}
      <BinaryRain />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/40 to-[#0a00a0]/80 pointer-events-none z-[1]" />

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
            <Link href="/discover" className="icon-btn active" aria-label="Discover"><Search className="w-5 h-5" /></Link>
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
          <WalletButton />
        </nav>
      </header>

      {/* Main Content */}
      <main className="relative z-10 px-4 sm:px-8 py-8 max-w-6xl mx-auto">
        {/* Discover Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold neon-text">Discover</h1>

          <div className="flex items-center gap-3">
            {/* Search Input with Clear Button */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="neon-box rounded-xl pl-10 pr-9 py-2.5 bg-transparent text-white placeholder-gray-500 text-sm w-48 sm:w-64 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Refresh Button */}
            <button type="button" className="icon-btn" aria-label="Refresh" onClick={() => setRefreshTick((t) => t + 1)}>
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Tabs and Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id ? "neon-btn" : "neon-box text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="neon-box rounded-xl px-4 py-2.5 bg-[#0a0a0a] text-white text-sm focus:outline-none cursor-pointer"
          >
            <option value="newest">Newest</option>
            <option value="amount_desc">Most Escrowed</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Project Cards Grid */}
        <div className="grid gap-6">
          {/* Spotlight Tab - Show placeholder or real spotlight projects */}
          {activeTab === "spotlight" && (
            SPOTLIGHT_PLACEHOLDER_FLUXUR ? (
              <SpotlightComingSoonCard />
            ) : (
              // When SPOTLIGHT_PLACEHOLDER_FLUXUR is false, render real spotlight projects here
              <div className="neon-box rounded-xl p-12 text-center">
                <p className="text-gray-500">No spotlight projects yet</p>
              </div>
            )
          )}

          {(activeTab === "new" || activeTab === "all" || activeTab === "locked") && (
            loadingNew ? (
              <div className="neon-box rounded-xl p-12 text-center mt-2">Loading…</div>
            ) : noSearchResults ? (
              <div className="neon-box rounded-xl p-12 text-center mt-2">
                <p className="text-gray-500 mb-2">No projects found</p>
                <p className="text-gray-600 text-sm">Try a different search term</p>
              </div>
            ) : filteredAndSortedItems.length === 0 ? (
              <div className="neon-box rounded-xl p-12 text-center mt-2">No launches yet</div>
            ) : (
              filteredAndSortedItems.map((item) => (
                <div key={item.mint} className="neon-box rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-cyan-500/10 transition-shadow cursor-pointer" onClick={() => router.push(`/commit/${item.mint}`)}>
                  {/* Card Body */}
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-xl neon-box flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-12 h-12 object-cover" />
                        ) : (
                          <img src="/fluxur-logo.png" alt={item.name} className="w-12 h-12 object-cover" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white">{item.name}</span>
                          <span className="text-gray-500 text-sm">${""}{item.symbol}</span>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-800/50">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm"
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(item.mint); }}
                      >
                        <span className="text-xs uppercase">CA</span>
                        <span className="font-mono">{item.mint.slice(0, 4)}...{item.mint.slice(-4)}</span>
                        <Copy className="w-3 h-3" />
                      </button>
                      <div className="flex items-center gap-3">
                        {item.website && (
                          <a href={item.website} target="_blank" rel="noreferrer noopener" className="text-gray-500 hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
                            <Globe className="w-4 h-4" />
                          </a>
                        )}
                        <a href={(item.twitter && item.twitter.trim()) ? item.twitter : "https://x.com/FluxurFun"} target="_blank" rel="noreferrer noopener" className="text-gray-500 hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                        </a>
                        {item.telegram && (
                          <a href={item.telegram} target="_blank" rel="noreferrer noopener" className="text-gray-500 hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
                            <Send className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Empty State for Hot tab */}
        {activeTab === "hot" && (
          <div className="neon-box rounded-xl p-12 text-center mt-8">
            <p className="text-gray-500">No hot projects yet</p>
          </div>
        )}
      </main>
    </div>
  );
}
