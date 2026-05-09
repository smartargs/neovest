import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KNOWN_DEPLOYMENTS } from '@/lib/known-deployments';
import { CONTRACT } from '@/lib/data';
import { IconChevronRight } from '@/components/icons';

export function Landing() {
  const [hash, setHash] = useState('');
  const navigate = useNavigate();

  function open(e: React.FormEvent) {
    e.preventDefault();
    const v = hash.trim() || CONTRACT;
    navigate(`/v/${v}`);
  }

  return (
    <div data-screen-label="Landing">
      <div style={{ maxWidth: 640, margin: '64px auto 0' }}>
        <h1 className="page-title" style={{ fontSize: 32 }}>Inspect a vesting vault</h1>
        <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
          Paste a NeoVest contract hash to see who got what, vesting on what timeline, claimed how much.
        </p>

        <form onSubmit={open} style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <input
            className="input mono"
            placeholder="0x…"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            style={{ height: 40, fontSize: 14 }}
          />
          <button className="btn btn-primary btn-lg" type="submit">
            Open <IconChevronRight size={14} />
          </button>
        </form>

        <div style={{ marginTop: 40 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            Known deployments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {KNOWN_DEPLOYMENTS.map((d) => (
              <Link
                key={d.hash}
                to={`/v/${d.hash}`}
                className="card card-pad-sm"
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{d.name}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.hash}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{d.description}</div>
                </div>
                <span className="badge">{d.network}</span>
                <IconChevronRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
