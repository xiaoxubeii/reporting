import { describe, expect, it } from 'vitest'

// The fixture is deliberately plain ESM so the Node E2E runner can start it
// without a TypeScript loader.
import { resolveFixtureCompletion } from '../scripts/e2e/local-ai-provider.mjs'

function request(content: string, extra: Record<string, unknown> = {}) {
  return {
    model: 'reporting-e2e',
    messages: [{ role: 'user', content }],
    ...extra,
  }
}

describe('local E2E AI provider', () => {
  it('returns every requested checklist and rubric identifier', () => {
    const checklist = resolveFixtureCompletion(request(`CHECKLIST ASSESSMENT\n- id=item-a Market\n- id=item-b Team`))
    expect(JSON.parse(checklist.content!).items.map((item: { id: string }) => item.id)).toEqual(['item-a', 'item-b'])

    const score = resolveFixtureCompletion(request(
      '=== STAGE 5 — RUBRIC SCORING ===\nIMPORTANT — for THIS pass, score ONLY these dimension_ids and omit all others from "scores" (they are scored in separate passes): market, team.',
    ))
    expect(JSON.parse(score.content!).scores.map((item: { dimension_id: string }) => item.dimension_id)).toEqual(['market', 'team'])
  })

  it('echoes the requested memo outline paragraphs into section fills', () => {
    const fill = resolveFixtureCompletion(request(`
=== STAGE 4B — WRITE MEMO SECTIONS ===
--- SECTIONS TO WRITE IN THIS CALL ---
## Section: market
  - paragraph p_market_1 (order 1): market evidence
## Section: recommendation
  - paragraph p_recommendation_1 (order 1): [partner-only placeholder]
`))
    expect(JSON.parse(fill.content!).paragraphs).toMatchObject([
      { id: 'p_market_1', section_id: 'market', order: 1, origin: 'agent_drafted' },
      { id: 'p_recommendation_1', section_id: 'recommendation', order: 1, origin: 'partner_only_placeholder' },
    ])
  })

  it('performs one reporting_search tool call then cites only allowed source ids', () => {
    const initial = resolveFixtureCompletion(request('Research this inbound deal.', {
      tools: [{ type: 'function', function: { name: 'reporting_search' } }],
    }))
    expect('tool_calls' in initial ? initial.tool_calls[0]?.function.name : null).toBe('reporting_search')
    expect(JSON.parse('tool_calls' in initial ? initial.tool_calls[0]?.function.arguments ?? '{}' : '{}')).toEqual({ topic: 'market' })

    const final = resolveFixtureCompletion({
      ...request('Research this inbound deal.', {
        tools: [{ type: 'function', function: { name: 'reporting_search' } }],
      }),
      messages: [
        { role: 'user', content: 'Research this inbound deal.' },
        { role: 'tool', content: JSON.stringify({ citation_contract: { allowed_source_ids: ['src_1', 'src_2'] } }) },
      ],
    })
    expect(JSON.parse(final.content!).evidence_source_ids).toEqual(['src_1', 'src_2'])
  })

  it('preserves public-submission identity fields during deal screening', () => {
    const result = resolveFixtureCompletion({
      model: 'reporting-e2e',
      messages: [
        { role: 'system', content: 'You are a senior partner. Return thesis_fit_score.' },
        { role: 'user', content: 'Subject: Web submission: Decision Loop 42\n\nBody:\nFounder: Jordan Founder <jordan@example.test>\nWebsite: https://decision-loop.example/product' },
      ],
    })
    expect(JSON.parse(result.content!)).toMatchObject({
      company_name: 'Decision Loop 42',
      company_url: 'https://decision-loop.example/product',
      company_domain: 'decision-loop.example',
      founder_name: 'Jordan Founder',
      founder_email: 'jordan@example.test',
    })
  })

  it('preserves manual Deal identity fields during screening', () => {
    const result = resolveFixtureCompletion({
      model: 'reporting-e2e',
      messages: [
        { role: 'system', content: 'You are a senior partner. Return thesis_fit_score.' },
        { role: 'user', content: 'Subject: Manual entry: Discovery Health\n\nFounder: Discovery Founder <founder@example.test>\nWebsite: https://discovery-health.example' },
      ],
    })
    expect(JSON.parse(result.content!)).toMatchObject({
      company_name: 'Discovery Health',
      company_url: 'https://discovery-health.example',
      company_domain: 'discovery-health.example',
      founder_name: 'Discovery Founder',
      founder_email: 'founder@example.test',
    })
  })
})
