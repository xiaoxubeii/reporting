/**
 * Read an upstream response without ever buffering more than the configured
 * byte limit. The limit is enforced against both Content-Length and streamed
 * bytes, so missing or dishonest headers cannot cause unbounded memory use.
 */
export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<string> {
  const declared = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }

  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) return text + decoder.decode()

    totalBytes += chunk.value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
}
