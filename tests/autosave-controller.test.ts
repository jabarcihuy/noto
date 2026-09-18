import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createAutosaveController,
  type AutosaveStatus,
  type Scheduler,
} from '@/features/notes/application/autosave-controller';

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createManualScheduler() {
  let tasks: { fn: () => void; id: number }[] = [];
  let nextId = 1;
  const scheduler: Scheduler = {
    schedule(fn) {
      const id = nextId++;
      tasks.push({ fn, id });
      return () => {
        tasks = tasks.filter((task) => task.id !== id);
      };
    },
  };
  return {
    scheduler,
    runPending() {
      const pending = [...tasks];
      tasks = [];
      for (const task of pending) task.fn();
    },
    get pendingCount() {
      return tasks.length;
    },
  };
}

async function settleMicrotasks(times = 12): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

test('change() debounces and persists only the latest value', async () => {
  const manual = createManualScheduler();
  let value = 'A';
  const writes: string[] = [];
  const statuses: AutosaveStatus[] = [];

  const controller = createAutosaveController<string>({
    read: () => value,
    write: async (next) => {
      writes.push(next);
    },
    equals: (a, b) => a === b,
    onStatus: (status) => statuses.push(status),
    debounceMs: 800,
    scheduler: manual.scheduler,
  });

  value = 'B';
  controller.change();
  value = 'C';
  controller.change();

  assert.equal(manual.pendingCount, 1, 'debounce keeps a single pending task');

  manual.runPending();
  const saved = await controller.flush();

  assert.equal(saved, true);
  assert.deepEqual(writes, ['C']);
  assert.equal(statuses.at(-1), 'saved');
});

test('does not report saved before the write resolves', async () => {
  const manual = createManualScheduler();
  let value = 'A';
  const statuses: AutosaveStatus[] = [];
  const gate = deferred();

  const controller = createAutosaveController<string>({
    read: () => value,
    write: () => gate.promise,
    equals: (a, b) => a === b,
    onStatus: (status) => statuses.push(status),
    debounceMs: 800,
    scheduler: manual.scheduler,
  });

  value = 'B';
  controller.change();
  manual.runPending();
  await settleMicrotasks();

  assert.equal(statuses.at(-1), 'saving');
  assert.ok(!statuses.includes('saved'), 'must not report saved while the write is pending');

  gate.resolve();
  const saved = await controller.flush();

  assert.equal(saved, true);
  assert.equal(statuses.at(-1), 'saved');
});

test('a stale write never overwrites newer content', async () => {
  const manual = createManualScheduler();
  let value = 'A';
  const writes: string[] = [];
  const gates: Deferred[] = [];

  const controller = createAutosaveController<string>({
    read: () => value,
    write: (next) => {
      writes.push(next);
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    },
    equals: (a, b) => a === b,
    onStatus: () => undefined,
    debounceMs: 800,
    scheduler: manual.scheduler,
  });

  value = 'A1';
  controller.change();
  manual.runPending();
  await settleMicrotasks();

  // Newer change while the first write is still in flight.
  value = 'A2';
  controller.change();
  gates[0]!.resolve();
  await settleMicrotasks();

  assert.deepEqual(writes, ['A1', 'A2'], 'newer value must be written after the stale one');

  gates[1]!.resolve();
  const saved = await controller.flush();

  assert.equal(saved, true);
  assert.equal(writes.at(-1), 'A2', 'final persisted value must be the newest');
});

test('a failed write produces an error status and can be retried', async () => {
  const manual = createManualScheduler();
  let value = 'A';
  const statuses: AutosaveStatus[] = [];
  let shouldFail = true;

  const controller = createAutosaveController<string>({
    read: () => value,
    write: async () => {
      if (shouldFail) throw new Error('boom');
    },
    equals: (a, b) => a === b,
    onStatus: (status) => statuses.push(status),
    debounceMs: 800,
    scheduler: manual.scheduler,
  });

  value = 'B';
  controller.change();
  manual.runPending();

  const first = await controller.flush();
  assert.equal(first, false);
  assert.equal(statuses.at(-1), 'error');

  shouldFail = false;
  const second = await controller.flush();
  assert.equal(second, true);
  assert.equal(statuses.at(-1), 'saved');
});

test('flush persists pending changes without waiting for the debounce', async () => {
  const manual = createManualScheduler();
  let value = 'A';
  const writes: string[] = [];

  const controller = createAutosaveController<string>({
    read: () => value,
    write: async (next) => {
      writes.push(next);
    },
    equals: (a, b) => a === b,
    onStatus: () => undefined,
    debounceMs: 800,
    scheduler: manual.scheduler,
  });

  value = 'B';
  controller.change();
  assert.equal(manual.pendingCount, 1);

  const saved = await controller.flush();
  assert.equal(saved, true);
  assert.deepEqual(writes, ['B']);
  assert.equal(manual.pendingCount, 0);
});
