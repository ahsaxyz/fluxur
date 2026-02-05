"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Home, Search, Plus, User, FileText, Map, Upload, Image, Zap, Lock, ChevronDown, X } from "lucide-react";
import BinaryRain from "@/components/BinaryRain";
import WalletButton from "@/components/WalletButton";
import WalletConnectButton from "@/components/WalletConnectButton";
import { useWallet } from "@solana/wallet-adapter-react";

type CreateMode = "auto-lock" | "manual";

export default function CreatePage() {
  const router = useRouter();
  const [mode, setMode] = useState<CreateMode>("auto-lock");
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [showSocialLinks, setShowSocialLinks] = useState(false);
  const [devBuyAmount, setDevBuyAmount] = useState<number>(0.0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { publicKey, connected } = useWallet();

  const [coinName, setCoinName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [tokenMintAddress, setTokenMintAddress] = useState("");

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedBanner, setSelectedBanner] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");

  const [status, setStatus] = useState<"idle" | "uploading" | "building" | "awaiting_signature" | "sending" | "confirmed" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [txSignature, setTxSignature] = useState<string>("");
  const [tokenLink, setTokenLink] = useState<string>("");

  const [manualVerifying, setManualVerifying] = useState(false);
  const [manualVerified, setManualVerified] = useState(false);
  const [manualVerifyError, setManualVerifyError] = useState<string | null>(null);
  const [manualVerifyDebug, setManualVerifyDebug] = useState<{ mint: string; cluster: string; wallet: string; derivedCreator: string | null; oldestSig: string | null } | null>(null);
  const [manualTokenName, setManualTokenName] = useState("");
  const [manualTokenSymbol, setManualTokenSymbol] = useState("");
  const [manualTokenImage, setManualTokenImage] = useState("");

  const walletAddress = connected && publicKey ? publicKey.toBase58() : "";

  useEffect(() => {
    if (mode !== "manual" || !tokenMintAddress.trim() || !connected || !publicKey) {
      setManualVerified(false);
      setManualVerifyError(null);
      setManualVerifyDebug(null);
      setManualTokenName("");
      setManualTokenSymbol("");
      setManualTokenImage("");
      return;
    }

    const verifyCreator = async () => {
      setManualVerifying(true);
      setManualVerified(false);
      setManualVerifyError(null);
      setManualVerifyDebug(null);

      try {
        const res = await fetch("/api/token/verify-creator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mint: tokenMintAddress.trim(),
            wallet: publicKey.toBase58(),
          }),
        });

        const json = await res.json();

        if (!res.ok || !json.verified) {
          setManualVerifyError(json.error || "Wallet is not the token creator.");
          setManualVerifyDebug(json.debug || null);
          setManualVerified(false);
        } else {
          setManualVerified(true);
          setManualTokenName(json.name || "");
          setManualTokenSymbol(json.symbol || "");
          setManualTokenImage(json.image || "");
          if (json.name && !coinName) setCoinName(json.name);
          if (json.symbol && !ticker) setTicker(json.symbol);
        }
      } catch {
        setManualVerifyError("Failed to verify token ownership");
        setManualVerified(false);
      } finally {
        setManualVerifying(false);
      }
    };

    const timeout = setTimeout(verifyCreator, 500);
    return () => clearTimeout(timeout);
  }, [mode, tokenMintAddress, connected, publicKey, coinName, ticker]);

  const isFormValid = useMemo(() => {
    if (!connected) return false;
    if (mode === "auto-lock") {
      return !!(selectedImage && coinName.trim() && ticker.trim());
    } else {
      return !!(tokenMintAddress.trim() && manualVerified);
    }
  }, [connected, mode, selectedImage, coinName, ticker, tokenMintAddress, manualVerified]);

  type PhantomSolanaProvider = {
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  };
  const phantom: PhantomSolanaProvider | undefined =
    typeof window !== "undefined"
      ? (window as unknown as { solana?: PhantomSolanaProvider }).solana
      : undefined;

  const uploadToPumpIpfs = useCallback(async () => {
    if (!selectedImage) throw new Error("Missing image");
    const resBlob = await fetch(selectedImage).then((r) => r.blob());

    const form = new FormData();
    form.append("file", resBlob, "banner.png");
    form.append("name", coinName);
    form.append("symbol", ticker);
    form.append("description", description);
    const site = websiteUrl.trim() || "https://fluxur.fun";
    form.append("website", site);
    if (twitterUrl.trim()) form.append("twitter", twitterUrl.trim());
    if (telegramUrl.trim()) form.append("telegram", telegramUrl.trim());

    const res = await fetch("/api/pump/ipfs", { method: "POST", body: form });
    if (!res.ok) throw new Error(`IPFS upload failed: ${await res.text()}`);
    const json = await res.json();
    return json.metadataUri as string;
  }, [selectedImage, coinName, ticker, description, websiteUrl, twitterUrl, telegramUrl]);

  // Create flow handler - ALWAYS uses FLXR vanity mint
  const handleSubmit = useCallback(async () => {
    if (!isFormValid || !connected || !publicKey) return;

    let vanityMintPublicKey: string | null = null;

    try {
      setIsSubmitting(true);
      setStatus("uploading");
      setStatusMessage("Uploading image & metadata to IPFS...");
      const metadataUri = await uploadToPumpIpfs();

      setStatus("building");
      setStatusMessage("Building transaction with your FLXR address...");

      // Server always uses vanity mint and signs with it
      const buildRes = await fetch("/api/pump/create-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: publicKey.toBase58(),
          name: coinName,
          symbol: ticker,
          metadataUri,
          website: websiteUrl.trim() || "https://fluxur.fun",
          twitter: twitterUrl.trim() || null,
          telegram: telegramUrl.trim() || null,
          imageUrl: selectedImage || null,
          amount: devBuyAmount || 0.0,
          slippage: 10,
          priorityFee: 0.0005,
          pool: "pump",
        }),
      });

      // Parse response - handle errors gracefully
      const buildJson = await buildRes.json();

      if (!buildRes.ok) {
        // Show the friendly error message from server
        throw new Error(buildJson.error || "Failed to build transaction");
      }

      const { encodedTx, encoding, mint, isVanityMint, vanityMintPublicKey: vanityKey } = buildJson;
      if (!encodedTx || !encoding) throw new Error("Failed to build transaction. Please try again.");

      if (isVanityMint && vanityKey) {
        vanityMintPublicKey = vanityKey;
      }

      setStatus("awaiting_signature");
      setStatusMessage("Please sign the transaction in your wallet...");

      const txBytes = Buffer.from(encodedTx, "base64");
      console.log("create: txBytes.length", txBytes.length);
      const tx = VersionedTransaction.deserialize(txBytes);

      // Server already signed with vanity mint keypair - we just need user's wallet signature
      if (!phantom) throw new Error("Wallet not connected. Please refresh and try again.");

      const signed = await phantom.signTransaction(tx);

      setStatus("sending");
      setStatusMessage("Sending transaction to Solana...");
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, { commitment: "confirmed" });
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });

      setStatusMessage("Confirming transaction...");
      await connection.confirmTransaction(signature, "confirmed");

      setTxSignature(signature);
      setStatus("confirmed");
      setStatusMessage("Token created successfully!");

      const mintedAddress = mint;

      // Mark vanity mint as used after successful confirmation
      if (vanityMintPublicKey) {
        try {
          await fetch("/api/vanity/mark-used", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_key: vanityMintPublicKey,
              tx_signature: signature,
            }),
          });
          console.log("FLXR mint marked as used:", vanityMintPublicKey);
        } catch (e) {
          console.warn("Failed to mark FLXR mint as used:", e);
        }
      }

      try {
        await fetch("/api/coins/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: coinName || "Untitled", symbol: ticker || "" }),
        });
      } catch (e) {
        console.warn("coins/create failed", e);
      }

      if (mintedAddress) {
        setTokenLink(`https://pump.fun/${mintedAddress}`);
        if (autoLockEnabled) {
          router.push(`/commit/${mintedAddress}/lock`);
        } else {
          router.push(`/commit/${mintedAddress}`);
        }
      } else {
        setTokenLink(`https://solscan.io/tx/${signature}`);
      }
    } catch (e: unknown) {
      console.error("Create token error:", e);
      const msg = e instanceof Error ? e.message : String(e);

      // Release vanity mint if user rejected after building
      if (vanityMintPublicKey && msg.includes("User rejected")) {
        try {
          await fetch("/api/vanity/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_key: vanityMintPublicKey }),
          });
          console.log("Released FLXR mint after user rejection:", vanityMintPublicKey);
        } catch (releaseErr) {
          console.warn("Failed to release FLXR mint:", releaseErr);
        }
      }

      // Show error messages - show actual errors for column/function issues
      if (msg.includes("does not exist") || msg.includes("Could not find")) {
        // Show actual error for debugging column/function issues
        setStatusMessage(msg);
      } else if (msg.includes("User rejected")) {
        setStatusMessage("Transaction cancelled.");
      } else if (msg.includes("No FLXR addresses")) {
        setStatusMessage("No FLXR addresses available right now. Please try again in a few minutes.");
      } else if (msg.includes("reserve_vanity_mint failed")) {
        setStatusMessage(msg);
      } else if (/403|forbidden|access denied/i.test(msg)) {
        setStatusMessage("Network error. Please try again.");
      } else if (msg.includes("IPFS")) {
        setStatusMessage("Failed to upload image. Please try again.");
      } else {
        setStatusMessage("Something went wrong. Please try again.");
      }
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }, [isFormValid, connected, publicKey, uploadToPumpIpfs, coinName, ticker, devBuyAmount, phantom, router, websiteUrl, twitterUrl, telegramUrl, selectedImage, autoLockEnabled]);

  // Manual mode: Create commitment for existing token
  const handleManualSubmit = useCallback(async () => {
    if (!isFormValid || !connected || !publicKey || mode !== "manual" || !manualVerified) return;

    try {
      setIsSubmitting(true);
      setStatus("building");
      setStatusMessage("Creating commitment for existing token...");

      const res = await fetch("/api/commitment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint: tokenMintAddress.trim(),
          name: manualTokenName || null,
          symbol: manualTokenSymbol || null,
          imageUrl: manualTokenImage || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create commitment");
      }

      setStatus("confirmed");
      setStatusMessage("Commitment created successfully!");
      setTokenLink(`https://pump.fun/${tokenMintAddress.trim()}`);

      const mint = tokenMintAddress.trim();
      if (autoLockEnabled) {
        router.push(`/commit/${mint}/lock`);
      } else {
        router.push(`/commit/${mint}`);
      }
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMessage(msg);
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }, [isFormValid, connected, publicKey, mode, manualVerified, tokenMintAddress, manualTokenName, manualTokenSymbol, manualTokenImage, autoLockEnabled, router]);

  const handleFileSelect = useCallback((file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        setSelectedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleBannerSelect = useCallback((file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        setSelectedBanner(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleBannerInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleBannerSelect(file);
  }, [handleBannerSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const clearImage = useCallback(() => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const clearBanner = useCallback(() => {
    setSelectedBanner(null);
    if (bannerInputRef.current) bannerInputRef.current.value = "";
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      <BinaryRain />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/70 via-[#0a0a0a]/50 to-[#0a0a0a]/90 pointer-events-none z-[1]" />

      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-gray-800/50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <img src="https://ugc.same-assets.com/kyergV5aGVeGB-o8AD0F95NWQLE_0L9_.png" alt="Fluxur" className="w-10 h-10 logo-glow" />
            <span className="text-lg font-semibold neon-text hidden sm:inline">FLUXUR</span>
          </Link>
          <button type="button" className="neon-box pulse-glow rounded-full px-4 py-2 flex items-center gap-2 text-sm hover:cursor-default">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Token</span>
            <span className="neon-text font-medium">Coming Soon</span>
          </button>
        </div>

        <nav className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <Link href="/" className="icon-btn" aria-label="Home"><Home className="w-5 h-5" /></Link>
            <Link href="/discover" className="icon-btn" aria-label="Discover"><Search className="w-5 h-5" /></Link>
            <Link href="/create" className="icon-btn active" aria-label="Create"><Plus className="w-5 h-5" /></Link>
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

      <main className="relative z-10 px-4 sm:px-8 py-8 max-w-2xl mx-auto">
        {/* Mode Toggle */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            type="button"
            onClick={() => setMode("auto-lock")}
            className={`p-4 rounded-xl text-left transition-all ${mode === "auto-lock" ? "neon-btn" : "neon-box hover:bg-white/5"}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Zap className={`w-5 h-5 ${mode === "auto-lock" ? "text-black" : "text-cyan-400"}`} />
              <span className={`font-semibold ${mode === "auto-lock" ? "text-black" : "text-white"}`}>Launch with Auto-Lock</span>
            </div>
            <p className={`text-sm ${mode === "auto-lock" ? "text-black/70" : "text-gray-400"}`}>We launch your token and auto-lock fees</p>
          </button>

          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`p-4 rounded-xl text-left transition-all ${mode === "manual" ? "neon-btn" : "neon-box hover:bg-white/5"}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Lock className={`w-5 h-5 ${mode === "manual" ? "text-black" : "text-purple-400"}`} />
              <span className={`font-semibold ${mode === "manual" ? "text-black" : "text-white"}`}>Manual Lock</span>
            </div>
            <p className={`text-sm ${mode === "manual" ? "text-black/70" : "text-gray-400"}`}>Already launched? Link your existing token</p>
          </button>
        </div>

        {/* Image Upload - only for auto-lock mode */}
        {mode === "auto-lock" && (
          <>
            <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept="image/png,image/jpeg,image/gif" className="hidden" />

            {selectedImage ? (
              <div className="neon-box rounded-2xl p-4 mb-6 relative">
                <button type="button" onClick={clearImage} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors">
                  <X className="w-4 h-4 text-white" />
                </button>
                <div className="aspect-square max-w-xs mx-auto rounded-xl overflow-hidden">
                  <img src={selectedImage} alt="Selected" className="w-full h-full object-cover" />
                </div>
                <p className="text-center text-green-400 text-sm mt-4 flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  Image uploaded successfully
                </p>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="neon-btn-secondary rounded-xl px-4 py-2 text-sm font-medium mx-auto mt-3 block">Change image</button>
              </div>
            ) : (
              <div
                className={`neon-box rounded-2xl p-8 mb-6 text-center cursor-pointer transition-all ${isDragging ? "border-cyan-400 bg-cyan-400/10" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className={`w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4 transition-colors ${isDragging ? "bg-cyan-400/20" : ""}`}>
                  <Upload className={`w-8 h-8 ${isDragging ? "text-cyan-400" : "text-gray-500"}`} />
                </div>
                <p className="text-white font-medium mb-2">{isDragging ? "Drop your image here" : "Select image to upload"}</p>
                <p className="text-gray-500 text-sm mb-4">or drag and drop it here</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="neon-btn rounded-xl px-6 py-2.5 text-sm font-semibold">Select file</button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
              <div>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">File size and type</span>
                </div>
                <ul className="text-gray-500 ml-6 list-disc"><li>Max 15mb, .jpg, .gif or .png</li></ul>
              </div>
              <div>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <Image className="w-4 h-4" />
                  <span className="font-medium">Resolution</span>
                </div>
                <ul className="text-gray-500 ml-6 list-disc"><li>Min. 500×500px, 1:1 square</li></ul>
              </div>
            </div>
          </>
        )}

        {/* Coin Details */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-2">Coin details</h2>
          <p className="text-gray-500 text-sm mb-4">Choose carefully, these can't be changed once created.</p>

          {mode === "auto-lock" && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Coin name</label>
                  <input type="text" value={coinName} onChange={(e) => setCoinName(e.target.value)} placeholder="Name your coin" className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Ticker</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="e.g. DOGE" className="w-full neon-box rounded-xl pl-8 pr-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Description <span className="text-gray-600">(Optional)</span></label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Write a short description" rows={3} className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none resize-none" />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Banner Image <span className="text-gray-600">(Optional)</span></label>
                <input type="file" ref={bannerInputRef} onChange={handleBannerInputChange} accept="image/png,image/jpeg,image/gif" className="hidden" />

                {selectedBanner ? (
                  <div className="relative neon-box rounded-xl overflow-hidden">
                    <button type="button" onClick={clearBanner} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors">
                      <X className="w-4 h-4 text-white" />
                    </button>
                    <div className="aspect-[3/1] w-full">
                      <img src={selectedBanner} alt="Banner" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3 flex items-center justify-between bg-black/30">
                      <p className="text-green-400 text-sm flex items-center gap-2"><span className="w-2 h-2 bg-green-400 rounded-full" />Banner uploaded</p>
                      <button type="button" onClick={() => bannerInputRef.current?.click()} className="text-cyan-400 text-sm hover:underline">Change</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => bannerInputRef.current?.click()} className="w-full neon-box rounded-xl px-4 py-3 flex items-center gap-3 text-gray-500 hover:bg-white/5 transition-colors">
                    <Upload className="w-5 h-5" />
                    <span className="text-sm">Upload banner (1500×500)</span>
                  </button>
                )}
              </div>
            </>
          )}

          {mode === "manual" && (
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Token Mint Address</label>
                <input type="text" value={tokenMintAddress} onChange={(e) => setTokenMintAddress(e.target.value)} placeholder="Paste your existing token contract address" className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" />
                {tokenMintAddress.trim() && connected && (
                  <div className="mt-2">
                    {manualVerifying && (
                      <p className="text-cyan-400 text-xs flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        Verifying token ownership...
                      </p>
                    )}
                    {!manualVerifying && manualVerified && (
                      <p className="text-green-400 text-xs flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-400 rounded-full" />
                        Verified. You are the token creator.
                      </p>
                    )}
                    {!manualVerifying && manualVerifyError && (
                      <div className="space-y-1">
                        <p className="text-red-400 text-xs">{manualVerifyError}</p>
                        {manualVerifyDebug && (
                          <div className="bg-black/50 rounded-lg p-2 text-xs font-mono text-gray-500 space-y-0.5">
                            <div>Cluster: {manualVerifyDebug.cluster}</div>
                            <div>Your wallet: {manualVerifyDebug.wallet?.slice(0, 8)}...{manualVerifyDebug.wallet?.slice(-4)}</div>
                            <div>Derived creator: {manualVerifyDebug.derivedCreator ? `${manualVerifyDebug.derivedCreator.slice(0, 8)}...${manualVerifyDebug.derivedCreator.slice(-4)}` : "N/A"}</div>
                            {manualVerifyDebug.oldestSig && (
                              <div>Oldest tx: <a href={`https://solscan.io/tx/${manualVerifyDebug.oldestSig}`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{manualVerifyDebug.oldestSig.slice(0, 8)}...</a></div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {manualVerified && (
                <div className={`neon-box rounded-xl p-4 ${(manualTokenName || manualTokenSymbol) ? "bg-green-500/5 border-green-500/30" : "bg-yellow-500/5 border-yellow-500/30"}`}>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">{(manualTokenName || manualTokenSymbol) ? "On-chain Metadata" : "Metadata Not Found"}</div>
                  <div className="flex items-center gap-4">
                    {manualTokenImage && <img src={manualTokenImage} alt={manualTokenName} className="w-12 h-12 rounded-lg object-cover" />}
                    <div>
                      {(manualTokenName || manualTokenSymbol) ? (
                        <>
                          <div className="font-semibold text-white">{manualTokenName}</div>
                          <div className="text-gray-400 text-sm">${manualTokenSymbol}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-white">Unknown Token</div>
                          <div className="text-gray-500 text-sm italic">(metadata not found)</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "auto-lock" && (
            <>
              <button type="button" onClick={() => setShowSocialLinks(!showSocialLinks)} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                <ChevronDown className={`w-4 h-4 transition-transform ${showSocialLinks ? "rotate-180" : ""}`} />
                <span className="text-sm">Add social links <span className="text-gray-600">(Optional)</span></span>
              </button>

              {showSocialLinks && (
                <div className="mt-4 space-y-3">
                  <input type="text" placeholder="Website URL" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" />
                  <input type="text" placeholder="Twitter/X URL" value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)} className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" />
                  <input type="text" placeholder="Telegram URL" value={telegramUrl} onChange={e => setTelegramUrl(e.target.value)} className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Fee Lock Settings */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-2">Fee Lock Settings</h2>
          <p className="text-gray-500 text-sm mb-4">Lock your pump.fun creator fees in a time-locked vault.</p>

          <div className="neon-box rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">Auto-Lock Fees</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">Recommended</span>
                  </div>
                  <p className="text-gray-500 text-sm">Automatically lock creator fees in escrow</p>
                </div>
              </div>
              <button type="button" onClick={() => setAutoLockEnabled(!autoLockEnabled)} className={`w-12 h-6 rounded-full transition-colors ${autoLockEnabled ? "bg-gradient-to-r from-cyan-500 to-purple-500" : "bg-gray-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${autoLockEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>

          {/* Vanity mint indicator - always show for launch mode */}
          {mode === "auto-lock" && (
            <div className="neon-box rounded-xl p-3 bg-cyan-500/5 border-cyan-500/30">
              <p className="text-cyan-400 text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                Your token will have a FLXR address
              </p>
            </div>
          )}
        </div>

        {/* Connect Wallet */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-2">Connect Wallet</h2>
          <p className="text-gray-500 text-sm mb-4">Connect your wallet to create your commitment.</p>

          {connected && walletAddress ? (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Your Wallet</label>
              <div className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-cyan-400 text-sm font-mono break-all">{walletAddress}</div>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Your Wallet</label>
              <div className="w-full neon-box rounded-xl px-4 py-3 bg-transparent text-gray-600 text-sm">Connect your wallet to auto-fill</div>
            </div>
          )}

          {mode === "auto-lock" && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Dev buy <span className="text-gray-600">(Optional)</span></label>
              <div className="flex items-center gap-3">
                <input type="number" min={0} step={0.01} value={devBuyAmount} onChange={e => setDevBuyAmount(Number(e.target.value))} className="w-24 neon-box rounded-xl px-2 py-2 bg-transparent text-white placeholder-gray-600 text-sm focus:outline-none" placeholder="0.0" />
                <span className="text-gray-400 text-sm">SOL to buy after launch</span>
              </div>
            </div>
          )}

          <WalletConnectButton />
        </div>

        {/* Warning Box */}
        {!connected ? (
          <div className="neon-box rounded-xl p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
            <h3 className="font-medium text-yellow-400 mb-2">Before you can create:</h3>
            <p className="text-gray-400 text-sm">• Connect your wallet.</p>
          </div>
        ) : !isFormValid ? (
          <div className="neon-box rounded-xl p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
            <h3 className="font-medium text-yellow-400 mb-2">Almost there!</h3>
            <p className="text-gray-400 text-sm">
              {mode === "auto-lock"
                ? "• Fill in coin name, ticker, and upload an image."
                : manualVerifying
                  ? "• Verifying token ownership..."
                  : manualVerifyError
                    ? `• ${manualVerifyError}`
                    : !tokenMintAddress.trim()
                      ? "• Enter your token mint address."
                      : "• Waiting for verification..."}
            </p>
          </div>
        ) : (
          <div className="neon-box rounded-xl p-4 mb-6 border-green-500/30 bg-green-500/5">
            <h3 className="font-medium text-green-400 mb-2">Ready to {mode === "manual" ? "link" : "create"}!</h3>
            <p className="text-gray-400 text-sm">
              {mode === "manual"
                ? "• Verified as token creator. Click below to link this token."
                : "• All required fields are filled. You can create your commitment."}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={mode === "manual" ? handleManualSubmit : handleSubmit}
          disabled={!isFormValid || isSubmitting}
          className={`w-full rounded-xl py-4 text-center font-semibold transition-all ${isFormValid && !isSubmitting ? "neon-btn cursor-pointer" : "neon-box text-gray-500 cursor-not-allowed opacity-50"}`}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              {mode === "manual" ? "Linking Token..." : "Creating..."}
            </span>
          ) : (
            mode === "manual" ? "Link Token & Create Commitment" : "Create Commitment"
          )}
        </button>

        {/* Status section */}
        {status !== "idle" && (
          <div className="neon-box rounded-xl p-4 mt-6">
            <h3 className="font-medium text-white mb-2">Status</h3>
            <p className="text-gray-400 text-sm">{statusMessage}</p>
            {txSignature && (
              <div className="mt-3 text-sm">
                <a href={tokenLink || `https://solscan.io/tx/${txSignature}`} target="_blank" rel="noreferrer noopener" className="text-cyan-400 hover:underline">View on Solscan ({txSignature.slice(0, 8)}...)</a>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
