\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(command text, expected_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute command;
  exception when others then
    if position(expected_message in sqlerrm) = 0 then
      raise exception 'expected error containing %, got %', expected_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected command to fail: %', command;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000071', 'discovery-a@example.test'),
  ('00000000-0000-4000-8000-000000000072', 'discovery-b@example.test');

insert into public.funds (id, name, created_by)
values
  ('10000000-0000-4000-8000-000000000071', 'Discovery Fund A', '00000000-0000-4000-8000-000000000071'),
  ('10000000-0000-4000-8000-000000000072', 'Discovery Fund B', '00000000-0000-4000-8000-000000000072');

do $$
declare
  fund_a constant uuid := '10000000-0000-4000-8000-000000000071';
  fund_b constant uuid := '10000000-0000-4000-8000-000000000072';
  lease_a constant uuid := '20000000-0000-4000-8000-000000000071';
  lease_b constant uuid := '20000000-0000-4000-8000-000000000072';
  generation_a constant uuid := '30000000-0000-4000-8000-000000000071';
  enrichment_a uuid;
  acquired_a boolean;
  acquired_b boolean;
  acquired_a_again boolean;
  inserted_count integer;
begin
  perform pg_temp.assert_true(
    to_regprocedure('public.claim_explore_discovery_refresh(uuid,integer,text,text)') is null,
    'the deployment-global claim overload must be removed'
  );
  perform pg_temp.assert_true(
    to_regprocedure('public.finish_explore_discovery_refresh(uuid,bigint,timestamptz,bigint,timestamptz,text)') is null,
    'the deployment-global finish overload must be removed'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'authenticated',
      'public.claim_explore_discovery_refresh(uuid,uuid,integer,text,text)',
      'execute'
    ),
    'authenticated clients must not claim discovery refreshes'
  );
  perform pg_temp.assert_true(
    has_function_privilege(
      'service_role',
      'public.claim_explore_discovery_refresh(uuid,uuid,integer,text,text)',
      'execute'
    ),
    'service role must be able to claim discovery refreshes'
  );

  select acquired into acquired_a
    from public.claim_explore_discovery_refresh(fund_a, lease_a, 300, 'semantic-a', 'classifier-a');
  select acquired into acquired_b
    from public.claim_explore_discovery_refresh(fund_b, lease_b, 300, 'semantic-b', 'classifier-b');
  select acquired into acquired_a_again
    from public.claim_explore_discovery_refresh(
      fund_a,
      '20000000-0000-4000-8000-000000000073',
      300,
      'semantic-a',
      'classifier-a'
    );
  perform pg_temp.assert_true(acquired_a and acquired_b, 'different funds must hold independent leases');
  perform pg_temp.assert_true(not acquired_a_again, 'one fund must not hold two active leases');
  perform pg_temp.assert_true(
    not public.finish_explore_discovery_refresh(fund_b, lease_a, 0, null, 0, null, null),
    'a lease from Fund A must not finish Fund B state'
  );

  select public.publish_explore_discovery_generation(
    fund_a,
    lease_a,
    generation_a,
    '[{"kind":"trending","result_key":"topic-a","title":"Topic A","summary":"summary","score":75,"source_entry_refs":["miniflux-entry:1"],"evidence_json":[],"metadata_json":{},"strategy_version":"trending-v1"}]'::jsonb,
    'semantic-a',
    'classifier-a',
    1,
    now(),
    0,
    null,
    now(),
    now() + interval '1 day'
  ) into inserted_count;
  perform pg_temp.assert_true(inserted_count = 1, 'Fund A publish must insert one item');
  perform pg_temp.assert_true(
    (select active_generation_id = generation_a from public.explore_discovery_refresh_state where fund_id = fund_a),
    'Fund A active generation must switch atomically'
  );
  perform pg_temp.assert_true(
    (select active_generation_id is null from public.explore_discovery_refresh_state where fund_id = fund_b),
    'Fund A publish must not switch Fund B generation'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.explore_discovery_items where fund_id = fund_a and generation_id = generation_a),
    'published items must carry Fund A ownership'
  );

  insert into public.explore_article_enrichments (
    fund_id, collector_entry_id, collector_entry_ref, content_hash, title,
    source_ref, source_title, semantic_version, expires_at
  ) values (
    fund_a, 42, 'miniflux-entry:42', repeat('a', 64), 'Article A',
    'miniflux-feed:1', 'Source', 'semantic-a', now() + interval '1 day'
  ) returning id into enrichment_a;
  insert into public.explore_article_enrichments (
    fund_id, collector_entry_id, collector_entry_ref, content_hash, title,
    source_ref, source_title, semantic_version, expires_at
  ) values (
    fund_b, 42, 'miniflux-entry:42', repeat('a', 64), 'Article B',
    'miniflux-feed:1', 'Source', 'semantic-b', now() + interval '1 day'
  );
  perform pg_temp.assert_true(
    (select count(*) = 2 from public.explore_article_enrichments where collector_entry_id = 42),
    'the same collector article must be cacheable independently by two funds'
  );
  perform pg_temp.expect_error(
    format(
      'insert into public.explore_article_deal_classifications (fund_id, enrichment_id, content_hash, classifier_version, expires_at) values (%L, %L, %L, %L, now() + interval ''1 day'')',
      fund_b, enrichment_a, repeat('a', 64), 'classifier-b'
    ),
    'violates foreign key constraint'
  );
end;
$$;

rollback;
