import { describe, expect, it, vi } from 'vitest'
import { verificarAlvoHub } from '../src/alvo-hub.js'

const env = {
  ALVO_HUB_ENABLED: '1',
  ALVO_HUB_ORIGIN: 'https://hub.example.test',
  ALVO_HUB_TOKEN: 'a'.repeat(43),
}
const payload = {
  protocol: 'alvo-hub-connect/v1',
  product: 'flowbot',
  status: 'ready',
  capabilities: ['connectivity'],
  aiExecution: false,
}

describe('conexão opcional Alvo Hub', () => {
  it('desligado por padrão, sem rede', async () => {
    const request = vi.fn<typeof fetch>()
    expect(await verificarAlvoHub({}, request)).toBe('disabled')
    expect(request).not.toHaveBeenCalled()
  })

  it('usa somente configuração HTTPS confiável e a rota fixa do produto', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload))
    expect(await verificarAlvoHub(env, request)).toBe('ready')
    expect(request).toHaveBeenCalledWith(
      env.ALVO_HUB_ORIGIN + '/v1/connectivity/flowbot',
      expect.objectContaining({
        method: 'GET',
        headers: { accept: 'application/json', authorization: 'Bearer ' + env.ALVO_HUB_TOKEN },
        redirect: 'error',
        cache: 'no-store',
      }),
    )
  })

  it('nega origens com caminho, consulta, credencial ou sem HTTPS e token inválido', async () => {
    const request = vi.fn<typeof fetch>()
    for (const origin of [
      'http://hub.example.test',
      'https://hub.example.test/path',
      'https://hub.example.test?token=x',
      'https://user:pass@hub.example.test',
    ]) {
      expect(await verificarAlvoHub({ ...env, ALVO_HUB_ORIGIN: origin }, request)).toBe('unavailable')
    }
    expect(await verificarAlvoHub({ ...env, ALVO_HUB_TOKEN: 'x' }, request)).toBe('unavailable')
    expect(request).not.toHaveBeenCalled()
  })

  it('nega outro produto, alegação de IA ativa, campos extras e respostas grandes', async () => {
    for (const body of [
      { ...payload, product: 'other' },
      { ...payload, aiExecution: true },
      { ...payload, extra: 'x' },
      { ...payload, extra: 'x'.repeat(3000) },
    ]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))
      expect(await verificarAlvoHub(env, request)).toBe('unavailable')
    }
  })

  it('falha sem derrubar o produto quando a VM ou credencial falha', async () => {
    const request = vi.fn<typeof fetch>()
    request.mockResolvedValueOnce(new Response(null, { status: 401 }))
    request.mockResolvedValueOnce(new Response(null, { status: 503 }))
    request.mockRejectedValueOnce(new Error('offline'))
    for (let i = 0; i < 3; i++) expect(await verificarAlvoHub(env, request)).toBe('unavailable')
  })
})
