/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WC_PROJECT_ID?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_NETWORK?: 'mainnet' | 'testnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
