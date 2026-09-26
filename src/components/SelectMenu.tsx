import { useId, useRef } from 'react';

type Option = { value: string; label: string };

export function SelectMenu({ options, value, onChange, ariaLabel }: { options: Option[]; value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find(option => option.value === value) ?? options[0];

  const positionMenu = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)}px`;
    menu.style.top = `${rect.bottom + 6}px`;
  };

  const select = (next: string) => {
    onChange(next);
    menuRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <div className="participant-picker select-menu">
      <button ref={triggerRef} className="participant-picker-trigger" type="button" popoverTarget={id} onClick={positionMenu} aria-label={`${ariaLabel}: ${current.label}`}>
        <span>{current.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <div ref={menuRef} className="participant-picker-menu" id={id} popover="auto" role="menu" aria-label={ariaLabel}>
        {options.map(option => (
          <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === value} onClick={() => select(option.value)}>
            <span>{option.label}</span>
            {option.value === value && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
          </button>
        ))}
      </div>
    </div>
  );
}
