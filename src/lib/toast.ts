// ============================================================
// lib/toast.ts — a 20-line pub/sub so any module can raise a toast
// without threading a callback through the tree.
// ============================================================

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function toast(message: string): void {
  for (const l of listeners) l(message);
}

export function subscribeToast(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
