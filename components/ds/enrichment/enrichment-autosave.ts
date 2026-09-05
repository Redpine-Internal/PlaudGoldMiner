export interface EnrichmentPatch {
  notes?: string;
  textOverride?: string;
}

/** Mescla campos e serializa gravações para a última edição sempre prevalecer. */
export function createEnrichmentAutosave(
  save: (patch: EnrichmentPatch) => Promise<void>,
  onError: (error: unknown) => void,
  delay = 600,
) {
  let pending: EnrichmentPatch | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const flush = async (): Promise<void> => {
    clearTimer();
    while (inFlight || pending) {
      if (inFlight) {
        await inFlight;
        continue;
      }
      const patch = pending!;
      pending = null;
      inFlight = save(patch)
        .catch((error: unknown) => {
          // Mantém o que falhou para retry, preservando edições mais recentes.
          pending = { ...patch, ...pending };
          throw error;
        })
        .finally(() => { inFlight = null; });
      await inFlight;
    }
  };

  const schedule = (patch: EnrichmentPatch) => {
    clearTimer();
    pending = { ...pending, ...patch };
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(onError);
    }, delay);
  };

  return { schedule, flush };
}
