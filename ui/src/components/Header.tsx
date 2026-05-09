import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { IconCopy, IconChevronDown, IconSun, IconMoon, IconGitHub } from './icons';
import { CONTRACT, SHORT, NETWORK, ME } from '@/lib/data';

interface HeaderProps {
  contractHash?: string;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export function Header({ contractHash, theme, toggleTheme }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const hash = contractHash ?? CONTRACT;
  const short = hash === CONTRACT ? SHORT : hash.slice(0, 6) + '...' + hash.slice(-4);

  const onDashboard = location.pathname.endsWith('/manage') === false && location.pathname.includes('/v/');
  const onManage = location.pathname.endsWith('/manage');
  const showWallet = onManage;

  function go(route: 'dashboard' | 'manage') {
    if (!contractHash) {
      navigate('/');
      return;
    }
    navigate(route === 'dashboard' ? `/v/${contractHash}` : `/v/${contractHash}/manage`);
  }

  return (
    <header className="header">
      <Link to={contractHash ? `/v/${contractHash}` : '/'} className="header-brand">
        <span className="mark"><BrandMark /></span>
        <span>NeoVest</span>
      </Link>

      <div className="header-contract">
        <div className="header-contract-pill" title={hash}>
          <span style={{ color: 'var(--text-quaternary)', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            vault
          </span>
          <span style={{ color: 'var(--text-primary)' }}>{short}</span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label="Copy contract">
            <IconCopy />
          </button>
          <span className="net-badge"><span className="dot" />{NETWORK}</span>
        </div>
      </div>

      <div className="header-right">
        {contractHash && (
          <div className="header-nav">
            <button className={onDashboard ? 'active' : ''} onClick={() => go('dashboard')}>Dashboard</button>
            <button className={onManage ? 'active' : ''} onClick={() => go('manage')}>Manage</button>
          </div>
        )}
        <button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <a className="icon-btn" aria-label="GitHub" href="https://github.com" target="_blank" rel="noreferrer">
          <IconGitHub size={16} />
        </a>
        {showWallet && (
          <button className="wallet-btn">
            <span className="blockie" />
            <span className="addr">{ME}</span>
            <IconChevronDown />
          </button>
        )}
      </div>
    </header>
  );
}
