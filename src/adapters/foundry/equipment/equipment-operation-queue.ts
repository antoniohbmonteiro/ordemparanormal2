const queues = new Map<string, Promise<unknown>>();

export function enqueueEquipmentOperation<T>(actorUuid: string, equipmentId: string, run: () => Promise<T>): Promise<T> {
  const key = `${actorUuid}:${equipmentId}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.then(run, run);
  queues.set(key, result);
  const cleanup = () => { if (queues.get(key) === result) queues.delete(key); };
  void result.then(cleanup, cleanup);
  return result;
}
