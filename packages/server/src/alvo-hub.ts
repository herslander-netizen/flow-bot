/**
 * Alvo Hub: verificação opcional e exclusivamente server-side.
 * Não aceita URL, token, dados de cliente ou parâmetros vindos do navegador.
 * O chamador fornece apenas configuração confiável do servidor.
 */
export type EstadoAlvoHub = 'disabled' | 'unavailable' | 'ready'
type Ambiente = Readonly<Record<string, string | undefined>>

const PRODUTO = 'flowbot'
const MAX_BYTES = 2048

async function respostaValida(response: Response): Promise<boolean> {
  if (
    response.status !== 200 ||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => {})
    return false
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BYTES) {
        void reader.cancel().catch(() => {})
        return false
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const raw: unknown = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
    const data = raw as Record<string, unknown>
    return (
      Object.keys(data).sort().join(',') === 'aiExecution,capabilities,product,protocol,status' &&
      data.protocol === 'alvo-hub-connect/v1' &&
      data.product === PRODUTO &&
      data.status === 'ready' &&
      data.aiExecution === false &&
      Array.isArray(data.capabilities) &&
      data.capabilities.length === 1 &&
      data.capabilities[0] === 'connectivity'
    )
  } finally {
    reader.releaseLock()
  }
}

/** Ausência de VM, token incorreto, timeout ou resposta incompatível não bloqueiam o produto. */
export async function verificarAlvoHub(
  env: Ambiente,
  fetcher: typeof fetch = fetch,
): Promise<EstadoAlvoHub> {
  if (env.ALVO_HUB_ENABLED !== '1') return 'disabled'
  const origin = env.ALVO_HUB_ORIGIN ?? ''
  const token = env.ALVO_HUB_TOKEN ?? ''
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return 'unavailable'
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.origin !== origin) return 'unavailable'
    const response = await fetcher(origin + '/v1/connectivity/' + PRODUTO, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer ' + token },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    return (await respostaValida(response)) ? 'ready' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
