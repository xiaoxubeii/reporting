import { NextRequest, NextResponse } from 'next/server'

import { OpenAIProvider } from '@/lib/ai/openai'
import {
  getCustomAIProviderInputError,
  getCustomAIProviderValidationError,
  parseCustomAIProviderRequestParameters,
} from '@/lib/ai/custom-provider'
import { rateLimit } from '@/lib/rate-limit'
import { assertAdminAccess } from '@/lib/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { validateCustomProviderUrl } from '@/lib/validate-url'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertAdminAccess(createAdminClient(), user.id)
  if (access instanceof NextResponse) return access

  const limited = await rateLimit({
    key: `test-custom-provider:${user.id}`,
    limit: 5,
    windowSeconds: 300,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null) as {
    apiKey?: unknown
    baseUrl?: unknown
    model?: unknown
    requestParameters?: unknown
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const inputError = getCustomAIProviderInputError(body)
  if (inputError) return NextResponse.json({ error: inputError }, { status: 400 })

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  const validationError = getCustomAIProviderValidationError({
    hasApiKey: !!apiKey,
    baseUrl,
    model,
  })
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const requestParameters = parseCustomAIProviderRequestParameters(body.requestParameters)
  if (!requestParameters.ok) {
    return NextResponse.json({ error: requestParameters.error }, { status: 400 })
  }

  const urlValidation = await validateCustomProviderUrl(baseUrl)
  if (!urlValidation.ok) {
    return NextResponse.json({ error: urlValidation.error }, { status: 400 })
  }

  try {
    const provider = new OpenAIProvider(apiKey, urlValidation.url, {
      requestParameters: requestParameters.value,
      rejectRedirects: true,
      publicEgressOnly: true,
    })
    await provider.createMessage({ model, maxTokens: 1, content: 'Hi' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
