export function Footer() {
  return (
    <footer className="footer">
      <span>Open source</span>
      <span className="sep">·</span>
      <span>MIT</span>
      <span className="sep">·</span>
      <span>Self-deployed</span>
      <span className="sep">·</span>
      <span>No warranty</span>
      <span className="sep">·</span>
      <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
      <span className="sep">·</span>
      <a href="#" onClick={(e) => e.preventDefault()}>Verify source</a>
      <span style={{ flex: 1 }} />
      <span className="tz-tag">UTC</span>
    </footer>
  );
}
