"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  Home,
  Search,
  Plus,
  User,
  FileText,
  Map,
  ArrowLeft,
  Lock,
  Calendar,
  CheckCircle,
  Copy,
  Check,
  Coins,
  Clock,
  AlertTriangle,
  ArrowDownCircle,
} from "lucide-react";
import BinaryRain from "@/components/BinaryRain";
import { getProgram, PROGRAM_ID } from "@/lib/anchorClient";

type CommitmentData = {
  mint: string;
  name: string;
  symbol: string;
  creatorWallet: string;
};

type FeeLock = {
  id: number;
  vault_address: string;
  unlock_at: string;
  status: string;
  created_at: string;
  withdrawn_at?: string | null;
  withdraw_tx?: string | null;
};

export default function LockCreatorFeesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const mint = params.id;
  const { connected, publicKey, signTransaction, signAllTransactions } = useWallet();

  const anchorWallet = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    return { publicKey, signTransaction, signAllTransactions };
  }, [publicKey, signTransaction, signAllTransactions]);

  const [loading, setLoading] = useState(true);
  const [commitment, setCommitment] = useState<CommitmentData | null>(null);
  const [existingLock, setExistingLock] = useState<FeeLock | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unlockDate, setUnlockDate] = useState("");
  const [unlockTime, setUnlockTime] = useState("12:00");
  const [timezone, setTimezone] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdLock, setCreatedLock] = useState<FeeLock | null>(null);
  const [copied, setCopied] = useState(false);
  const [vaultBalance, setVaultBalance] = useState<{ lamports: number; sol: number } | null>(null);
  const [showVaultAddress, setShowVaultAddress] = useState(false);

  // Withdraw state
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  const activeLock = existingLock || createdLock;
  // Fees detected only when vault balance >= 0.01 SOL (10_000_000 lamports)
  // Compare using lamports (integer) to avoid floating point issues
  const FEES_DETECTED_THRESHOLD_LAMPORTS = 10_000_000; // 0.01 SOL
  const feesDetected = vaultBalance && vaultBalance.lamports >= FEES_DETECTED_THRESHOLD_LAMPORTS;

  const [countdown, setCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    expired: boolean;
  } | null>(null);

  // PDAs
  const pdas = useMemo(() => {
    if (!mint) return null;
    try {
      const mintPk = new PublicKey(mint);
      const [lockPda] = PublicKey.findProgramAddressSync([Buffer.from("lock"), mintPk.toBuffer()], PROGRAM_ID);
      const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), mintPk.toBuffer()], PROGRAM_ID);
      return { mintPk, lockPda, vaultPda };
    } catch {
      return null;
    }
  }, [mint]);

  const formatUnlockDate = (isoString: string) => {
    const date = new Date(isoString);
    return (
      date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " at " +
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    );
  };

  const copyVaultAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Countdown
  useEffect(() => {
    if (!activeLock) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      const unlockTimeMs = new Date(activeLock.unlock_at).getTime();
      const now = Date.now();
      const diff = unlockTimeMs - now;

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ days, hours, minutes, seconds, expired: false });
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeLock?.unlock_at]);

  // Poll vault balance
  useEffect(() => {
    if (!isCreator || !activeLock) {
      setVaultBalance(null);
      return;
    }

    async function fetchBalance() {
      try {
        const res = await fetch(`/api/fee-locks/status?mint=${mint}`);
        if (res.ok) {
          const json = await res.json();
          setVaultBalance(json.balance || null);
        }
      } catch {
        // ignore
      }
    }

    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [isCreator, activeLock?.id, mint]);

  // Fetch commitment
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/commitment/${mint}`);
        if (!res.ok) throw new Error("Commitment not found");
        const json = await res.json();
        setCommitment({
          mint: json.mint,
          name: json.name,
          symbol: json.symbol,
          creatorWallet: json.creatorWallet,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [mint]);

  // Determine creator + fetch lock (keep withdrawn too)
  useEffect(() => {
    if (!commitment || !connected || !publicKey) {
      setIsCreator(false);
      return;
    }

    const walletAddress = publicKey.toBase58();
    const creator = walletAddress === commitment.creatorWallet;
    setIsCreator(creator);

    async function fetchLock() {
      try {
        const res = await fetch(`/api/fee-locks?mint=${mint}`);
        if (res.ok) {
          const json = await res.json();
          setExistingLock(json.lock || null);
        }
      } catch {
        // ignore
      }
    }

    if (creator) fetchLock();
  }, [commitment, connected, publicKey, mint]);

  // Default unlock date
  useEffect(() => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    setUnlockDate(future.toISOString().split("T")[0]);
    setUnlockTime("12:00");
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const abbr = new Date().toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop() || tz;
      setTimezone(abbr);
    } catch {
      setTimezone("Local");
    }
  }, []);

  // CREATE LOCK:
  // 1) initialize on-chain (Anchor)
  // 2) insert row in Supabase (via /api/fee-locks)
  const handleCreateLock = useCallback(async () => {
    if (!unlockDate || !unlockTime) return;
    if (!anchorWallet) {
      setError("Connect a wallet to create a lock.");
      return;
    }
    if (!pdas) {
      setError("Invalid mint address.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const unlockDateTime = new Date(`${unlockDate}T${unlockTime}:00`);
      const unlockUnix = Math.floor(unlockDateTime.getTime() / 1000);

      // 1) On-chain init using initializeLock instruction
      const program = getProgram(anchorWallet);

      await program.methods
        .initializeLock(pdas.mintPk, new BN(unlockUnix))
        .accounts({
          payer: anchorWallet.publicKey,
          lock: pdas.lockPda,
          vault: pdas.vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2) Supabase row
      const res = await fetch("/api/fee-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, unlock_at: unlockDateTime.toISOString() }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to create lock (db)");
      }

      const lock = await res.json();
      setCreatedLock(lock);
      setExistingLock(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [unlockDate, unlockTime, anchorWallet, pdas, mint]);

  // WITHDRAW
  const handleWithdraw = useCallback(async () => {
    if (!anchorWallet || !pdas) return;

    setWithdrawError(null);
    setWithdrawTx(null);
    setWithdrawSuccess(false);
    setWithdrawing(true);

    try {
      const program = getProgram(anchorWallet);

      const sig = await program.methods
        .withdraw(pdas.mintPk)
        .accounts({
          caller: anchorWallet.publicKey,
          lock: pdas.lockPda,
          vault: pdas.vaultPda,
          creator: anchorWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setWithdrawTx(sig);
      setWithdrawSuccess(true);

      // Mark withdrawn in DB
      await fetch("/api/fee-locks/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, tx: sig }),
      }).catch(() => null);

      // Refresh lock + balance
      const [lockRes, balRes] = await Promise.all([
        fetch(`/api/fee-locks?mint=${mint}`).catch(() => null),
        fetch(`/api/fee-locks/status?mint=${mint}`).catch(() => null),
      ]);

      if (lockRes?.ok) {
        const json = await lockRes.json();
        setExistingLock(json.lock || null);
      }
      if (balRes?.ok) {
        const json = await balRes.json();
        setVaultBalance(json.balance || null);
      }
    } catch (e: unknown) {
      console.error("Withdraw error:", e);
      const msg = e instanceof Error ? e.message : String(e);

      if (msg.includes("LockNotExpired")) {
        setWithdrawError("Lock has not expired yet. Please wait until the unlock date.");
      } else if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("rejected")) {
        setWithdrawError("Transaction cancelled.");
      } else {
        setWithdrawError(msg);
      }
    } finally {
      setWithdrawing(false);
    }
  }, [anchorWallet, pdas, mint]);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split("T")[0];

  const WithdrawSection = () => {
    const lock = activeLock;
    const canWithdraw =
      !!lock &&
      lock.status === "active" &&
      !!feesDetected &&
      countdown?.expired === true;

    if (!lock) return null;

    if (lock.status === "withdrawn") {
      return (
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <div className="neon-box rounded-xl p-4 bg-green-500/10 border-green-500/30">
            <p className="text-green-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Withdrawn
            </p>
            {lock.withdraw_tx && (
              <a
                href={`https://solscan.io/tx/${lock.withdraw_tx}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-cyan-400 text-xs hover:underline font-mono break-all mt-2 inline-block"
              >
                {lock.withdraw_tx.slice(0, 20)}...{lock.withdraw_tx.slice(-8)}
              </a>
            )}
          </div>
        </div>
      );
    }

    if (!canWithdraw) return null;

    return (
      <div className="mt-6 pt-4 border-t border-gray-700/50">
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={withdrawing}
          className="neon-btn rounded-xl px-6 py-4 w-full text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {withdrawing ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Withdrawing...
            </>
          ) : (
            <>
              <ArrowDownCircle className="w-5 h-5" />
              Withdraw Fees
            </>
          )}
        </button>

        <div className="mt-3">
          {withdrawSuccess && withdrawTx && (
            <div className="neon-box rounded-lg p-3 bg-green-500/10 border-green-500/30">
              <p className="text-green-400 text-sm flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4" />
                Withdraw successful!
              </p>
              <a
                href={`https://solscan.io/tx/${withdrawTx}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-cyan-400 text-xs hover:underline font-mono break-all"
              >
                {withdrawTx.slice(0, 20)}...{withdrawTx.slice(-8)}
              </a>
            </div>
          )}

          {withdrawError && (
            <div className="neon-box rounded-lg p-3 bg-red-500/10 border-red-500/30">
              <p className="text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {withdrawError}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

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
        </div>
        <nav className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <Link href="/" className="icon-btn" aria-label="Home">
              <Home className="w-5 h-5" />
            </Link>
            <Link href="/discover" className="icon-btn" aria-label="Discover">
              <Search className="w-5 h-5" />
            </Link>
            <Link href="/create" className="icon-btn" aria-label="Create">
              <Plus className="w-5 h-5" />
            </Link>
            <Link href="/dashboard" className="icon-btn" aria-label="Dashboard">
              <User className="w-5 h-5" />
            </Link>
            <Link href="/docs/platform-overview" className="icon-btn" aria-label="Documentation">
              <FileText className="w-5 h-5" />
            </Link>
            <Link href="/roadmap" className="icon-btn" aria-label="Roadmap">
              <Map className="w-5 h-5" />
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10 px-4 sm:px-8 py-8">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => router.push(`/commit/${mint}`)}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to commitment
          </button>

          {loading && <div className="neon-box rounded-2xl p-6">Loading...</div>}

          {error && <div className="neon-box rounded-2xl p-6 text-red-400">{error}</div>}

          {!loading && commitment && !isCreator && (
            <div className="neon-box rounded-2xl p-6">
              <div className="flex items-center gap-3 text-red-400">
                <Lock className="w-6 h-6" />
                <span className="text-lg font-semibold">Not Authorized</span>
              </div>
              <p className="text-gray-400 mt-2">Only the creator of this coin can access the fee lock settings.</p>
            </div>
          )}

          {!loading && commitment && isCreator && activeLock && (
            <div className="space-y-6">
              <div className="neon-box rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 text-cyan-400">
                    <Lock className="w-6 h-6" />
                    <span className="text-lg font-semibold">
                      {activeLock.status === "withdrawn" ? "Fee Lock (Withdrawn)" : "Fee Lock"}
                    </span>
                  </div>
                  {feesDetected && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> Fees Detected
                    </span>
                  )}
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-gray-500">Unlock Date & Time</div>
                    <div className="text-white">{formatUnlockDate(activeLock.unlock_at)}</div>
                  </div>

                  {feesDetected && countdown && (
                    <div>
                      <div className="text-gray-500 mb-2">Time Until Unlock</div>
                      {countdown.expired ? (
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">Unlocked! Ready for withdrawal</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-cyan-400" />
                          <div className="flex gap-2">
                            <div className="bg-black/50 rounded-lg px-3 py-2 text-center min-w-[60px]">
                              <div className="text-xl font-mono text-white">{countdown.days}</div>
                              <div className="text-xs text-gray-500">days</div>
                            </div>
                            <div className="bg-black/50 rounded-lg px-3 py-2 text-center min-w-[60px]">
                              <div className="text-xl font-mono text-white">{countdown.hours.toString().padStart(2, "0")}</div>
                              <div className="text-xs text-gray-500">hrs</div>
                            </div>
                            <div className="bg-black/50 rounded-lg px-3 py-2 text-center min-w-[60px]">
                              <div className="text-xl font-mono text-white">{countdown.minutes.toString().padStart(2, "0")}</div>
                              <div className="text-xs text-gray-500">min</div>
                            </div>
                            <div className="bg-black/50 rounded-lg px-3 py-2 text-center min-w-[60px]">
                              <div className="text-xl font-mono text-white">{countdown.seconds.toString().padStart(2, "0")}</div>
                              <div className="text-xs text-gray-500">sec</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="text-gray-500">Status</div>
                    <div className={`${activeLock.status === "withdrawn" ? "text-green-400" : "text-cyan-400"} capitalize`}>
                      {activeLock.status}
                    </div>
                  </div>

                  {feesDetected && (
                    <div>
                      <div className="text-gray-500">Vault Balance</div>
                      <div className="text-white flex items-center gap-2">
                        {vaultBalance ? (
                          <>
                            <span className="font-mono">{vaultBalance.sol.toFixed(6)} SOL</span>
                            <span className="text-gray-500 text-xs">({vaultBalance.lamports.toLocaleString()} lamports)</span>
                          </>
                        ) : (
                          <span className="text-gray-500">Loading...</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowVaultAddress(!showVaultAddress)}
                      className="text-cyan-400 text-xs hover:underline"
                    >
                      {showVaultAddress ? "Hide vault address" : "View vault address"}
                    </button>
                    {showVaultAddress && (
                      <div className="mt-2 flex items-start gap-2 bg-black/30 rounded-lg p-2">
                        <code className="text-cyan-400 break-all font-mono text-xs flex-1">{activeLock.vault_address}</code>
                        <button
                          type="button"
                          onClick={() => copyVaultAddress(activeLock.vault_address)}
                          className="flex-shrink-0 p-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors"
                          title="Copy vault address"
                        >
                          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-cyan-400" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {feesDetected && !countdown?.expired && activeLock.status === "active" && (
                  <div className="mt-4 pt-4 border-t border-gray-700/50">
                    <p className="text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Fees are being routed to your vault
                    </p>
                  </div>
                )}

                <WithdrawSection />
              </div>

              {!feesDetected && activeLock.status === "active" && (
                <div className="neon-box rounded-2xl p-6 border-cyan-500/50">
                  <h3 className="text-lg font-semibold text-white mb-3">Step 1: Set Vault Address</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Copy this vault address and set it as your pump.fun creator fee destination.
                  </p>
                  <div className="bg-black/50 rounded-xl p-4 border border-gray-700 mb-6">
                    <div className="text-gray-500 text-xs mb-2">Vault Address</div>
                    <div className="flex items-start gap-2">
                      <code className="text-cyan-400 break-all font-mono text-sm flex-1">{activeLock.vault_address}</code>
                      <button
                        type="button"
                        onClick={() => copyVaultAddress(activeLock.vault_address)}
                        className="flex-shrink-0 p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors"
                        title="Copy vault address"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-3">Step 2: Claim Fees on pump.fun</h3>
                  <ol className="space-y-2 text-gray-400 text-sm list-decimal list-inside">
                    <li>Visit pump.fun for your token</li>
                    <li>Set the reward destination to the vault address</li>
                    <li className="text-red-400">Creator share must be ≥ 1% or fees cannot be claimed</li>
                    <li>Claim creator rewards using your creator wallet</li>
                    <li>Once funds arrive, Fluxur detects them automatically</li>
                  </ol>
                </div>
              )}

              <button
                type="button"
                onClick={() => router.push(`/commit/${mint}`)}
                className="neon-btn-secondary rounded-xl px-6 py-3 w-full"
              >
                Back to Commitment
              </button>
            </div>
          )}

          {!loading && commitment && isCreator && !activeLock && (
            <div className="space-y-6">
              <div className="neon-box rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="w-6 h-6 text-cyan-400" />
                  <h1 className="text-xl font-bold">Lock Creator Fees</h1>
                </div>
                <p className="text-gray-400">
                  <span className="text-white font-medium">{commitment.name}</span> (${commitment.symbol})
                </p>
              </div>

              <div className="neon-box rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">How it works</h2>
                <ol className="space-y-3 text-gray-300 text-sm">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <span>Choose how long you want to lock your creator fees</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <span>A unique vault PDA address will be generated for your coin</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <span>Set your pump.fun creator fee wallet to the vault address</span>
                  </li>
                  <li className="flex gap-3 items-center">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 ml-1" />
                    <span className="text-red-400 text-xs font-medium">
                      Creator share must be ≥ 1% or fees cannot be claimed.
                    </span>
                  </li>
                  <li className="flex gap-3 items-center">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 ml-1" />
                    <span className="text-red-400 text-xs font-medium">
                      You must remove creator share permissions on pump.fun (irreversible).
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <span>Fees will be routed to the vault until the unlock date</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                      5
                    </span>
                    <span>After unlock, you can withdraw your fees</span>
                  </li>
                </ol>
              </div>

              <div className="neon-box rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                  Select Unlock Date & Time
                </h2>
                <p className="text-gray-400 text-sm mb-4">Choose when your creator fees will unlock.</p>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-500 text-xs mb-2">Date</label>
                    <input
                      type="date"
                      value={unlockDate}
                      min={minDateStr}
                      onChange={(e) => setUnlockDate(e.target.value)}
                      className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-cyan-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 text-xs mb-2">Time</label>
                    <input
                      type="time"
                      value={unlockTime}
                      onChange={(e) => setUnlockTime(e.target.value)}
                      className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-cyan-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <p className="text-gray-500 text-xs mb-4">Your time ({timezone})</p>

                {unlockDate && unlockTime && (
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                    <p className="text-cyan-400 text-sm">
                      Fees unlock on{" "}
                      <span className="font-semibold">
                        {new Date(`${unlockDate}T${unlockTime}:00`).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
                        at{" "}
                        {new Date(`${unlockDate}T${unlockTime}:00`).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleCreateLock}
                disabled={creating || !unlockDate}
                className="neon-btn rounded-xl px-6 py-4 w-full text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating Lock...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Create Lock
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
