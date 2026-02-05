import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FluxurTimelock } from "../target/types/fluxur_timelock";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("fluxur_timelock", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FluxurTimelock as Program<FluxurTimelock>;
  const connection = provider.connection;

  // Helper to get current on-chain time
  async function getCurrentTime(): Promise<number> {
    const slot = await connection.getSlot();
    const timestamp = await connection.getBlockTime(slot);
    return timestamp || Math.floor(Date.now() / 1000);
  }

  // Helper to derive PDAs
  function derivePDAs(mint: PublicKey): { lockPda: PublicKey; vaultPda: PublicKey; lockBump: number; vaultBump: number } {
    const [lockPda, lockBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("lock"), mint.toBuffer()],
      program.programId
    );
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), mint.toBuffer()],
      program.programId
    );
    return { lockPda, vaultPda, lockBump, vaultBump };
  }

  // Helper to airdrop SOL
  async function airdrop(pubkey: PublicKey, amount: number) {
    const sig = await connection.requestAirdrop(pubkey, amount);
    await connection.confirmTransaction(sig);
  }

  describe("initialize_lock", () => {
    it("should reject unlock time in the past", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      const currentTime = await getCurrentTime();
      const pastUnlockTime = currentTime - 3600; // 1 hour ago

      try {
        await program.methods
          .initializeLock(mint, new anchor.BN(pastUnlockTime))
          .accounts({
            payer: provider.wallet.publicKey,
            lock: lockPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("UnlockTimeInPast");
      }
    });

    it("should reject unlock time equal to current time", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      const currentTime = await getCurrentTime();

      try {
        await program.methods
          .initializeLock(mint, new anchor.BN(currentTime))
          .accounts({
            payer: provider.wallet.publicKey,
            lock: lockPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("UnlockTimeInPast");
      }
    });

    it("should successfully create a lock with future unlock time", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      const currentTime = await getCurrentTime();
      const futureUnlockTime = currentTime + 3600; // 1 hour from now

      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify the lock account
      const lockAccount = await program.account.lockAccount.fetch(lockPda);
      // SECURITY: Creator should be the payer, not a user-supplied value
      expect(lockAccount.creator.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
      expect(lockAccount.mint.toBase58()).to.equal(mint.toBase58());
      expect(lockAccount.unlockTs.toNumber()).to.equal(futureUnlockTime);
    });

    it("should set creator to the signer, not allow arbitrary creator", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);
      const attackerWallet = Keypair.generate().publicKey;

      const currentTime = await getCurrentTime();
      const futureUnlockTime = currentTime + 3600;

      // Even if someone tries to pass a different creator, it's not possible
      // because the instruction no longer accepts a creator argument
      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const lockAccount = await program.account.lockAccount.fetch(lockPda);
      // Creator MUST be the payer/signer
      expect(lockAccount.creator.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
      // Cannot be set to attacker's wallet
      expect(lockAccount.creator.toBase58()).to.not.equal(attackerWallet.toBase58());
    });
  });

  describe("withdraw", () => {
    it("should fail to withdraw before unlock time", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      const currentTime = await getCurrentTime();
      const futureUnlockTime = currentTime + 3600; // 1 hour from now

      // Initialize lock - creator will be provider.wallet.publicKey
      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Deposit SOL into vault
      const depositAmount = 0.5 * LAMPORTS_PER_SOL;
      const transferIx = SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: vaultPda,
        lamports: depositAmount,
      });
      const tx = new anchor.web3.Transaction().add(transferIx);
      await provider.sendAndConfirm(tx);

      // Verify vault has funds
      const vaultBalance = await connection.getBalance(vaultPda);
      expect(vaultBalance).to.be.greaterThan(0);

      // Try to withdraw before unlock - should fail
      try {
        await program.methods
          .withdraw(mint)
          .accounts({
            caller: provider.wallet.publicKey,
            lock: lockPda,
            vault: vaultPda,
            creator: provider.wallet.publicKey, // Creator is the payer who initialized
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("LockNotExpired");
      }
    });

    it("should successfully withdraw after unlock time", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      const currentTime = await getCurrentTime();
      // Set unlock time to 2 seconds in the future (for testing)
      const futureUnlockTime = currentTime + 2;

      // Initialize lock - creator is provider.wallet.publicKey
      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Deposit SOL into vault
      const depositAmount = 0.5 * LAMPORTS_PER_SOL;
      const transferIx = SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: vaultPda,
        lamports: depositAmount,
      });
      const tx = new anchor.web3.Transaction().add(transferIx);
      await provider.sendAndConfirm(tx);

      // Wait for unlock time
      console.log("Waiting for unlock time...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get creator balance before withdraw (creator is provider.wallet)
      const creatorBalanceBefore = await connection.getBalance(provider.wallet.publicKey);
      const vaultBalanceBefore = await connection.getBalance(vaultPda);
      console.log(`Vault balance before withdraw: ${vaultBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`Creator balance before withdraw: ${creatorBalanceBefore / LAMPORTS_PER_SOL} SOL`);

      // Withdraw after unlock
      await program.methods
        .withdraw(mint)
        .accounts({
          caller: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          creator: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify creator received funds
      const creatorBalanceAfter = await connection.getBalance(provider.wallet.publicKey);
      const vaultBalanceAfter = await connection.getBalance(vaultPda);
      console.log(`Vault balance after withdraw: ${vaultBalanceAfter / LAMPORTS_PER_SOL} SOL`);
      console.log(`Creator balance after withdraw: ${creatorBalanceAfter / LAMPORTS_PER_SOL} SOL`);

      // Creator balance should increase (minus tx fee)
      // Vault should decrease
      expect(vaultBalanceAfter).to.be.lessThan(vaultBalanceBefore);
    });

    it("should allow multiple withdrawals after unlock", async () => {
      const mint = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      const currentTime = await getCurrentTime();
      const futureUnlockTime = currentTime + 2;

      // Initialize lock
      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // First deposit
      const depositAmount1 = 0.3 * LAMPORTS_PER_SOL;
      const tx1 = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: vaultPda,
          lamports: depositAmount1,
        })
      );
      await provider.sendAndConfirm(tx1);

      // Wait for unlock
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // First withdrawal
      await program.methods
        .withdraw(mint)
        .accounts({
          caller: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          creator: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vaultBalanceAfterFirst = await connection.getBalance(vaultPda);
      console.log(`Vault balance after first withdrawal: ${vaultBalanceAfterFirst / LAMPORTS_PER_SOL} SOL`);

      // Second deposit
      const depositAmount2 = 0.2 * LAMPORTS_PER_SOL;
      const tx2 = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: vaultPda,
          lamports: depositAmount2,
        })
      );
      await provider.sendAndConfirm(tx2);

      const vaultBalanceAfterSecondDeposit = await connection.getBalance(vaultPda);
      console.log(`Vault balance after second deposit: ${vaultBalanceAfterSecondDeposit / LAMPORTS_PER_SOL} SOL`);

      // Second withdrawal
      await program.methods
        .withdraw(mint)
        .accounts({
          caller: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          creator: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vaultBalanceAfterSecond = await connection.getBalance(vaultPda);
      console.log(`Vault balance after second withdrawal: ${vaultBalanceAfterSecond / LAMPORTS_PER_SOL} SOL`);

      expect(vaultBalanceAfterSecond).to.be.lessThan(vaultBalanceAfterSecondDeposit);
    });

    it("should always send funds to creator (the initializer), not the caller", async () => {
      const mint = Keypair.generate().publicKey;
      const randomCaller = Keypair.generate();
      const { lockPda, vaultPda } = derivePDAs(mint);

      // Airdrop to random caller so they can pay for tx
      await airdrop(randomCaller.publicKey, LAMPORTS_PER_SOL);

      const currentTime = await getCurrentTime();
      const futureUnlockTime = currentTime + 2;

      // Initialize lock - creator is provider.wallet.publicKey (the signer)
      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify creator is the payer
      const lockAccount = await program.account.lockAccount.fetch(lockPda);
      expect(lockAccount.creator.toBase58()).to.equal(provider.wallet.publicKey.toBase58());

      // Deposit SOL
      const depositAmount = 0.5 * LAMPORTS_PER_SOL;
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: vaultPda,
          lamports: depositAmount,
        })
      );
      await provider.sendAndConfirm(tx);

      // Wait for unlock
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const creatorBalanceBefore = await connection.getBalance(provider.wallet.publicKey);
      const callerBalanceBefore = await connection.getBalance(randomCaller.publicKey);

      // Random caller initiates withdraw - funds should go to creator (provider.wallet), not caller
      await program.methods
        .withdraw(mint)
        .accounts({
          caller: randomCaller.publicKey,
          lock: lockPda,
          vault: vaultPda,
          creator: provider.wallet.publicKey, // Must be the actual creator
          systemProgram: SystemProgram.programId,
        })
        .signers([randomCaller])
        .rpc();

      const creatorBalanceAfter = await connection.getBalance(provider.wallet.publicKey);
      const callerBalanceAfter = await connection.getBalance(randomCaller.publicKey);

      console.log(`Creator balance change: ${(creatorBalanceAfter - creatorBalanceBefore) / LAMPORTS_PER_SOL} SOL`);
      console.log(`Caller balance change: ${(callerBalanceAfter - callerBalanceBefore) / LAMPORTS_PER_SOL} SOL`);

      // Creator should receive funds
      expect(creatorBalanceAfter).to.be.greaterThan(creatorBalanceBefore);
      // Caller should only lose tx fee, not gain anything
      expect(callerBalanceAfter).to.be.lessThanOrEqual(callerBalanceBefore);
    });

    it("should reject withdraw if wrong creator is passed", async () => {
      const mint = Keypair.generate().publicKey;
      const wrongCreator = Keypair.generate().publicKey;
      const { lockPda, vaultPda } = derivePDAs(mint);

      // Airdrop to wrong creator so they have an account
      await airdrop(wrongCreator, LAMPORTS_PER_SOL);

      const currentTime = await getCurrentTime();
      const futureUnlockTime = currentTime + 2;

      // Initialize lock - creator is provider.wallet.publicKey
      await program.methods
        .initializeLock(mint, new anchor.BN(futureUnlockTime))
        .accounts({
          payer: provider.wallet.publicKey,
          lock: lockPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Deposit SOL
      const depositAmount = 0.5 * LAMPORTS_PER_SOL;
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: vaultPda,
          lamports: depositAmount,
        })
      );
      await provider.sendAndConfirm(tx);

      // Wait for unlock
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Try to withdraw to wrong creator - should fail
      try {
        await program.methods
          .withdraw(mint)
          .accounts({
            caller: provider.wallet.publicKey,
            lock: lockPda,
            vault: vaultPda,
            creator: wrongCreator, // Wrong creator!
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        // Should fail due to has_one constraint
        expect(err.error.errorCode.code).to.equal("InvalidCreator");
      }
    });
  });
});
