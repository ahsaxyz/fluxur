# Fluxur

Fluxur is a Solana-based protocol designed to make commitment provable, time-based, and publicly verifiable on-chain.

Instead of relying on promises, social signals, or off-chain agreements, Fluxur enables creators and developers to demonstrate long-term alignment through irreversible on-chain actions.

---

## What is Fluxur?

Fluxur introduces a new primitive for on-chain ecosystems:

**Provable commitment.**

Developers can lock creator fees, tokens, or value in time-based smart contracts that unlock only after a chosen duration.  
These commitments are fully on-chain and publicly verifiable.

This creates transparency between builders and communities without relying on trust.

---

## Core Features

- Time-based creator fee locks  
- On-chain commitment verification  
- Launchpad with FLXR-ending token addresses  
- Public discover dashboard for locked projects  
- Non-custodial and fully transparent architecture  

Fluxur is built as infrastructure for long-term alignment in crypto ecosystems.

---

## Architecture

**Smart Contracts**
- Solana + Anchor based timelock program
- Non-custodial vault architecture
- On-chain unlock scheduling

**Frontend**
- Next.js + TypeScript
- Wallet-based authentication
- Real-time lock + activity tracking

**Backend / Infra**
- Supabase for indexing & activity
- On-chain verification logic
- Public dashboards

---

## Repository Structure

- anchor/ → Solana smart contracts (timelock program)
- src/app/api/ → API routes (create, locks, verification, etc)
- components/ → Frontend UI components
- idl/ → Anchor IDL
- lib/ → Client + utilities
- server/ → Supabase + backend logic


---

## Whitepaper

Full protocol design and vision:

- WHITEPAPER.md  
- FluxurWhitepaper.pdf  

---

## Status

Fluxur is live on mainnet and under active development.

Current phase:
- Website live  
- Launchpad + locks live  
- Expanding ecosystem  

---

## Links

Website: https://fluxur.fun  
Twitter (X): https://x.com/FluxurFun  

---

## Philosophy

Commitment should be provable, not promised.

Fluxur exists to set the standard for transparent, on-chain accountability in crypto.
