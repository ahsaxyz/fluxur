export type CommitmentRecord = {
  mint: string;
  name: string;
  symbol: string;
  creatorPublicKey: string;
  metadataUri: string;
  createdAt: string;
  devBuyAmount: number;
};

const store = new Map<string, CommitmentRecord>();

export function setCommitment(rec: CommitmentRecord) {
  store.set(rec.mint, rec);
}

export function getCommitment(mint: string): CommitmentRecord | undefined {
  return store.get(mint);
}
