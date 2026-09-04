import { useEffect, useState } from 'react';
import { UI } from '../config';
import { subscribeToast } from '../lib/toast';

/** Single-slot toast. Confirmations only — the spec allows state-change
 *  messages that show what changed, nothing else animates. */
export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToast((m) => {
      setMessage(m);
      const t = window.setTimeout(() => setMessage(null), UI.TOAST_DURATION_MS);
      return () => window.clearTimeout(t);
    });
  }, []);

  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
