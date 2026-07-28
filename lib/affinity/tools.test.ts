import { describe, expect, it } from 'vitest'
import { PROJECT_AFFINITY_TOOLS, makeProjectAffinityExecutor } from './tools'

describe('project-scoped Affinity tools', () => {
  it('does not expose arbitrary organization search inside a bound diligence project', () => {
    expect(PROJECT_AFFINITY_TOOLS.map(tool => tool.name)).toEqual([
      'affinity_get_notes',
      'affinity_list_files',
    ])
  })

  it('rejects model-supplied organization ids outside the current project before calling Affinity', async () => {
    const execute = makeProjectAffinityExecutor('unused-key', 42)

    await expect(execute({
      name: 'affinity_get_notes',
      input: { organization_id: 99 },
    })).resolves.toContain('outside the current diligence project')

    await expect(execute({
      name: 'affinity_search_companies',
      input: { term: 'Another company' },
    })).resolves.toContain('not available inside a bound diligence project')
  })
})
