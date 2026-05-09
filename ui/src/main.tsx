import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupAppKit } from './lib/appkit';
import { ConnectionProvider } from './lib/connection';
import App from './App';
import './styles.css';

// Boot AppKit before any component using its hooks renders.
setupAppKit();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Lock data is mostly immutable — claim is the only mutation, and it's
      // user-initiated. 30s gives a comfortable cache while staying fresh.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConnectionProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
