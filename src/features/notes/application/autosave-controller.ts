/**
 * Framework-free autosave controller (docs/UX_FLOW.md §5).
 *
 * Persists the latest value after a debounce, and guarantees an older write can never
 * become the final state: after every successful write it checks whether newer content
 * arrived and, if so, writes again. The controller knows nothing about React or SQLite.
 */

export type AutosaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export type Scheduler = {
  schedule(callback: () => void, delayMs: number): () => void;
};

export const timeoutScheduler: Scheduler = {
  schedule(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

export const AUTOSAVE_DEBOUNCE_MS = 800;

export type AutosaveController = {
  /** Call when the value changed; schedules a debounced save. */
  change(): void;
  /** Persists the latest value immediately. Resolves true when everything is saved. */
  flush(): Promise<boolean>;
  /** Cancels pending timers; an in-flight write is allowed to finish. */
  dispose(): void;
};

export function createAutosaveController<T>(deps: {
  read(): T;
  write(value: T): Promise<void>;
  equals(a: T, b: T): boolean;
  onStatus(status: AutosaveStatus): void;
  debounceMs?: number;
  scheduler?: Scheduler;
}): AutosaveController {
  const scheduler = deps.scheduler ?? timeoutScheduler;
  const debounceMs = deps.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;

  let persisted: T = deps.read();
  let cancelTimer: (() => void) | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const sameAsPersisted = (value: T): boolean => deps.equals(value, persisted);

  async function saveLoop(): Promise<boolean> {
    for (;;) {
      if (running) {
        try {
          await running;
        } catch {
          // A concurrent save failed; fall through and retry with the latest value.
        }
      }
      if (disposed) return false;

      const target = deps.read();
      if (sameAsPersisted(target)) {
        deps.onStatus('saved');
        return true;
      }

      deps.onStatus('saving');
      const write = deps.write(target);
      running = write;
      try {
        await write;
      } catch {
        running = null;
        deps.onStatus('error');
        return false;
      }
      running = null;
      persisted = target;

      // If the value changed while writing, persist the newer value before reporting saved.
      if (sameAsPersisted(deps.read())) {
        deps.onStatus('saved');
        return true;
      }
    }
  }

  function change(): void {
    if (disposed) return;
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
    deps.onStatus('unsaved');
    cancelTimer = scheduler.schedule(() => {
      cancelTimer = null;
      void saveLoop();
    }, debounceMs);
  }

  async function flush(): Promise<boolean> {
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
    return saveLoop();
  }

  function dispose(): void {
    disposed = true;
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
  }

  return { change, flush, dispose };
}
