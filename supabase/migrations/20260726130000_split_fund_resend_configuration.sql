-- Allow Fund Resend outbound and managed inbound capabilities to be configured
-- independently while keeping every credential service-role-only.

alter table public.fund_email_provider_credentials
  alter column sending_api_key_encrypted drop not null,
  alter column receiving_api_key_encrypted drop not null,
  alter column webhook_secret_encrypted drop not null,
  alter column route_token_hash drop not null,
  add column if not exists provider_webhook_id text;

alter table public.fund_email_provider_credentials
  add constraint fund_email_provider_credentials_provider_webhook_id_check
    check (
      provider_webhook_id is null
      or (
        char_length(provider_webhook_id) between 1 and 200
        and provider_webhook_id !~ '[[:cntrl:]]'
      )
    ),
  add constraint fund_email_provider_credentials_capability_check
    check (
      (
        sending_api_key_encrypted is not null
        or receiving_api_key_encrypted is not null
      )
      and (
        (
          receiving_api_key_encrypted is null
          and webhook_secret_encrypted is null
          and route_token_hash is null
          and provider_webhook_id is null
        )
        or (
          receiving_api_key_encrypted is not null
          and webhook_secret_encrypted is not null
          and route_token_hash is not null
        )
      )
    );

create or replace function public.fund_email_configure_sending(
  p_fund_id uuid,
  p_slug text,
  p_domain text,
  p_sending_api_key_encrypted text,
  p_actor_user_id uuid
)
returns public.fund_email_provider_credentials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.funds;
  v_connection public.fund_email_provider_credentials;
  v_existing public.fund_email_provider_credentials;
begin
  select funds.* into v_fund
  from public.funds as funds
  where funds.id = p_fund_id
  for update;

  if v_fund.id is null then
    raise exception using errcode = '23503', message = 'Fund not found';
  end if;
  if p_slug is null
    or p_slug <> lower(p_slug)
    or char_length(p_slug) not between 1 and 63
    or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    or p_domain is null
    or p_domain <> lower(p_domain)
    or p_domain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or p_sending_api_key_encrypted is null
  then
    raise exception using errcode = '22023', message = 'Invalid Fund email sending configuration';
  end if;
  if v_fund.email_subdomain is not null and v_fund.email_subdomain <> p_slug then
    raise exception using errcode = '23505', message = 'Fund email slug conflict';
  end if;
  if exists (
    select 1 from public.fund_email_provider_credentials as credentials
    where credentials.fund_id = p_fund_id and credentials.domain <> p_domain
  ) then
    raise exception using errcode = '23505', message = 'Fund email domain conflict';
  end if;

  select credentials.* into v_existing
  from public.fund_email_provider_credentials as credentials
  where credentials.fund_id = p_fund_id
  for update;

  if v_existing.id is not null and v_existing.status <> 'enabled' then
    raise exception using errcode = '40001', message = 'Fund email connection changed concurrently';
  end if;

  update public.funds set email_subdomain = p_slug where id = p_fund_id;

  insert into public.fund_email_provider_credentials (
    fund_id, domain, sending_api_key_encrypted, created_by, updated_by
  ) values (
    p_fund_id, p_domain, p_sending_api_key_encrypted, p_actor_user_id, p_actor_user_id
  )
  on conflict (fund_id) do update
  set sending_api_key_encrypted = excluded.sending_api_key_encrypted,
      sending_status = 'pending',
      last_error_code = null,
      updated_by = p_actor_user_id,
      updated_at = now()
  returning * into v_connection;

  perform public.fund_email_ensure_reserved_mailboxes(p_fund_id);
  return v_connection;
end;
$$;

create or replace function public.fund_email_configure_receiving(
  p_fund_id uuid,
  p_slug text,
  p_domain text,
  p_receiving_api_key_encrypted text,
  p_webhook_secret_encrypted text,
  p_route_token_hash text,
  p_provider_webhook_id text,
  p_expected_provider_webhook_id text,
  p_expected_updated_at timestamptz,
  p_provider_domain_id text,
  p_domain_status text,
  p_sending_status text,
  p_receiving_status text,
  p_dns_records jsonb,
  p_last_error_code text,
  p_actor_user_id uuid
)
returns public.fund_email_provider_credentials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.funds;
  v_connection public.fund_email_provider_credentials;
  v_existing public.fund_email_provider_credentials;
begin
  select funds.* into v_fund
  from public.funds as funds
  where funds.id = p_fund_id
  for update;

  if v_fund.id is null then
    raise exception using errcode = '23503', message = 'Fund not found';
  end if;
  if p_slug is null
    or p_slug <> lower(p_slug)
    or char_length(p_slug) not between 1 and 63
    or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    or p_domain is null
    or p_domain <> lower(p_domain)
    or p_domain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or p_receiving_api_key_encrypted is null
    or p_webhook_secret_encrypted is null
    or p_route_token_hash !~ '^[a-f0-9]{64}$'
    or p_provider_webhook_id is null
    or char_length(p_provider_webhook_id) not between 1 and 200
    or p_provider_webhook_id ~ '[[:cntrl:]]'
    or p_provider_domain_id is null
    or char_length(p_provider_domain_id) not between 1 and 200
    or p_domain_status not in ('pending', 'verified', 'failed')
    or p_sending_status not in ('pending', 'verified', 'failed')
    or p_receiving_status not in ('pending', 'verified', 'failed')
    or jsonb_typeof(p_dns_records) <> 'array'
    or (
      p_last_error_code is not null
      and (
        char_length(p_last_error_code) not between 1 and 100
        or p_last_error_code !~ '^[a-z0-9_]+$'
      )
    )
  then
    raise exception using errcode = '22023', message = 'Invalid Fund email receiving configuration';
  end if;
  if v_fund.email_subdomain is not null and v_fund.email_subdomain <> p_slug then
    raise exception using errcode = '23505', message = 'Fund email slug conflict';
  end if;
  if exists (
    select 1 from public.fund_email_provider_credentials as credentials
    where credentials.fund_id = p_fund_id and credentials.domain <> p_domain
  ) then
    raise exception using errcode = '23505', message = 'Fund email domain conflict';
  end if;

  select credentials.* into v_existing
  from public.fund_email_provider_credentials as credentials
  where credentials.fund_id = p_fund_id
  for update;

  if v_existing.id is null then
    if p_expected_provider_webhook_id is not null or p_expected_updated_at is not null then
      raise exception using errcode = '40001', message = 'Fund email webhook changed concurrently';
    end if;
  elsif v_existing.status <> 'enabled'
    or v_existing.provider_webhook_id is distinct from p_expected_provider_webhook_id
    or (
      v_existing.receiving_api_key_encrypted is not null
      and v_existing.updated_at is distinct from p_expected_updated_at
    )
  then
    raise exception using errcode = '40001', message = 'Fund email webhook changed concurrently';
  end if;

  update public.funds set email_subdomain = p_slug where id = p_fund_id;

  insert into public.fund_email_provider_credentials (
    fund_id, domain, receiving_api_key_encrypted, webhook_secret_encrypted,
    route_token_hash, provider_webhook_id, provider_domain_id,
    domain_status, sending_status, receiving_status, dns_records,
    last_error_code, last_verified_at, created_by, updated_by
  ) values (
    p_fund_id, p_domain, p_receiving_api_key_encrypted, p_webhook_secret_encrypted,
    p_route_token_hash, p_provider_webhook_id, p_provider_domain_id,
    p_domain_status, p_sending_status, p_receiving_status, p_dns_records,
    p_last_error_code, now(), p_actor_user_id, p_actor_user_id
  )
  on conflict (fund_id) do update
  set receiving_api_key_encrypted = excluded.receiving_api_key_encrypted,
      webhook_secret_encrypted = excluded.webhook_secret_encrypted,
      route_token_hash = excluded.route_token_hash,
      provider_webhook_id = excluded.provider_webhook_id,
      provider_domain_id = excluded.provider_domain_id,
      previous_route_token_hash = null,
      previous_route_expires_at = null,
      domain_status = excluded.domain_status,
      sending_status = excluded.sending_status,
      receiving_status = excluded.receiving_status,
      dns_records = excluded.dns_records,
      status = 'enabled',
      last_error_code = excluded.last_error_code,
      last_verified_at = now(),
      updated_by = p_actor_user_id,
      updated_at = now()
  returning * into v_connection;

  perform public.fund_email_ensure_reserved_mailboxes(p_fund_id);
  return v_connection;
end;
$$;

drop function if exists public.fund_email_delete_connection_if_webhook(uuid, text);

create or replace function public.fund_email_begin_delete(
  p_fund_id uuid,
  p_expected_provider_webhook_id text,
  p_expected_updated_at timestamptz,
  p_actor_user_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.fund_email_provider_credentials;
begin
  select credentials.* into v_connection
  from public.fund_email_provider_credentials as credentials
  where credentials.fund_id = p_fund_id
  for update;

  if v_connection.id is null
    or v_connection.provider_webhook_id is distinct from p_expected_provider_webhook_id
    or v_connection.updated_at is distinct from p_expected_updated_at
  then
    return null;
  end if;

  update public.fund_email_provider_credentials
  set status = 'disabled',
      updated_by = p_actor_user_id,
      updated_at = clock_timestamp()
  where fund_id = p_fund_id
  returning updated_at into p_expected_updated_at;

  return p_expected_updated_at;
end;
$$;

create or replace function public.fund_email_finalize_delete(
  p_fund_id uuid,
  p_expected_provider_webhook_id text,
  p_expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.fund_email_provider_credentials;
begin
  select credentials.* into v_connection
  from public.fund_email_provider_credentials as credentials
  where credentials.fund_id = p_fund_id
  for update;

  if v_connection.id is null
    or v_connection.status <> 'disabled'
    or v_connection.provider_webhook_id is distinct from p_expected_provider_webhook_id
    or v_connection.updated_at is distinct from p_expected_updated_at
  then
    return false;
  end if;

  delete from public.fund_email_provider_credentials where fund_id = p_fund_id;

  update public.funds
  set email_subdomain = null
  where id = p_fund_id;

  return true;
end;
$$;

revoke all on function public.fund_email_configure_sending(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fund_email_configure_sending(uuid, text, text, text, uuid)
  to service_role;

revoke all on function public.fund_email_configure_receiving(uuid, text, text, text, text, text, text, text, timestamptz, text, text, text, text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fund_email_configure_receiving(uuid, text, text, text, text, text, text, text, timestamptz, text, text, text, text, jsonb, text, uuid)
  to service_role;

revoke all on function public.fund_email_begin_delete(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.fund_email_begin_delete(uuid, text, timestamptz, uuid)
  to service_role;

revoke all on function public.fund_email_finalize_delete(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fund_email_finalize_delete(uuid, text, timestamptz)
  to service_role;
