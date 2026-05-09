import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { IconChevronDown, IconSun, IconMoon, IconGitHub } from './icons';
import { ME } from '@/lib/data';

interface HeaderProps {
  contractHash?: string;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export function Header({ contractHash, theme, toggleTheme }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const onDashboard = !location.pathname.endsWith('/manage') && location.pathname.includes('/v/');
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

      <div className="header-right" style={{ marginLeft: 'auto' }}>
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
