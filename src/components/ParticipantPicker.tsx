import { useId, useRef } from 'react';

type Props = {
  names: string[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  inactiveNames?: Set<string>;
  ariaLabel?: string;
  labelledBy?: string;
};

export function ParticipantPicker({
  names,
  value,
  onChange,
  includeAll = true,
  inactiveNames = new Set(),
  ariaLabel = 'Seleccionar participante',
  labelledBy,
}: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = names.filter(name => !inactiveNames.has(name));
  const inactive = names.filter(name => inactiveNames.has(name));
  const options = [...active, ...inactive];

  const positionMenu = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - width - 12)}px`;
    menu.style.top = `${rect.bottom + 6}px`;
  };

  const select = (name: string) => {
    onChange(name);
    menuRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <div className="participant-picker">
      <button
        ref={triggerRef}
        className="participant-picker-trigger"
        type="button"
        popoverTarget={id}
        onClick={positionMenu}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-labelledby={labelledBy}
        disabled={!includeAll && !names.length}
      >
        <span>{value || (includeAll ? 'Todos los participantes' : names[0] || 'Sin participantes disponibles')}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <div ref={menuRef} className="participant-picker-menu" id={id} popover="auto" role="menu" aria-label="Participante">
        {includeAll && (
          <button type="button" role="menuitemradio" aria-checked={!value} onClick={() => select('')}>
            <span>Todos los participantes</span>
            {!value && <CheckIcon />}
          </button>
        )}
        {options.map((name, index) => {
          const selected = value === name;
          const inactiveOption = inactiveNames.has(name);
          return (
            <button
              key={name}
              className={inactiveOption ? 'inactive' : ''}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => select(name)}
            >
              <span>
                {inactiveOption && index === active.length && <small>Históricos</small>}
                {name}
              </span>
              {inactiveOption && <em>Inactivo</em>}
              {selected && <CheckIcon />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}
