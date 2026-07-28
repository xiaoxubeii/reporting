import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260725020000_feed_discovery.sql', import.meta.url),
  'utf8',
)
const providerVersionMigration = readFileSync(
  new URL('../supabase/migrations/20260726010000_feed_discovery_provider_version_rescan.sql', import.meta.url),
  'utf8',
)
const fundScopeMigration = readFileSync(
  new URL('../supabase/migrations/20260726020000_feed_discovery_fund_scope.sql', import.meta.url),
  'utf8',
)
const schedulerCursorMigration = readFileSync(
  new URL('../supabase/migrations/20260726030000_feed_discovery_scheduler_cursor.sql', import.meta.url),
  'utf8',
)
const ollamaSchedulerMigration = readFileSync(
  new URL('../supabase/migrations/20260727030000_feed_discovery_ollama_scheduler.sql', import.meta.url),
  'utf8',
)
const databaseTypes = readFileSync(
  new URL('../lib/types/database.ts', import.meta.url),
  'utf8',
)

const TABLES = [
  'explore_article_enrichments',
  'explore_article_deal_classifications',
  'explore_discovery_items',
  'explore_discovery_refresh_state',
] as const

describe('Feed discovery migration contract', () => {
  it('separates semantic enrichment, Deal classification, generations, and refresh state', () => {
    for (const table of TABLES) {
      expect(migration).toMatch(new RegExp(`create table public\\.${table}\\s*\\(`, 'i'))
    }
    expect(migration).toMatch(/collector_entry_id\s+bigint\s+not null/i)
    expect(migration).toMatch(/content_hash\s+text\s+not null[\s\S]*check\s*\(content_hash ~ '\^\[0-9a-f\]\{64\}\$'/i)
    expect(migration).toMatch(/classifier_version\s+text\s+not null/i)
    expect(migration).toMatch(/generation_id\s+uuid\s+not null/i)
    expect(migration).toMatch(/active_generation_id\s+uuid/i)
    expect(migration).toMatch(/watermark_changed_entry_id\s+bigint\s+not null\s+default 0/i)
    expect(migration).toMatch(/watermark_changed_scan_cutoff\s+timestamptz/i)
    expect(migration).not.toMatch(/\b(article_body|raw_content|content_text|full_content)\b/i)
  })

  it('bounds derived payloads, evidence, strings, usage, retries, and expiry', () => {
    expect(migration).toMatch(/octet_length\(semantic_payload::text\) <= 65536/i)
    expect(migration).toMatch(/octet_length\(classification_payload::text\) <= 32768/i)
    expect(migration).toMatch(/jsonb_array_length\(evidence_json\) <= 12/i)
    expect(migration).toMatch(/octet_length\(evidence_json::text\) <= 16384/i)
    expect(migration).toMatch(/char_length\(collector_entry_ref\) between 1 and 2048/i)
    expect(migration).toMatch(/char_length\(semantic_provider\) <= 32/i)
    expect(migration).toMatch(/char_length\(semantic_model\) <= 200/i)
    expect(migration).toMatch(/input_tokens\s+integer[\s\S]*input_tokens >= 0/i)
    expect(migration).toMatch(/output_tokens\s+integer[\s\S]*output_tokens >= 0/i)
    expect(migration).toMatch(/retry_count\s+integer\s+not null\s+default 0[\s\S]*retry_count between 0 and 10/i)
    expect(migration).toMatch(/expires_at > created_at/i)
  })

  it('enforces lifecycle, idempotence, reuse, ordering, and generation uniqueness', () => {
    expect(migration).toMatch(/processing_status\s+text\s+not null[\s\S]*in\s*\('pending',\s*'enriched',\s*'skipped',\s*'failed'\)/i)
    expect(migration).toMatch(/classification_status\s+text\s+not null[\s\S]*in\s*\('pending',\s*'classified',\s*'skipped',\s*'failed'\)/i)
    expect(migration).toMatch(/unique\s*\(collector_entry_id\)/i)
    expect(migration).toMatch(/unique\s*\(enrichment_id,\s*classifier_version\)/i)
    expect(migration).toMatch(/unique\s*\(generation_id,\s*kind,\s*result_key,\s*strategy_version\)/i)
    expect(migration).toMatch(/create index[\s\S]*content_hash,\s*semantic_version[\s\S]*processing_status/i)
    expect(migration).toMatch(/create index[\s\S]*content_hash,\s*classifier_version[\s\S]*classification_status/i)
    expect(migration).toMatch(/create index[\s\S]*generation_id,\s*kind,\s*score desc/i)
  })

  it('provides an atomic fenced lease and active-generation publish contract', () => {
    expect(migration).toMatch(/create or replace function public\.claim_explore_discovery_refresh/i)
    expect(migration).toMatch(/lease_expires_at < now\(\)/i)
    expect(migration).toMatch(/create or replace function public\.finish_explore_discovery_refresh/i)
    expect(migration).toMatch(/where scope = 'public_explore'[\s\S]*lease_id = p_lease_id/i)
    expect(migration).toMatch(/create or replace function public\.publish_explore_discovery_generation/i)
    expect(migration).toMatch(/jsonb_to_recordset\(p_items\)/i)
    expect(migration).toMatch(/active_generation_id = p_generation_id/i)
    expect(migration).toMatch(/lease_id = null[\s\S]*lease_expires_at = null/i)
    expect(migration).not.toMatch(/delete from public\.explore_discovery_items[\s\S]*active_generation_id = p_generation_id/i)
  })

  it('resets only scan state when provider-backed target versions change', () => {
    expect(providerVersionMigration).toMatch(/create or replace function public\.claim_explore_discovery_refresh/i)
    expect(providerVersionMigration).toMatch(/target_semantic_version\s+is distinct from\s+p_semantic_version/i)
    expect(providerVersionMigration).toMatch(/watermark_entry_id\s*=\s*case[\s\S]*then 0/i)
    expect(providerVersionMigration).toMatch(/watermark_changed_entry_id\s*=\s*case[\s\S]*then 0/i)
    expect(providerVersionMigration).toMatch(/watermark_changed_scan_cutoff\s*=\s*case[\s\S]*then null/i)
    expect(providerVersionMigration).not.toMatch(/active_generation_id\s*=\s*null/i)
  })

  it('atomically rejects publication from a stale provider configuration', () => {
    expect(providerVersionMigration).toMatch(/p_semantic_version\s+text/i)
    expect(providerVersionMigration).toMatch(/p_classifier_version\s+text/i)
    expect(providerVersionMigration).toMatch(/state\.target_semantic_version\s*=\s*p_semantic_version/i)
    expect(providerVersionMigration).toMatch(/state\.target_classifier_version\s*=\s*p_classifier_version/i)
    expect(databaseTypes).toMatch(/publish_explore_discovery_generation:[\s\S]*p_semantic_version:\s*string/i)
    expect(databaseTypes).toMatch(/publish_explore_discovery_generation:[\s\S]*p_classifier_version:\s*string/i)
  })

  it('moves every derived table and refresh RPC to an explicit fund boundary', () => {
    for (const table of TABLES) {
      expect(fundScopeMigration).toMatch(new RegExp(
        `alter table public\\.${table}[\\s\\S]*?add column fund_id uuid not null`,
        'i',
      ))
      expect(databaseTypes).toMatch(new RegExp(
        `${table}:\\s*\\{[\\s\\S]*?Row:\\s*\\{[\\s\\S]*?fund_id:\\s*string`,
        'i',
      ))
      expect(databaseTypes).toMatch(new RegExp(
        `${table}:\\s*\\{[\\s\\S]*?Insert:\\s*\\{[\\s\\S]*?fund_id:\\s*string`,
        'i',
      ))
    }

    expect(fundScopeMigration).toMatch(/unique\s*\(fund_id,\s*collector_entry_id\)/i)
    expect(fundScopeMigration).toMatch(/unique\s*\(fund_id,\s*collector_entry_ref\)/i)
    expect(fundScopeMigration).toMatch(/foreign key\s*\(fund_id,\s*enrichment_id\)[\s\S]*references public\.explore_article_enrichments\s*\(fund_id,\s*id\)/i)
    expect(fundScopeMigration).toMatch(/unique\s*\(fund_id,\s*enrichment_id,\s*classifier_version\)/i)
    expect(fundScopeMigration).toMatch(/unique\s*\(fund_id,\s*generation_id,\s*kind,\s*result_key,\s*strategy_version\)/i)
    expect(fundScopeMigration).toMatch(/primary key\s*\(fund_id,\s*scope\)/i)

    expect(fundScopeMigration).toMatch(/drop function if exists public\.claim_explore_discovery_refresh\s*\(uuid,\s*integer,\s*text,\s*text\)/i)
    expect(fundScopeMigration).toMatch(/drop function if exists public\.finish_explore_discovery_refresh\s*\(uuid,\s*bigint,\s*timestamptz,\s*bigint,\s*timestamptz,\s*text\)/i)
    expect(fundScopeMigration).toMatch(/create function public\.claim_explore_discovery_refresh\s*\(\s*p_fund_id uuid/i)
    expect(fundScopeMigration).toMatch(/create function public\.finish_explore_discovery_refresh\s*\(\s*p_fund_id uuid/i)
    expect(fundScopeMigration).toMatch(/create function public\.publish_explore_discovery_generation\s*\(\s*p_fund_id uuid/i)
    expect(fundScopeMigration).toMatch(/state\.fund_id\s*=\s*p_fund_id/i)
    expect(fundScopeMigration).toMatch(/insert into public\.explore_discovery_items\s*\(\s*fund_id,/i)

    expect(databaseTypes).toMatch(/claim_explore_discovery_refresh:[\s\S]*p_fund_id:\s*string/i)
    expect(databaseTypes).toMatch(/finish_explore_discovery_refresh:[\s\S]*p_fund_id:\s*string/i)
    expect(databaseTypes).toMatch(/publish_explore_discovery_generation:[\s\S]*p_fund_id:\s*string/i)
  })

  it('keeps fund-scoped RPCs service-role only and removes global overloads', () => {
    for (const fn of [
      'claim_explore_discovery_refresh',
      'finish_explore_discovery_refresh',
      'publish_explore_discovery_generation',
    ]) {
      expect(fundScopeMigration).toMatch(new RegExp(`revoke all on function public\\.${fn}[^;]+ from public, anon, authenticated`, 'i'))
      expect(fundScopeMigration).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]+ to service_role`, 'i'))
    }
    expect(fundScopeMigration).not.toMatch(/default\s+['\"]?[0-9a-f]{8}-[0-9a-f-]{27,}['\"]?/i)
  })

  it('claims one bounded round-robin fund page through a service-role-only cursor RPC', () => {
    expect(schedulerCursorMigration).toMatch(/create table public\.explore_discovery_schedule_state/i)
    expect(schedulerCursorMigration).toMatch(/cursor_fund_id uuid references public\.funds\(id\) on delete set null/i)
    expect(schedulerCursorMigration).toMatch(/for update/i)
    expect(schedulerCursorMigration).toMatch(/limit p_limit/i)
    expect(schedulerCursorMigration).toMatch(/p_limit not between 1 and 100/i)
    expect(schedulerCursorMigration).toMatch(/eligible\.fund_id > cursor_id/i)
    expect(schedulerCursorMigration).toMatch(/eligible\.fund_id <= cursor_id/i)
    expect(schedulerCursorMigration).toMatch(/revoke all on function public\.next_feed_discovery_funds\(integer\) from public, anon, authenticated/i)
    expect(schedulerCursorMigration).toMatch(/grant execute on function public\.next_feed_discovery_funds\(integer\) to service_role/i)
    expect(databaseTypes).toMatch(/next_feed_discovery_funds:[\s\S]*p_limit\?: number[\s\S]*fund_id: string/i)
  })

  it('schedules validated Ollama Funds without weakening encrypted-provider requirements', () => {
    expect(ollamaSchedulerMigration).toMatch(/when 'ollama' then settings\.ollama_base_url is not null[\s\S]*settings\.ollama_model is not null/i)
    for (const provider of ['anthropic', 'openai', 'gemini', 'openrouter']) {
      expect(ollamaSchedulerMigration).toMatch(new RegExp(
        `when '${provider}' then settings\\.encryption_key_encrypted is not null`,
        'i',
      ))
    }
    expect(ollamaSchedulerMigration).toMatch(/security definer[\s\S]*set search_path = ''/i)
    expect(ollamaSchedulerMigration).toMatch(/revoke all on function public\.next_feed_discovery_funds\(integer\) from public, anon, authenticated/i)
    expect(ollamaSchedulerMigration).toMatch(/grant execute on function public\.next_feed_discovery_funds\(integer\) to service_role/i)
  })

  it('denies Data API clients and exposes only reviewed service-role access', () => {
    for (const table of TABLES) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(migration).toMatch(new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'))
      expect(migration).toMatch(new RegExp(`grant (?:all|select, insert, update, delete) on table public\\.${table} to service_role`, 'i'))
    }
    for (const fn of [
      'claim_explore_discovery_refresh',
      'finish_explore_discovery_refresh',
      'publish_explore_discovery_generation',
    ]) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}[^;]+ from public`, 'i'))
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]+ to service_role`, 'i'))
    }
  })

  it('keeps generated Row, Insert, Update, and function result types in sync', () => {
    for (const table of TABLES) {
      expect(databaseTypes).toMatch(new RegExp(`${table}:\\s*\\{[\\s\\S]*?Row:\\s*\\{`, 'i'))
      expect(databaseTypes).toMatch(new RegExp(`${table}:\\s*\\{[\\s\\S]*?Insert:\\s*\\{`, 'i'))
      expect(databaseTypes).toMatch(new RegExp(`${table}:\\s*\\{[\\s\\S]*?Update:\\s*\\{`, 'i'))
    }
    expect(databaseTypes).toMatch(/claim_explore_discovery_refresh:/i)
    expect(databaseTypes).toMatch(/finish_explore_discovery_refresh:/i)
    expect(databaseTypes).toMatch(/publish_explore_discovery_generation:/i)
    expect(databaseTypes).toMatch(/p_watermark_changed_entry_id:\s*number/i)
    expect(databaseTypes).toMatch(/p_watermark_changed_scan_cutoff:\s*string\s*\|\s*null/i)
  })
})
