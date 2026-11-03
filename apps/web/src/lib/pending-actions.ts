const actionKinds = ["draft", "pack", "booking", "status"] as const;
type ActionKind = (typeof actionKinds)[number];

export function pendingActionKey(
  kind: ActionKind,
  base: string,
  id: string,
): string {
  return `pd-${kind}-pending:${base}:${id}`;
}

function storedAction(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function hasPendingAction(key: string): boolean {
  return Boolean(storedAction(key));
}

export function readPendingAction<T>(key: string): T | null {
  try {
    return JSON.parse(storedAction(key) || "null") as T | null;
  } catch {
    return null;
  }
}

export function writePendingAction<T>(key: string, value: T | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked; the caller still retains its recovery state.
  }
}

export function clearPendingActions(base: string): void {
  if (typeof window === "undefined") return;
  try {
    const prefixes = actionKinds.map((kind) =>
      pendingActionKey(kind, base, ""),
    );
    const storage = window.sessionStorage;
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    );
    keys.forEach((key) => {
      if (key && prefixes.some((prefix) => key.startsWith(prefix)))
        storage.removeItem(key);
    });
  } catch {
    // A denied storage area has no markers available for this reset to clear.
  }
}
