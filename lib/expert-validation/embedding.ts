import OpenAI from 'openai'
import { getOpenAIApiKey } from '@/lib/pipeline/processEmail'

export const EXPERT_EMBEDDING_MODEL = 'text-embedding-3-small'
export const EXPERT_EMBEDDING_DIMENSIONS = 1536

type Admin = Parameters<typeof getOpenAIApiKey>[0]

/**
 * V1 deliberately uses one deployment-wide model and dimension. Changing the
 * model requires an offline rebuild of every stored expert vector.
 */
export async function createExpertEmbedding(
  admin: Admin,
  fundId: string,
  text: string,
): Promise<number[]> {
  const apiKey = await getOpenAIApiKey(admin, fundId)
  const client = new OpenAI({ apiKey })
  const result = await client.embeddings.create({
    model: EXPERT_EMBEDDING_MODEL,
    input: text,
    dimensions: EXPERT_EMBEDDING_DIMENSIONS,
    encoding_format: 'float',
  })
  const vector = result.data[0]?.embedding
  if (!vector || vector.length !== EXPERT_EMBEDDING_DIMENSIONS) {
    throw new Error('Embedding provider returned an invalid vector')
  }
  return vector
}

export function vectorLiteral(vector: number[]): string {
  if (vector.length !== EXPERT_EMBEDDING_DIMENSIONS || vector.some(value => !Number.isFinite(value))) {
    throw new Error('Invalid expert embedding')
  }
  return `[${vector.join(',')}]`
}
