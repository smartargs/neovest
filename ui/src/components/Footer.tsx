export function Footer() {
  return (
    <footer className="footer">
      <span>NeoVest — open-source token vesting for Neo N3</span>
      <span className="sep">·</span>
      <span>MIT</span>
      <span className="sep">·</span>
      <span>No warranty</span>
      <span className="sep">·</span>
      <a href="https://github.com/smartargs/neovest" target="_blank" rel="noreferrer">
        GitHub
      </a>
      <span className="sep">·</span>
      <a
        href="https://github.com/smartargs/neovest/blob/main/docs/VERIFY.md"
        target="_blank"
        rel="noreferrer"
      >
        Verify source
      </a>
      <span style={{ flex: 1 }} />
      <span>
        Made by{' '}
        <a href="https://smartargs.com" target="_blank" rel="noreferrer">
          smartargs
        </a>
      </span>
    </footer>
  );
}
