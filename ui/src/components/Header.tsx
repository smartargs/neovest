import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrandMark } from './BrandMark';
import { IconChevronDown, IconSun, IconMoon, IconGitHub } from './icons';
import { useConnection, type WalletKind } from '@/lib/connection';
import { isNeoLineAvailable } from '@/lib/wallet/neoline-adapter';

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

  function go(route: 'dashboard' | 'manage') {
    if (!contractHash) {
      navigate('/');
      return;
    }
    navigate(route === 'dashboard' ? `/v/${contractHash}` : `/v/${contractHash}/manage`);
  }

  return (
    <header className="header">
      <Link to="/" className="header-brand">
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
        <a className="icon-btn" aria-label="GitHub" href="https://github.com/smartargs/neovest" target="_blank" rel="noreferrer">
          <IconGitHub size={16} />
        </a>
        {onManage && <WalletControl />}
      </div>
    </header>
  );
}

const MENU_STYLE: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 6px)',
  minWidth: 240,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-md)',
  padding: 6,
  zIndex: 60,
};

function WalletControl() {
  const { state, connect, disconnect, walletConnectAvailable } = useConnection();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  async function pick(kind: WalletKind) {
    setError(null);
    try {
      await connect(kind);
      setPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (state.status === 'connecting') {
    return <button className="btn btn-secondary btn-sm" disabled>Connecting…</button>;
  }
  if (state.status === 'connected') {
    const walletLabel = state.kind === 'neoline' ? 'NeoLine' : 'WalletConnect';
    return (
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          className="wallet-btn"
          onClick={() => setPickerOpen((o) => !o)}
          title="Account"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
        >
          <span className="blockie" />
          <span className="addr">{state.address.slice(0, 6)}…{state.address.slice(-4)}</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
            {state.kind === 'neoline' ? 'NeoLine' : 'WC'}
          </span>
          <IconChevronDown />
        </button>
        {pickerOpen && (
          <div style={MENU_STYLE} role="menu">
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Connected · {walletLabel}</div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                  marginTop: 2,
                }}
              >
                {state.address}
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
            <MenuAction
              label="Copy address"
              onClick={() => {
                void navigator.clipboard?.writeText(state.address);
                setPickerOpen(false);
              }}
            />
            <MenuAction
              label="Disconnect"
              danger
              onClick={() => {
                setPickerOpen(false);
                void disconnect();
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // not_connected — show picker.
  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button className="btn btn-primary btn-sm" onClick={() => setPickerOpen((o) => !o)}>
        Connect <IconChevronDown size={12} />
      </button>
      {pickerOpen && (
        <div style={MENU_STYLE}>
          <PickerOption
            label="NeoLine Extension"
            sub={isNeoLineAvailable() ? 'Detected' : 'Install required'}
            onClick={() => void pick('neoline')}
          />
          <PickerOption
            label="WalletConnect"
            sub={
              walletConnectAvailable
                ? 'Neon, OneGate, mobile'
                : 'Disabled — set VITE_WC_PROJECT_ID'
            }
            disabled={!walletConnectAvailable}
            onClick={() => void pick('walletconnect')}
          />
          {error && (
            <div
              style={{
                marginTop: 4,
                padding: '6px 10px',
                fontSize: 11.5,
                color: 'var(--danger)',
                background: 'var(--danger-muted)',
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuAction({
  label, onClick, danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 0,
        padding: '8px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--danger-muted)' : 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

function PickerOption({
  label, sub, onClick, disabled,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 0,
        padding: '8px 10px',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        color: 'var(--text-primary)',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
    </button>
  );
}
