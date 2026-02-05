"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown } from "lucide-react";

export default function WalletButton() {
  const { publicKey, wallet, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Truncate the wallet address for display
  const displayAddress = useMemo(() => {
    if (!publicKey) return null;
    const base58 = publicKey.toBase58();
    return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
  }, [publicKey]);

  const fullAddress = useMemo(() => {
    if (!publicKey) return null;
    return publicKey.toBase58();
  }, [publicKey]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClick = useCallback(() => {
    if (connected) {
      setIsDropdownOpen(!isDropdownOpen);
    } else {
      setVisible(true);
    }
  }, [connected, isDropdownOpen, setVisible]);

  const handleDisconnect = useCallback(async () => {
    setIsDropdownOpen(false);
    try {
      // Try disconnecting through the wallet adapter
      if (wallet?.adapter) {
        await wallet.adapter.disconnect();
      }
      // Also call the disconnect from useWallet hook
      await disconnect();
    } catch (error) {
      console.error("Error disconnecting:", error);
      // Force disconnect by calling disconnect anyway
      try {
        await disconnect();
      } catch (e) {
        // Ignore secondary error
      }
    }
  }, [disconnect, wallet]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleClick}
        disabled={connecting}
        className="neon-btn rounded-full px-6 py-2.5 text-sm font-semibold ml-2 flex items-center gap-2 disabled:opacity-50"
      >
        {connecting ? (
          <>
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Connecting...
          </>
        ) : connected && displayAddress ? (
          <>
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {displayAddress}
            <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
          </>
        ) : (
          "Select Wallet"
        )}
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && connected && (
        <div className="absolute right-0 mt-2 w-64 neon-box rounded-xl overflow-hidden z-50">
          {/* Wallet Address */}
          <div className="p-4 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-1">Connected Wallet</p>
            <p className="text-sm text-cyan-400 font-mono break-all">{fullAddress}</p>
          </div>

          {/* Disconnect Button */}
          <div className="p-2">
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
