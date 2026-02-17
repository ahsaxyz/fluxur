import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";

// IMPORTANT: you must have this file in your web app:
import idl from "@/idl/fluxur_timelock.json";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TIMELOCK_PROGRAM ||
    (idl as any).address // fallback if IDL contains address
);

export const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

export function getProgram(wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as Idl, provider)
}
