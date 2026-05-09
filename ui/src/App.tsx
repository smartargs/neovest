import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { NetworkBanner } from './components/NetworkBanner';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';

// Wallet-heavy pages are split into separate chunks. They import the
// dappkit / NEF artifacts / WalletConnect path, all of which the read-only
// dashboard doesn't need.
const Manage = lazy(() => import('./pages/Manage').then((m) => ({ default: m.Manage })));
const LockDetail = lazy(() => import('./pages/LockDetail').then((m) => ({ default: m.LockDetail })));
const Deploy = lazy(() => import('./pages/Deploy').then((m) => ({ default: m.Deploy })));

type Theme = 'dark' | 'light';

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('neovest-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('neovest-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return (
    <div className="app">
      <NetworkBanner />
      <Suspense fallback={<RouteSkeleton />}>
        <Routes>
          <Route path="/" element={<Shell theme={theme} toggleTheme={toggleTheme}><Landing /></Shell>} />
          <Route path="/deploy" element={<Shell theme={theme} toggleTheme={toggleTheme}><Deploy /></Shell>} />
          <Route path="/v/:contractHash" element={<VaultShell theme={theme} toggleTheme={toggleTheme}><Dashboard /></VaultShell>} />
          <Route path="/v/:contractHash/manage" element={<VaultShell theme={theme} toggleTheme={toggleTheme}><Manage /></VaultShell>} />
          <Route path="/v/:contractHash/lock/:lockId" element={<VaultShell theme={theme} toggleTheme={toggleTheme}><LockDetail /></VaultShell>} />
        </Routes>
      </Suspense>
    </div>
  );
}

interface ShellProps {
  theme: Theme;
  toggleTheme: () => void;
  children: React.ReactNode;
}

function Shell({ theme, toggleTheme, children }: ShellProps) {
  return (
    <>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <main className="page">{children}</main>
      <Footer />
    </>
  );
}

function VaultShell({ theme, toggleTheme, children }: ShellProps) {
  const { contractHash } = useParams();
  return (
    <>
      <Header contractHash={contractHash} theme={theme} toggleTheme={toggleTheme} />
      <main className="page">{children}</main>
      <Footer />
    </>
  );
}

/** Minimal placeholder shown while a lazy-loaded route's chunk is fetched. */
function RouteSkeleton() {
  return (
    <main className="page" style={{ minHeight: '40vh' }}>
      <div
        style={{
          height: 240,
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          animation: 'pulse 1.6s ease-in-out infinite',
        }}
      />
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
    </main>
  );
}

export default App;
