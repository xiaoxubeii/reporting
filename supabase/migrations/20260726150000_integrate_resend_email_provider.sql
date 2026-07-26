-- Integrate Fund Resend with the existing inbound/outbound provider settings.
-- New outbound credentials remain authoritative in fund_settings. The service-only
-- credential row owns the Fund domain identity and managed inbound webhook state;
-- sending_api_key_encrypted is retained only for read-only legacy compatibility.

alter table public.fund_settings
  drop constraint if exists fund_settings_inbound_email_provider_check;

alter table public.fund_settings
  add constraint fund_settings_inbound_email_provider_check
    check (inbound_email_provider is null or inbound_email_provider in ('postmark', 'mailgun', 'resend'));

alter table public.fund_email_provider_credentials
  drop constraint if exists fund_email_provider_credentials_capability_check;

alter table public.fund_email_provider_credentials
  add constraint fund_email_provider_credentials_capability_check
    check (
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
        and provider_webhook_id is not null
      )
    );

create or replace function public.fund_email_configure_identity(
  p_fund_id uuid,
  p_slug text,
  p_domain text,
  p_actor_user_id uuid
)
returns public.fund_email_provider_credentials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.funds;
  v_existing public.fund_email_provider_credentials;
  v_connection public.fund_email_provider_credentials;
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
  then
    raise exception using errcode = '22023', message = 'Invalid Fund email identity';
  end if;
  if v_fund.email_subdomain is not null and v_fund.email_subdomain <> p_slug then
    raise exception using errcode = '23505', message = 'Fund email slug conflict';
  end if;

  select credentials.* into v_existing
  from public.fund_email_provider_credentials as credentials
  where credentials.fund_id = p_fund_id
  for update;

  if v_existing.id is not null and (
    v_existing.status <> 'enabled' or v_existing.domain <> p_domain
  ) then
    raise exception using errcode = '40001', message = 'Fund email identity changed concurrently';
  end if;

  update public.funds
  set email_subdomain = p_slug
  where id = p_fund_id;

  insert into public.fund_email_provider_credentials (
    fund_id, domain, created_by, updated_by
  ) values (
    p_fund_id, p_domain, p_actor_user_id, p_actor_user_id
  )
  on conflict (fund_id) do update
  set updated_by = p_actor_user_id,
      updated_at = now()
  returning * into v_connection;

  -- Clear the legacy duplicate only after the authoritative provider setting
  -- actually contains a Resend key. Domain setup alone must not destroy it.
  if exists (
    select 1 from public.fund_settings as settings
    where settings.fund_id = p_fund_id
      and settings.resend_api_key_encrypted is not null
  ) then
    update public.fund_email_provider_credentials
    set sending_api_key_encrypted = null,
        updated_by = p_actor_user_id,
        updated_at = now()
    where fund_id = p_fund_id
    returning * into v_connection;
  end if;

  perform public.fund_email_ensure_reserved_mailboxes(p_fund_id);
  return v_connection;
end;
$$;

create or replace function public.fund_email_begin_receiving_disconnect(
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
  v_revision timestamptz;
begin
  select credentials.* into v_connection
  from public.fund_email_provider_credentials as credentials
  where credentials.fund_id = p_fund_id
  for update;

  if v_connection.id is null
    or v_connection.receiving_api_key_encrypted is null
    or v_connection.provider_webhook_id is distinct from p_expected_provider_webhook_id
    or v_connection.updated_at is distinct from p_expected_updated_at
  then
    return null;
  end if;

  update public.fund_email_provider_credentials
  set receiving_status = 'failed',
      last_error_code = 'receiving_disconnect_pending',
      updated_by = p_actor_user_id,
      updated_at = clock_timestamp()
  where fund_id = p_fund_id
  returning updated_at into v_revision;

  return v_revision;
end;
$$;

create or replace function public.fund_email_finalize_receiving_disconnect(
  p_fund_id uuid,
  p_expected_provider_webhook_id text,
  p_expected_updated_at timestamptz,
  p_actor_user_id uuid
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
    or v_connection.receiving_status <> 'failed'
    or v_connection.provider_webhook_id is distinct from p_expected_provider_webhook_id
    or v_connection.updated_at is distinct from p_expected_updated_at
  then
    return false;
  end if;

  update public.fund_email_provider_credentials
  set receiving_api_key_encrypted = null,
      webhook_secret_encrypted = null,
      route_token_hash = null,
      provider_webhook_id = null,
      previous_route_token_hash = null,
      previous_route_expires_at = null,
      receiving_status = 'pending',
      last_error_code = null,
      updated_by = p_actor_user_id,
      updated_at = now()
  where fund_id = p_fund_id;

  return true;
end;
$$;

create or replace function public.fund_email_mark_outbound_submitted(
  p_fund_id uuid,
  p_connection_id uuid,
  p_message_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.fund_email_messages;
begin
  if p_provider_message_id is null
    or char_length(p_provider_message_id) not between 1 and 240
    or p_provider_message_id ~ E'[\r\n]'
  then
    raise exception using errcode = '22023', message = 'Invalid outbound provider message ID';
  end if;

  select messages.* into v_message
  from public.fund_email_messages as messages
  where messages.id = p_message_id
    and messages.fund_id = p_fund_id
    and messages.direction = 'outbound'
  for update;

  if v_message.id is null then return false; end if;
  if v_message.provider_message_id is not null
    and v_message.provider_message_id is distinct from p_provider_message_id
  then
    raise exception using errcode = '22023', message = 'Outbound provider identity conflict';
  end if;

  update public.fund_email_messages
  set provider_message_id = p_provider_message_id,
      provider_submitted_at = coalesce(provider_submitted_at, now()),
      routing_status = 'routed',
      updated_at = now()
  where id = p_message_id and fund_id = p_fund_id;

  if p_connection_id is not null then
    update public.fund_email_provider_credentials
    set sending_status = 'verified',
        last_error_code = null,
        last_verified_at = now(),
        updated_at = now()
    where id = p_connection_id and fund_id = p_fund_id;
    if not found then
      raise exception using errcode = '23503', message = 'Fund email connection not found';
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.fund_email_configure_identity(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fund_email_configure_identity(uuid, text, text, uuid)
  to service_role;

revoke all on function public.fund_email_begin_receiving_disconnect(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.fund_email_begin_receiving_disconnect(uuid, text, timestamptz, uuid)
  to service_role;

revoke all on function public.fund_email_finalize_receiving_disconnect(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.fund_email_finalize_receiving_disconnect(uuid, text, timestamptz, uuid)
  to service_role;

revoke all on function public.fund_email_mark_outbound_submitted(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fund_email_mark_outbound_submitted(uuid, uuid, uuid, text)
  to service_role;
