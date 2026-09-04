import { useEffect, useRef } from 'react';

type ModalProps = {
  title: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
  onClose?: () => void;
};

/** Focus-trapped modal. Used by the Thor failure dialog and discard confirm. */
export function Modal({ title, children, actions, onClose }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {children != null && <div>{children}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {actions}
        </div>
      </div>
    </div>
  );
}
