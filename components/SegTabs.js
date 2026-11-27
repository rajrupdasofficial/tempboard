'use client';

// Accessible segmented tabs with a sliding indicator. variant="dock" is the bottom bar on phones.
export default function SegTabs({ value, onChange, options, variant = 'inline', label }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const move = (d) => onChange(options[(idx + d + options.length) % options.length].id);
  return (
    <div
      className={`seg ${variant}`}
      role="tablist"
      aria-label={label}
      style={{ '--n': options.length, '--i': idx }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      }}
    >
      <span className="seg-ind" />
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} tabIndex={o.id === value ? 0 : -1} onClick={() => onChange(o.id)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
