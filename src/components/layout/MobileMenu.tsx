import { useCallback, useEffect, useRef, useState } from 'react';
import { site, withBase, type NavEntry } from '@/config/site';

interface MobileMenuProps {
  entries: readonly NavEntry[];
  pathname: string;
}

/**
 * The one genuinely stateful piece of the shell, so the one React island.
 *
 * Renders the MENU trigger from Figma "Mobile Navigation" (33:106) plus a
 * full-screen overlay listing every destination. The overlay has no Figma
 * frame; it follows the same language — canvas ground, 1px rules, mono
 * labels — and transitions inside the 150–220ms envelope.
 */
export default function MobileMenu({ entries, pathname }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  const isActive = (href: string) => {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (href === '/') return path === '/';
    return path === href || path.startsWith(`${href}/`);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="type-nav cursor-pointer border-0 bg-transparent p-1 text-muted transition-colors duration-[var(--duration-base)] ease-[var(--ease-technical)] hover:text-ink"
      >
        {open ? 'CLOSE' : 'MENU'}
      </button>

      <div
        id="mobile-menu"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        hidden={!open}
        className="fixed inset-0 z-50 flex flex-col bg-canvas transition-opacity duration-[var(--duration-base)] ease-[var(--ease-technical)]"
      >
        <div
          className="flex items-center justify-between border-b border-line px-2"
          style={{ minHeight: 'var(--shell-mobile-header)' }}
        >
          <span className="type-brand-sm">{site.name}</span>
          <button
            type="button"
            onClick={close}
            className="type-nav cursor-pointer border-0 bg-transparent p-1 text-muted transition-colors duration-[var(--duration-base)] ease-[var(--ease-technical)] hover:text-ink"
          >
            CLOSE
          </button>
        </div>

        <nav aria-label="Main" className="flex flex-col">
          {entries.map((entry) => {
            const active = isActive(entry.href);
            return (
              <a
                key={entry.href}
                href={withBase(entry.href)}
                aria-current={active ? 'page' : undefined}
                className="flex items-baseline gap-2 border-b border-line px-2 py-3 transition-colors duration-[var(--duration-base)] ease-[var(--ease-technical)] hover:bg-panel"
              >
                <span className={`type-meta ${active ? 'text-signal' : ''}`}>
                  {entry.index}
                </span>
                <span
                  className={`font-display text-title font-medium ${
                    active ? 'text-signal' : 'text-ink'
                  }`}
                >
                  {entry.label}
                </span>
              </a>
            );
          })}
        </nav>
      </div>
    </>
  );
}
