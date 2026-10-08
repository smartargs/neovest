import { describe, it, expect } from 'vitest';
import { isSigningPage, readOnlyPathFor } from './extension-network';
import {
  walletMatchesApp,
  walletNetworkFromCaip,
  walletNetworkFromNeoLine,
} from './wallet-network';

describe('walletNetworkFromNeoLine', () => {
  it('trusts the chain id first', () => {
    expect(walletNetworkFromNeoLine(3, 'anything')).toBe('mainnet');
    expect(walletNetworkFromNeoLine(6, 'MainNet')).toBe('testnet');
    expect(walletNetworkFromNeoLine(1234567890, 'localnet')).toBe('private');
  });

  it('falls back to the network label when no chain id is reported', () => {
    expect(walletNetworkFromNeoLine(undefined, 'MainNet')).toBe('mainnet');
    expect(walletNetworkFromNeoLine(undefined, 'N3TestNet')).toBe('testnet');
    expect(walletNetworkFromNeoLine(undefined, 'TestNet')).toBe('testnet');
    expect(walletNetworkFromNeoLine(undefined, 'my-privnet')).toBe('private');
    expect(walletNetworkFromNeoLine(undefined, '')).toBe('unknown');
  });
});

describe('walletNetworkFromCaip', () => {
  it('reads the chain reference out of a CAIP address', () => {
    expect(walletNetworkFromCaip('neo3:mainnet:NgKjbKVTfeEWNtPj8YT8nrXrTfXkGjAANQ')).toBe('mainnet');
    expect(walletNetworkFromCaip('neo3:testnet:NgKjbKVTfeEWNtPj8YT8nrXrTfXkGjAANQ')).toBe('testnet');
    expect(walletNetworkFromCaip('neo3:privnet:N...')).toBe('private');
    expect(walletNetworkFromCaip(undefined)).toBe('unknown');
  });
});

describe('walletMatchesApp', () => {
  it('requires an exact match on public networks', () => {
    expect(walletMatchesApp('mainnet', 'mainnet')).toBe(true);
    expect(walletMatchesApp('testnet', 'mainnet')).toBe(false);
    expect(walletMatchesApp('private', 'mainnet')).toBe(false);
    expect(walletMatchesApp('unknown', 'mainnet')).toBe(false);
    expect(walletMatchesApp('testnet', 'testnet')).toBe(true);
  });

  it('accepts any private chain for a localnet build and nothing else', () => {
    expect(walletMatchesApp('private', 'localnet')).toBe(true);
    expect(walletMatchesApp('mainnet', 'localnet')).toBe(false);
    expect(walletMatchesApp('unknown', 'localnet')).toBe(false);
  });
});

describe('signing-page routing helpers', () => {
  it('treats manage and deploy as pages that can sign', () => {
    expect(isSigningPage('/deploy')).toBe(true);
    expect(isSigningPage('/v/0xabc/manage')).toBe(true);
    expect(isSigningPage('/v/0xabc')).toBe(false);
    expect(isSigningPage('/')).toBe(false);
  });

  it('sends the user back to the read-only view of the same vault', () => {
    expect(readOnlyPathFor('/v/0xabc/manage')).toBe('/v/0xabc');
    expect(readOnlyPathFor('/deploy')).toBe('/');
  });
});
