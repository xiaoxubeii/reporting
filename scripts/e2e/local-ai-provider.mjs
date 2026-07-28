import { createServer } from 'node:http'

const OPEN_RAISE = /\b(?:currently\s+raising|is\s+raising|seeking\s+(?:funding|investment|capital)|looking\s+for\s+investors|plans?\s+to\s+raise|open\s+(?:funding\s+)?round)\b/i

export async function startLocalAiProvider() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' })
      }
      if (request.method === 'GET' && url.pathname === '/v1/models') {
        return sendJson(response, 200, {
          object: 'list',
          data: [{ id: 'reporting-e2e', object: 'model', created: 0, owned_by: 'reporting-e2e' }],
        })
      }
      if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
        return sendJson(response, 404, { error: { message: 'Not found' } })
      }
      const payload = JSON.parse(await readBody(request))
      const completion = resolveFixtureCompletion(payload)
      return sendJson(response, 200, {
        id: `chatcmpl-e2e-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: payload.model ?? 'reporting-e2e',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: completion.content ?? null,
            ...(completion.tool_calls ? { tool_calls: completion.tool_calls } : {}),
          },
          finish_reason: completion.tool_calls ? 'tool_calls' : 'stop',
        }],
        usage: { prompt_tokens: 32, completion_tokens: 48, total_tokens: 80 },
      })
    } catch (error) {
      return sendJson(response, 400, {
        error: { message: error instanceof Error ? error.message : 'Invalid request' },
      })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local AI provider did not bind a TCP port')
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  })
}

export function resolveFixtureCompletion(request) {
  const messages = Array.isArray(request?.messages) ? request.messages : []
  const text = messages.map(messageText).join('\n')
  const toolMessage = [...messages].reverse().find(message => message?.role === 'tool')
  if (Array.isArray(request?.tools) && request.tools.length > 0) {
    if (!toolMessage) {
      const name = request.tools[0]?.function?.name ?? 'reporting_search'
      return {
        content: null,
        tool_calls: [{
          id: 'call_reporting_e2e_1',
          type: 'function',
          function: { name, arguments: JSON.stringify({ topic: 'market' }) },
        }],
      }
    }
    const ids = collectAllowedSourceIds(toolMessage.content)
    return jsonCompletion({
      founder_background: 'Independent search evidence is attached to this result.',
      prior_companies: [],
      traction_corroboration: 'The available sources provide external context; pilot claims still require primary diligence.',
      market_context: 'The cited sources describe the cardiovascular clinical workflow market.',
      red_flags: ['Clinical performance and deployment economics remain to be independently verified.'],
      open_questions: ['What primary evidence supports clinical performance and hospital adoption?'],
      summary: 'External search evidence provides market context while management claims remain subject to diligence.',
      evidence_source_ids: ids,
    })
  }

  if (/exactly three string fields: question, expert_profile, context_snapshot/i.test(text)) {
    return jsonCompletion({
      question: 'Does independent evidence support the reported clinical performance and hospital workflow adoption?',
      expert_profile: 'Independent cardiovascular outcomes researcher with hospital deployment experience.',
      context_snapshot: 'Management reports two pilots; no patient-identifiable information is included.',
    })
  }
  if (/exactly these top-level fields: entities, concepts, events, confidence/i.test(text)) {
    const article = articleText(messages)
    const raise = article.match(OPEN_RAISE)?.[0]
    return jsonCompletion({
      entities: [{ kind: 'company', name: 'Discovery Health', normalizedName: 'discovery health', domain: null }],
      concepts: [{ kind: 'industry', name: 'Healthcare', normalizedName: 'healthcare' }],
      events: raise ? [{ type: 'funding', status: 'active', companyName: 'Discovery Health', stage: null, amount: null, eventDate: null, evidence: [raise] }] : [],
      confidence: 0.92,
    })
  }
  if (/exactly: companyName, companyDomain, signalType, opportunityStatus/i.test(text)) {
    const article = articleText(messages)
    const raise = article.match(OPEN_RAISE)?.[0] ?? 'currently raising'
    return jsonCompletion({
      companyName: 'Discovery Health', companyDomain: null, signalType: 'active_raise', opportunityStatus: 'open',
      stage: null, amount: null, eventDate: null, confidence: 0.94, evidence: [raise],
    })
  }
  if (/STAGE 1 — DATA ROOM INGESTION \(synthesis\)/i.test(text)) {
    return jsonCompletion({
      gap_analysis: {
        missing: [{ expected_type: 'clinical_validation', criticality: 'important', rationale: 'Independent clinical validation is not present.' }],
        inadequate: [],
      },
      cross_doc_flags: [],
    })
  }
  if (/STAGE 1 — DATA ROOM INGESTION \(per-document call/i.test(text)) {
    const documentId = extractDocumentId(text)
    const expert = /industry expert|expert-validation|expert response/i.test(text)
    return jsonCompletion({
      document_id: documentId,
      detected_type: expert ? 'industry_expert' : 'pitch_deck',
      type_confidence: 'high',
      summary: expert ? 'Independent expert response describing evidence limitations.' : 'Management pitch describing a cardiovascular workflow and two pilots.',
      claims: [{
        id: `claim_${documentId.replaceAll('-', '').slice(0, 12)}_1`,
        field: expert ? 'expert_validation' : 'pilot_count',
        value: expert ? 'Independent validation remains incomplete' : 'Two hospital pilots',
        context: expert ? 'Expert response' : 'Management pitch',
        verification_status: 'unverified', criticality: 'high', checklist_item_id: null,
      }],
      issues: ['Independent clinical performance evidence is not included.'],
    })
  }
  if (/STAGE 2 — CLAIMS VERIFICATION/i.test(text)) {
    const claimId = text.match(/\bid=(claim_[^\s|]+)/)?.[1] ?? null
    return jsonCompletion({
      findings: [{
        id: 'finding_e2e_1', claim_ref: claimId, topic: 'Pilot evidence', verification_status: 'company_stated',
        evidence: 'Two pilots are reported by management and remain independently unverified.', sources: [],
      }],
      contradictions: [],
      research_gaps: [{ topic: 'Clinical validation', rationale: 'Independent performance evidence is required.', criticality: 'important' }],
    })
  }
  if (/STAGE 2 — COMPETITIVE MAP/i.test(text)) {
    return jsonCompletion({ competitive_map: { named_by_company: [], named_by_research: [] } })
  }
  if (/STAGE 2 — FOUNDER DOSSIERS/i.test(text)) {
    return jsonCompletion({ founder_dossiers: [] })
  }
  if (/CHECKLIST ASSESSMENT/i.test(text)) {
    const documentId = text.match(/doc_id=([^,\s)]+)/)?.[1]
    const ids = unique([...text.matchAll(/^- id=([^\s]+)/gm)].map(match => match[1]))
    return jsonCompletion({
      items: ids.map((id, index) => ({
        id,
        status: index === 0 && documentId ? 'partial' : 'missing',
        evidence: index === 0 && documentId ? [{ document_id: documentId, summary: 'The pitch partially addresses this item.' }] : [],
        notes: index === 0 ? 'Management evidence requires independent confirmation.' : 'Not addressed in the supplied data room.',
      })),
    })
  }
  if (/STAGE 5 — RUBRIC SCORING/i.test(text)) {
    const requested = text.match(/score ONLY these dimension_ids[^:]*:\s*([^\n.]+)/i)?.[1] ?? ''
    const ids = requested.split(',').map(value => value.trim()).filter(Boolean)
    return jsonCompletion({
      scores: ids.map(id => ({
        dimension_id: id,
        mode: id === 'team' ? 'partner_only' : 'machine',
        score: id === 'team' ? null : 3,
        confidence: id === 'team' ? null : 'medium',
        rationale: 'Available evidence supports a stage-appropriate baseline with material follow-up questions.',
        supporting_evidence: [{ source_type: 'claim', source_id: extractClaimId(text) }],
      })),
      low_confidence_attention: [],
    })
  }
  if (/STAGE 4C — MEMO REVIEW & EDIT/i.test(text)) return jsonCompletion({ edits: [] })
  if (/STAGE 4B — WRITE MEMO SECTIONS/i.test(text)) {
    const paragraphs = [...text.matchAll(/## Section: ([^\n]+)\n((?:(?!## Section:)[\s\S])*?)(?=\n## Section:|$)/g)]
      .flatMap(sectionMatch => {
        const sectionId = sectionMatch[1].trim()
        return [...sectionMatch[2].matchAll(/- paragraph ([^\s]+) \(order (\d+)\): ([^\n]+)/g)].map(paragraphMatch => {
          const placeholder = sectionId === 'recommendation' || /partner-only placeholder/i.test(paragraphMatch[3])
          return {
            id: paragraphMatch[1], section_id: sectionId, order: Number(paragraphMatch[2]),
            prose: placeholder ? '[Partner to complete]' : `The evidence indicates that ${paragraphMatch[3].trim().replace(/[.]$/, '')}; the investment implication remains conditional on independent validation.`,
            sources: placeholder ? [] : [{ source_type: 'claim', source_id: extractClaimId(text), span: null }],
            origin: placeholder ? 'partner_only_placeholder' : 'agent_drafted',
            confidence: placeholder ? 'n/a' : 'medium',
            contains_projection: false, contains_unverified_claim: !placeholder, contains_contradiction: false,
          }
        })
      })
    return jsonCompletion({ paragraphs })
  }
  if (/STAGE 4A — MEMO OUTLINE/i.test(text)) {
    const sectionIds = unique([...text.matchAll(/^\s*- id:\s*([a-z0-9_-]+)/gmi)].map(match => match[1]))
      .filter(id => !['header', 'scoring_summary', 'appendix'].includes(id))
    const usable = sectionIds.length > 0 ? sectionIds : ['executive_summary', 'company_overview', 'market', 'team', 'recommendation']
    return jsonCompletion({
      header: {
        company_name: extractDealName(text), sector: 'Healthcare', stage: 'Seed', round_size: null,
        deal_lead: null, memo_date: '2026-07-27', draft_version: 'e2e-1', agent_version: 'memo-agent v0.1',
      },
      sections: usable.map(sectionId => ({
        section_id: sectionId,
        paragraphs: [{ id: `p_${sectionId}_1`, order: 1, topic: sectionId === 'recommendation' ? '[partner-only placeholder]' : `${sectionId.replaceAll('_', ' ')} investment implication` }],
      })),
      partner_attention: [{
        kind: 'data_room_gap', urgency: 'should_address', body: 'Independent clinical validation remains outstanding.',
        links: [{ source_type: 'gap', source_id: 'clinical_validation' }],
      }],
    })
  }
  if (/thesis_fit_score|senior partner at a venture capital fund/i.test(text)) {
    const companyUrl = text.match(/^Website:\s*(https?:\/\/\S+)/mi)?.[1] ?? null
    const founder = text.match(/^Founder:\s*([^<\n]+?)\s*<([^>]+)>/mi)
    return jsonCompletion({
      company_name: extractDealName(text), company_url: companyUrl,
      company_domain: companyUrl ? new URL(companyUrl).hostname : null,
      founder_name: founder?.[1]?.trim() ?? null, founder_email: founder?.[2]?.trim().toLowerCase() ?? null,
      co_founders: [], intro_source: 'cold',
      referrer_name: null, referrer_email: null, stage: 'Seed', industry: 'Cardiovascular clinical software',
      raise_amount: null, company_summary: 'Cardiovascular decision-support workflow with two reported pilots.',
      thesis_fit_analysis: 'The company fits the fund thesis, while clinical evidence and deployment economics require diligence.',
      thesis_fit_score: 'strong',
    })
  }
  return jsonCompletion({ summary: 'Deterministic E2E provider response.' })
}

function jsonCompletion(value) {
  return { content: JSON.stringify(value) }
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content
  if (!Array.isArray(message?.content)) return ''
  return message.content.map(part => typeof part?.text === 'string' ? part.text : '').join('\n')
}

function articleText(messages) {
  for (const message of [...messages].reverse()) {
    const raw = messageText(message)
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.content === 'string') return [parsed.title, parsed.summary, parsed.content].filter(Boolean).join('\n')
    } catch {}
  }
  return messages.map(messageText).join('\n')
}

function collectAllowedSourceIds(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const ids = parsed?.citation_contract?.allowed_source_ids
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
}

function extractDocumentId(text) {
  return text.match(/document_id["'=:\s]+([0-9a-f-]{20,})/i)?.[1]
    ?? text.match(/doc_id=([0-9a-f-]{20,})/i)?.[1]
    ?? '00000000-0000-4000-8000-000000000001'
}

function extractClaimId(text) {
  return text.match(/\b(claim_[a-z0-9_-]+)/i)?.[1] ?? 'claim_e2e_1'
}

function extractDealName(text) {
  return text.match(/^Subject:\s*(?:Web submission|Manual entry):\s*(.+)$/mi)?.[1]?.trim()
    ?? text.match(/^Deal:\s*(.+)$/m)?.[1]?.trim()
    ?? 'E2E Investment'
}

function unique(values) {
  return [...new Set(values)]
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 2_000_000) throw new Error('Request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}
