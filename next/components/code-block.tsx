"use client";

import { useRef, useState } from "react";

export function CodeBlock({ code, label = "Terminal" }: { code: string; label?: string }) {
  const [status, setStatus] = useState("Copy");
  const codeRef = useRef<HTMLElement>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setStatus("Copied"); }
    catch {
      const selection = window.getSelection();
      if (selection && codeRef.current) { const range = document.createRange(); range.selectNodeContents(codeRef.current); selection.removeAllRanges(); selection.addRange(range); }
      setStatus("Select & copy");
    }
  }
  return <div className="code-block">
    <div className="code-header"><span className="mono">{label}</span><button onClick={copy} aria-label={`Copy ${label} commands`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" /><path d="M16 8V3H3v13h5" stroke="currentColor" strokeWidth="1.5" /></svg><span aria-live="polite">{status}</span></button></div>
    <pre tabIndex={0} aria-label={`${label} code`}><code ref={codeRef}>{code}</code></pre>
  </div>;
}
