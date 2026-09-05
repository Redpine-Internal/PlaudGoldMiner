import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnrichmentAutosave, type EnrichmentPatch } from '@/components/ds/enrichment/enrichment-autosave';

describe('enrichment autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('salva texto e observações editados dentro da mesma janela de debounce', async () => {
    const saved: EnrichmentPatch = {};
    const save = vi.fn(async (patch: EnrichmentPatch) => { Object.assign(saved, patch); });
    const queue = createEnrichmentAutosave(save, vi.fn());

    queue.schedule({ textOverride: 'Primeiro texto' });
    await vi.advanceTimersByTimeAsync(200);
    queue.schedule({ notes: 'Observação preservada' });
    await vi.advanceTimersByTimeAsync(200);
    queue.schedule({ textOverride: 'Texto revisado' });
    await vi.advanceTimersByTimeAsync(600);

    expect(saved).toEqual({ textOverride: 'Texto revisado', notes: 'Observação preservada' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('persiste imediatamente ao fechar, sem disparar novamente depois do debounce', async () => {
    const save = vi.fn<(patch: EnrichmentPatch) => Promise<void>>().mockResolvedValue(undefined);
    const queue = createEnrichmentAutosave(save, vi.fn());
    queue.schedule({ notes: 'Última anotação antes de fechar' });

    await queue.flush();
    expect(save).toHaveBeenCalledWith({ notes: 'Última anotação antes de fechar' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('espera uma gravação lenta e depois salva a edição mais recente antes de fechar', async () => {
    let finishFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => { finishFirst = resolve; });
    const saved: EnrichmentPatch = {};
    const save = vi.fn(async (patch: EnrichmentPatch) => {
      if (patch.textOverride === 'Versão anterior') await firstRequest;
      Object.assign(saved, patch);
    });
    const queue = createEnrichmentAutosave(save, vi.fn());
    queue.schedule({ textOverride: 'Versão anterior' });
    await vi.advanceTimersByTimeAsync(600);
    queue.schedule({ textOverride: 'Versão final', notes: 'Nova observação' });
    const closed = vi.fn();
    const closing = queue.flush().then(closed);

    expect(save).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    finishFirst();
    await closing;

    expect(saved).toEqual({ textOverride: 'Versão final', notes: 'Nova observação' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('mantém campos não salvos após falha e preserva valores novos no retry', async () => {
    const error = new Error('HTTP 500');
    const save = vi.fn<(patch: EnrichmentPatch) => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const queue = createEnrichmentAutosave(save, onError);
    queue.schedule({ textOverride: 'Texto original', notes: 'Observação importante' });
    await vi.advanceTimersByTimeAsync(600);

    expect(onError).toHaveBeenCalledWith(error);
    queue.schedule({ textOverride: 'Texto atualizado' });
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({ textOverride: 'Texto atualizado', notes: 'Observação importante' });
  });

  it('mantém o modal aberto quando flush falha e permite tentar fechar novamente', async () => {
    const save = vi.fn<(patch: EnrichmentPatch) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Sem conexão'))
      .mockResolvedValue(undefined);
    const queue = createEnrichmentAutosave(save, vi.fn());
    queue.schedule({ notes: 'Não perder' });
    const close = vi.fn();

    await expect(queue.flush().then(close)).rejects.toThrow('Sem conexão');
    expect(close).not.toHaveBeenCalled();
    await queue.flush().then(close);
    expect(save).toHaveBeenLastCalledWith({ notes: 'Não perder' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('salva a fila antiga na ideia original ao abrir outra ideia', async () => {
    const saved = new Map<string, EnrichmentPatch>();
    const first = createEnrichmentAutosave(async (patch) => { saved.set('ideia-a', patch); }, vi.fn());
    const second = createEnrichmentAutosave(async (patch) => { saved.set('ideia-b', patch); }, vi.fn());
    first.schedule({ textOverride: 'Texto da ideia A' });
    const leavingFirst = first.flush();
    second.schedule({ notes: 'Observação da ideia B' });

    await leavingFirst;
    await vi.advanceTimersByTimeAsync(600);
    expect(saved.get('ideia-a')).toEqual({ textOverride: 'Texto da ideia A' });
    expect(saved.get('ideia-b')).toEqual({ notes: 'Observação da ideia B' });
  });
});
