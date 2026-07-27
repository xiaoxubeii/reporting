import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260727000000_fund_subdomain_isolation.sql', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(new URL('../lib/types/database.ts', import.meta.url), 'utf8')

describe('Fund subdomain isolation migration contract', () => {
  it('adds a non-null unique DNS-safe slug with reserved-label rejection', () => {
    expect(SQL).toMatch(/alter table public\.funds[\s\S]*add column if not exists slug text/i)
    expect(SQL).toMatch(/update public\.funds[\s\S]*set slug =/i)
    expect(SQL).toMatch(/alter column slug set not null/i)
    expect(SQL).toMatch(/unique[\s\S]*(?:funds_slug|\(slug\))/i)
    expect(SQL).toMatch(/slug ~ '\^\[a-z0-9\]/i)
    for (const reserved of ['www', 'api', 'auth', 'admin', 'hooks', 'internal', 'support', 'fundworkspace']) {
      expect(SQL).toContain(`'${reserved}'`)
    }
  })

  it('keeps the slug stable across ordinary Fund updates', () => {
    expect(SQL).toMatch(/function public\.fund_slug_immutable/i)
    expect(SQL).toMatch(/new\.slug is distinct from old\.slug/i)
    expect(SQL).toMatch(/create trigger fund_slug_immutable/i)
  })

  it('exposes only a minimal exact-slug public descriptor', () => {
    const resolver = SQL.match(/function public\.resolve_public_fund_host[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(resolver).toMatch(/security definer/i)
    expect(resolver).toMatch(/where funds\.slug = p_slug/i)
    expect(resolver).toMatch(/funds\.id[\s\S]*funds\.slug[\s\S]*funds\.name[\s\S]*funds\.logo_url/i)
    expect(resolver).toMatch(/fund_settings[\s\S]*theme/i)
    expect(resolver).toMatch(/jsonb_build_object\([\s\S]*'accent'[\s\S]*'font'[\s\S]*'radius'/i)
    expect(resolver).not.toMatch(/select[\s\S]*fund_settings\.theme\s+from/i)
    expect(resolver).not.toMatch(/api_key|token|secret|email_domain|created_by/i)
    expect(SQL).toMatch(/revoke all on function public\.resolve_public_fund_host\(text\) from public/i)
    expect(SQL).toMatch(/grant execute on function public\.resolve_public_fund_host\(text\) to anon, authenticated, service_role/i)
    expect(SQL).not.toMatch(/create policy[\s\S]{0,160}(?:funds|fund_settings)[\s\S]{0,160}anon/i)
  })

  it('resolves an active LP to exactly one distinct Fund across direct and delegated links', () => {
    const resolver = SQL.match(/function public\.resolve_my_lp_fund[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(resolver).toMatch(/auth\.uid\(\)/i)
    expect(resolver).toMatch(/lp_accounts[\s\S]*status = 'active'/i)
    expect(resolver).toMatch(/lp_account_links[\s\S]*lp_investors[\s\S]*fund_id/i)
    expect(resolver).toMatch(/lp_authorized_users[\s\S]*principal_lp_account_id/i)
    expect(resolver).toMatch(/count\(distinct fund_id\)[\s\S]*= 1/i)
    expect(SQL).toMatch(/revoke all on function public\.resolve_my_lp_fund\(\) from public, anon/i)
    expect(SQL).toMatch(/grant execute on function public\.resolve_my_lp_fund\(\) to authenticated, service_role/i)
  })

  it('updates generated types for the slug and both resolver functions', () => {
    expect(DATABASE_TYPES).toMatch(/funds:[\s\S]*Row:[\s\S]*slug: string/)
    expect(DATABASE_TYPES).toMatch(/funds:[\s\S]*Insert:[\s\S]*slug\?: string/)
    expect(DATABASE_TYPES).toMatch(/resolve_public_fund_host:[\s\S]*Args: \{ p_slug: string \}/)
    expect(DATABASE_TYPES).toMatch(/resolve_my_lp_fund: \{ Args: never; Returns: string \| null \}/)
  })
})
