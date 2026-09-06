let enabled = false;
const listeners = new Set<(enabled: boolean) => void>();

export const investigationMode = {
  get: () => enabled,
  set(value: boolean): void {
    if (enabled === value) return;
    enabled = value;
    for (const listener of listeners) listener(enabled);
  },
  toggle(): void { investigationMode.set(!enabled); },
  subscribe(listener: (enabled: boolean) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export type InvestigationMode = Pick<typeof investigationMode, "get" | "subscribe">;
