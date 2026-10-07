export function Arrow({ down = false }: { down?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="arrow"><path d={down ? "M12 4v16m-6-6 6 6 6-6" : "M5 19 19 5M5 5h14v14"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Mark({ className = "" }: { className?: string }) {
  return <svg className={className} width="38" height="38" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M14 8v48M50 8v48" stroke="currentColor" strokeLinecap="round" strokeWidth="6" /><path d="M7 34h17l6-14 8 27 6-13h13" stroke="var(--accent, #e96a36)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5.5" /></svg>;
}
