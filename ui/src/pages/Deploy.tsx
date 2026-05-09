import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useConnection } from '@/lib/connection';
import { defaultNetwork, type Network } from '@/lib/rpc';
import {
  deployVault,
  extractDeployedContractHash,
  fmtGas,
  getBundledManifestName,
  getBundledNefSize,
  isArtifactsAvailable,
  predictContractHash,
  predictDeployFee,
  type DeployFee,
} from '@/lib/deploy';
import { waitForTx } from '@/lib/transactions';
import { EXPECTED_NEF_CHECKSUM } from '@/lib/nef-checksum';
import { fmtNum } from '@/lib/format';
import { IconAlert, IconCheck, IconCopy, IconChevronRight, IconLock } from '@/components/icons';

type Stage = 'configure' | 'review' | 'deploying' | 'success' | 'error';

const STEPS: { key: Stage; label: string }[] = [
  { key: 'configure', label: 'Configure' },
  { key: 'review',    label: 'Review' },
  { key: 'deploying', label: 'Deploy' },
  { key: 'success',   label: 'Done' },
];

export function Deploy() {
  const conn = useConnection();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [stage, setStage] = useState<Stage>('configure');
  // Pre-fill owner from `?owner=...` query param, or fall back to the connected
  // wallet address. Empty until a wallet is connected.
  const [ownerInput, setOwnerInput] = useState<string>(params.get('owner') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ txHash: string; contractHash: string } | null>(null);

  // Auto-fill owner with the connected wallet address — once. After that the
  // field is fully user-controlled (clearing it must not re-fill it).
  const autoFilled = useRef(false);
  useEffect(() => {
    if (autoFilled.current) return;
    if (ownerInput) {
      // Already populated (e.g. via `?owner=` query param) — count as filled.
      autoFilled.current = true;
      return;
    }
    if (conn.isConnected && conn.address) {
      setOwnerInput(conn.address);
      autoFilled.current = true;
    }
  }, [conn.isConnected, conn.address, ownerInput]);

  const artifactsOk = isArtifactsAvailable();
  const nefSize = useMemo(() => getBundledNefSize(), []);
  const manifestName = useMemo(() => getBundledManifestName(), []);

  // Predicted contract hash (only meaningful once we know the deployer).
  const predictedHash = useMemo(() => {
    if (!conn.address || !manifestName) return null;
    try {
      const senderHash = addrToScriptHash(conn.address);
      return predictContractHash(senderHash, EXPECTED_NEF_CHECKSUM, manifestName);
    } catch {
      return null;
    }
  }, [conn.address, manifestName]);

  const ownerValid = isValidNeoAddressOrHash(ownerInput);
  const network = defaultNetwork();

  async function handleDeploy() {
    setError(null);
    if (!conn.provider || !conn.address) {
      setError('Connect a wallet first.');
      return;
    }
    if (!ownerValid) {
      setError('Owner must be a valid Neo3 address or 0x-scripthash.');
      return;
    }
    setStage('deploying');
    try {
      const r = await deployVault(conn.provider, {
        deployerAddress: conn.address,
        ownerAddress: ownerInput.trim(),
      });
      setResult(r);
      // Tx submitted; wait for inclusion before claiming success.
      const log = await waitForTx(r.txHash);
      // Replace the locally predicted hash with the real one from the Deploy
      // notification — our prediction drifts from neo-cli's calcContractHash
      // for some integer encodings.
      const realHash = extractDeployedContractHash(log);
      if (realHash) {
        setResult({ txHash: r.txHash, contractHash: realHash });
      }
      setStage('success');
    } catch (e) {
      setError(extractMsg(e));
      setStage('error');
    }
  }

  // ---- Render ----

  return (
    <div data-screen-label="Deploy">
      <div className="page-header">
        <div>
          <h1 className="page-title">Deploy a new vault</h1>
          <div className="page-subtitle">
            Sign a single transaction to spin up your own immutable VestingVault on Neo N3.
          </div>
        </div>
      </div>

      <StageStepper stage={stage} />

      <div className="card card-pad" style={{ marginTop: 24 }}>
        {!artifactsOk && <ArtifactsMissing />}
        {artifactsOk && stage === 'configure' && (
          <ConfigureStage
            conn={conn}
            ownerInput={ownerInput}
            setOwnerInput={setOwnerInput}
            ownerValid={ownerValid}
            onNext={() => setStage('review')}
          />
        )}
        {artifactsOk && stage === 'review' && (
          <ReviewStage
            ownerInput={ownerInput}
            deployerAddress={conn.address ?? ''}
            predictedHash={predictedHash}
            nefSize={nefSize}
            manifestName={manifestName}
            network={network}
            onBack={() => setStage('configure')}
            onConfirm={handleDeploy}
          />
        )}
        {/* Render is in ReviewStage; props passed below are unused here. */}
        {stage === 'deploying' && <DeployingStage txHash={result?.txHash} />}
        {stage === 'success' && result && (
          <SuccessStage
            contractHash={result.contractHash}
            onOpenDashboard={() => navigate(`/v/${result.contractHash}`)}
          />
        )}
        {stage === 'error' && (
          <ErrorStage
            message={error ?? 'Unknown error'}
            onRetry={() => setStage('configure')}
          />
        )}
      </div>

      {error && stage === 'configure' && (
        <div
          style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--danger-muted)', color: 'var(--danger)',
            borderRadius: 6, fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ---------- Stage components ----------

function StageStepper({ stage }: { stage: Stage }) {
  const idx = STEPS.findIndex((s) => s.key === stage);
  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center', marginTop: 8 }}>
      {STEPS.map((s, i) => {
        const active = i <= idx && stage !== 'error';
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: active ? '#06231D' : 'var(--text-tertiary)',
                fontSize: 11, fontWeight: 600,
                display: 'grid', placeItems: 'center',
              }}
            >
              {i + 1}
            </div>
            <span style={{ fontSize: 12.5, color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 32, height: 1, margin: '0 12px',
                  background: i < idx ? 'var(--accent)' : 'var(--border-default)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ConfigureProps {
  conn: ReturnType<typeof useConnection>;
  ownerInput: string;
  setOwnerInput: (v: string) => void;
  ownerValid: boolean;
  onNext: () => void;
}

function ConfigureStage({ conn, ownerInput, setOwnerInput, ownerValid, onNext }: ConfigureProps) {
  if (!conn.isConnected) {
    return (
      <div>
        <div className="card-title" style={{ marginBottom: 12 }}>Connect a wallet</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 560 }}>
          Deployment is a signed Neo N3 transaction — connect a wallet first. The wallet pays the deploy
          GAS fee (~10 GAS for a contract this size).
        </div>
        <button className="btn btn-primary" onClick={() => void conn.connect('neoline')}>
          Connect NeoLine
        </button>{' '}
        <button
          className="btn btn-secondary"
          onClick={() => void conn.connect('walletconnect')}
          disabled={!conn.walletConnectAvailable}
          title={
            conn.walletConnectAvailable
              ? 'Open the WalletConnect modal'
              : 'Set VITE_WC_PROJECT_ID to enable WalletConnect'
          }
        >
          WalletConnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field">
        <label>Owner address</label>
        <input
          className="input mono"
          value={ownerInput}
          onChange={(e) => setOwnerInput(e.target.value)}
          placeholder="N… (Neo3 address) or 0x… (scripthash)"
          spellCheck={false}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 2 }}>
          <span style={{ color: ownerValid ? 'var(--success)' : 'var(--text-tertiary)' }}>
            {ownerValid ? '✓ Valid' : 'Will default to connected wallet if empty'}
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>
            The owner is the only address that can deposit. Cannot be changed after deploy.
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '10px 12px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>Tip:</strong> for a team-managed vault, set the
        owner to your Neo multi-sig. The vault's owner can deposit and revoke; everything else stays
        beneficiary-controlled.
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary btn-lg"
          disabled={!ownerInput || !ownerValid}
          onClick={onNext}
        >
          Review <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

interface ReviewProps {
  ownerInput: string;
  deployerAddress: string;
  predictedHash: string | null;
  nefSize: number;
  manifestName: string;
  network: Network;
  onBack: () => void;
  onConfirm: () => void;
}

function ReviewStage({
  ownerInput, deployerAddress, predictedHash, nefSize, manifestName, network, onBack, onConfirm,
}: ReviewProps) {
  const [fee, setFee] = useState<DeployFee | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);

  // Real fee estimate via RPC test-invoke. The RPC call can fail if the node
  // is offline or rate-limits us — show the actual error so it's debuggable.
  useEffect(() => {
    let cancelled = false;
    setFeeLoading(true);
    setFeeError(null);
    predictDeployFee({ deployerAddress, ownerAddress: ownerInput.trim() })
      .then((f) => {
        if (cancelled) return;
        setFee(f);
        setFeeLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setFeeError(msg);
        setFeeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deployerAddress, ownerInput]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card-title">Review</div>
      <dl className="dl">
        <dt>Network</dt><dd>{network}</dd>
        <dt>Deployer</dt><dd>{shortAddr(deployerAddress)}</dd>
        <dt>Owner</dt><dd>{shortAddr(ownerInput)}</dd>
        <dt>Contract</dt><dd>{manifestName}</dd>
        <dt>NEF size</dt><dd>{fmtNum(nefSize)} bytes</dd>
        <dt>NEF checksum</dt><dd>0x{EXPECTED_NEF_CHECKSUM.toString(16)}</dd>
        <dt>Predicted hash</dt>
        <dd style={{ color: 'var(--accent)' }}>
          {predictedHash ?? '—'}
        </dd>
        <dt>Estimated cost</dt>
        <dd>
          {feeLoading ? (
            <span style={{ color: 'var(--text-tertiary)' }}>Calculating…</span>
          ) : fee ? (
            <span title={`System ${fmtGas(fee.systemFee)} + network ${fmtGas(fee.networkFee)}`}>
              {fmtGas(fee.total)}
            </span>
          ) : (
            <span style={{ color: 'var(--danger)' }} title={feeError ?? ''}>
              fee estimate unavailable
            </span>
          )}
        </dd>
      </dl>
      {feeError && (() => {
        // If the chain is telling us the contract already exists, that's
        // actually a successful prior deploy — surface the existing hash and
        // point at its dashboard instead of showing a generic error.
        const existing = feeError.match(/Contract Already Exists:\s*(0x[0-9a-fA-F]{40})/);
        if (existing) {
          return (
            <div style={{ padding: '8px 12px', background: 'var(--info-muted)', color: 'var(--text-primary)', borderRadius: 6, fontSize: 12.5 }}>
              A vault with these exact parameters is already deployed at{' '}
              <Link to={`/v/${existing[1]}`} className="mono" style={{ color: 'var(--accent)' }}>{existing[1]}</Link>.
              <br />
              To deploy a fresh one, use a different deployer account or reset the chain.
            </div>
          );
        }
        return (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--danger-muted)',
              color: 'var(--danger)',
              borderRadius: 6,
              fontSize: 12,
              wordBreak: 'break-word',
            }}
          >
            <strong>Fee preview failed:</strong> {feeError}
          </div>
        );
      })()}

      <div
        style={{
          padding: '10px 12px',
          background: 'var(--warning-muted)',
          color: 'var(--text-primary)',
          borderRadius: 6,
          fontSize: 12.5,
        }}
      >
        <strong style={{ color: 'var(--warning)' }}>Once deployed, this contract is immutable.</strong>{' '}
        No update path. The owner can deposit and revoke; nothing else can be changed. If you lose the
        owner key, no new locks can be created — but every existing lock keeps working for its
        beneficiary.
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary btn-lg" onClick={onConfirm}>
          <IconLock size={14} /> Sign &amp; deploy
        </button>
      </div>
    </div>
  );
}

function DeployingStage({ txHash }: { txHash?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div className="card-title" style={{ fontSize: 16 }}>Deploying…</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
        {txHash ? 'Waiting for the transaction to be mined.' : 'Confirm in your wallet.'}
      </div>
      {txHash && (
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12 }}>
          tx {shortHash(txHash)}
        </div>
      )}
    </div>
  );
}

interface SuccessProps {
  contractHash: string;
  onOpenDashboard: () => void;
}

function SuccessStage({ contractHash, onOpenDashboard }: SuccessProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center', padding: '12px 0' }}>
      <div style={{ fontSize: 28, color: 'var(--success)' }}>
        <IconCheck size={32} />
      </div>
      <div className="card-title" style={{ fontSize: 16 }}>Deployed</div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
        {contractHash}{' '}
        <button
          className="icon-btn"
          style={{ width: 22, height: 22, verticalAlign: 'middle' }}
          aria-label="Copy contract hash"
          onClick={() => navigator.clipboard?.writeText(contractHash)}
        >
          <IconCopy size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        <button className="btn btn-primary btn-lg" onClick={onOpenDashboard}>
          Open dashboard <IconChevronRight size={14} />
        </button>
        <Link to={`/v/${contractHash}/manage`} className="btn btn-secondary btn-lg">
          Create first lock
        </Link>
      </div>
    </div>
  );
}

function ErrorStage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center', padding: '12px 0' }}>
      <div style={{ fontSize: 28, color: 'var(--danger)' }}>
        <IconAlert size={28} />
      </div>
      <div className="card-title" style={{ fontSize: 16, color: 'var(--danger)' }}>Deploy failed</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto' }}>
        {message}
      </div>
      <div>
        <button className="btn btn-secondary" onClick={onRetry}>← Try again</button>
      </div>
    </div>
  );
}

function ArtifactsMissing() {
  return (
    <div style={{ padding: 8 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>Artifacts not bundled</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        This UI build was created without the compiled NEF + manifest. Run{' '}
        <code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 4 }}>
          ./gradlew :contract:neow3jCompile
        </code>{' '}
        and rebuild the UI to enable in-browser deployment.
      </div>
    </div>
  );
}

// ---------- helpers ----------

function isValidNeoAddressOrHash(s: string): boolean {
  const t = s.trim();
  if (t.startsWith('0x') && t.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(t)) return true;
  // Neo3 addresses start with N and are 34 chars in base58.
  if (/^N[A-Za-z0-9]{33}$/.test(t)) return true;
  return false;
}

function addrToScriptHash(addrOrHash: string): string {
  const t = addrOrHash.trim();
  if (t.startsWith('0x')) return t.toLowerCase();
  // Lazy import — avoids pulling neon-js into the page chunk before it's needed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { wallet } = require('@cityofzion/neon-js');
  return '0x' + wallet.getScriptHashFromAddress(t);
}

function shortAddr(s: string): string {
  if (!s) return '';
  if (s.length <= 14) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}

function shortHash(s: string): string {
  if (!s) return '';
  return s.slice(0, 10) + '…' + s.slice(-6);
}

function extractMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const anyE = e as { description?: string; message?: string };
    return anyE.description ?? anyE.message ?? JSON.stringify(e);
  }
  return String(e);
}
