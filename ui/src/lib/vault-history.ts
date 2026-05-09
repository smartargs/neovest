/**
 * localStorage-backed list of vaults the current browser has opened. Used by
 * the landing page's "Your vaults" section so users can return to vaults
 * they've previously visited without re-pasting the contract hash.
 *
 * This is intentionally NOT a discovery index — Neo3 has no on-chain way to
 * enumerate every NeoVest deployment, so until a registry contract or
 * off-chain indexer exists, this is the best we can offer.
 */

const KEY = 'neovest.vault-history';
const MAX_ENTRIES = 20;

export interface VaultHistoryEntry {
  hash: string;
  visitedAt: number; // unix ms
}

export function getHistory(): VaultHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VaultHistoryEntry[];
    return Array.isArray(parsed)
      ? parsed.filter((e) => typeof e?.hash === 'string')
      : [];
  } catch {
    return [];
  }
}

export function addToHistory(hash: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = hash.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  const next = [
    { hash: trimmed, visitedAt: Date.now() },
    ...getHistory().filter((e) => e.hash.toLowerCase() !== lower),
  ].slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function removeFromHistory(hash: string): void {
  if (typeof localStorage === 'undefined') return;
  const lower = hash.toLowerCase();
  const next = getHistory().filter((e) => e.hash.toLowerCase() !== lower);
  localStorage.setItem(KEY, JSON.stringify(next));
}
