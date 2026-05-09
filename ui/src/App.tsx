import { useEffect, useState } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Manage } from './pages/Manage';
import { LockDetail } from './pages/LockDetail';

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
      <Routes>
        <Route path="/" element={<Shell theme={theme} toggleTheme={toggleTheme}><Landing /></Shell>} />
        <Route path="/v/:contractHash" element={<VaultShell theme={theme} toggleTheme={toggleTheme}><Dashboard /></VaultShell>} />
        <Route path="/v/:contractHash/manage" element={<VaultShell theme={theme} toggleTheme={toggleTheme}><Manage /></VaultShell>} />
        <Route path="/v/:contractHash/lock/:lockId" element={<VaultShell theme={theme} toggleTheme={toggleTheme}><LockDetail /></VaultShell>} />
      </Routes>
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

export default App;
