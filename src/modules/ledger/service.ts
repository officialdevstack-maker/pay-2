export type WalletProduct = 'pay' | 'wallet';
export type SystemAccountCode = 'provider_clearing' | 'fees' | 'suspense' | 'settlement';
export interface WalletAccount {
  walletId: string;
  accountId: string;
}
export interface PostResult {
  transactionId: string;
  reference: string;
  replayed: boolean;
}

export async function createWallet(input: {
  ownerUserId: string;
  product: WalletProduct;
  currency: string;
}): Promise<WalletAccount> {
  return { walletId: input.ownerUserId, accountId: input.ownerUserId };
}

export async function ensureSystemAccounts(currency: string): Promise<Record<SystemAccountCode, string>> {
  return {
    provider_clearing: currency,
    fees: currency,
    suspense: currency,
    settlement: currency,
  } as Record<SystemAccountCode, string>;
}

export function post(): Promise<PostResult> {
  return Promise.resolve({ transactionId: '', reference: '', replayed: false });
}

export function reverseTransaction(): Promise<PostResult> {
  return Promise.resolve({ transactionId: '', reference: '', replayed: false });
}

