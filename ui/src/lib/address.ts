import { wallet } from '@cityofzion/neon-js';

export function toNeoAddress(hashOrAddr: string | undefined): string {
  const v = (hashOrAddr ?? '').trim();
  if (/^N[A-Za-z0-9]{33}$/.test(v)) return v;
  const hex = v.startsWith('0x') ? v.slice(2) : v;
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) return v;
  try {
    return wallet.getAddressFromScriptHash(hex);
  } catch {
    return v;
  }
}
