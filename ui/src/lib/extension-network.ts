import { useEffect, useState } from 'react';
import { readNeoLineNetwork } from './wallet/neoline-adapter';
import { walletNetworkFromNeoLine, type WalletNetwork } from './wallet-network';

export interface ExtensionNetwork {
  walletNetwork: WalletNetwork;
  label: string;
}

type NetworkChangedDetail = { chainId?: number; defaultNetwork?: string } | undefined;

export function useNeoLineExtensionNetwork(): ExtensionNetwork | null {
  const [network, setNetwork] = useState<ExtensionNetwork | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const info = await readNeoLineNetwork();
      if (cancelled) return;
      setNetwork(info ? { walletNetwork: walletNetworkFromNeoLine(info.chainId, info.label), label: info.label } : null);
    }

    function onReady() {
      void refresh();
    }

    function onChanged(e: Event) {
      const detail = (e as CustomEvent<NetworkChangedDetail>).detail;
      if (detail && (detail.chainId != null || detail.defaultNetwork)) {
        setNetwork({
          walletNetwork: walletNetworkFromNeoLine(detail.chainId, detail.defaultNetwork),
          label: detail.defaultNetwork ?? '',
        });
      } else {
        void refresh();
      }
    }

    void refresh();
    window.addEventListener('NEOLine.N3.EVENT.READY', onReady);
    window.addEventListener('NEOLine.N3.EVENT.NETWORK_CHANGED', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('NEOLine.N3.EVENT.READY', onReady);
      window.removeEventListener('NEOLine.N3.EVENT.NETWORK_CHANGED', onChanged);
    };
  }, []);

  return network;
}

export function isSigningPage(pathname: string): boolean {
  return pathname === '/deploy' || pathname.endsWith('/manage');
}

export function readOnlyPathFor(pathname: string): string {
  if (pathname.endsWith('/manage')) return pathname.slice(0, -'/manage'.length);
  return '/';
}
