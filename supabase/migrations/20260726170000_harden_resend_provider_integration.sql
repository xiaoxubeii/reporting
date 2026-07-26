-- Keep a single authoritative Resend sending key in fund_settings and expose a
-- service-role-only transition used by the existing provider settings API.
-- Legacy ciphertext uses different AAD and must be decrypted and re-encrypted
-- by the application before this atomic transition is called.

drop function if exists public.fund_email_set_authoritative_resend_key(uuid, text);

create or replace function public.fund_email_set_authoritative_resend_key(
  p_fund_id uuid,
  p_resend_api_key_encrypted text,
  p_update_outbound_provider boolean,
  p_outbound_email_provider text,
  p_update_asks_provider boolean,
  p_asks_email_provider text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(p_resend_api_key_encrypted), '') is null then
    raise exception using errcode = '22023', message = 'Invalid Resend API key ciphertext';
  end if;

  update public.fund_settings
  set resend_api_key_encrypted = p_resend_api_key_encrypted,
      outbound_email_provider = case
        when p_update_outbound_provider then p_outbound_email_provider
        else outbound_email_provider
      end,
      asks_email_provider = case
        when p_update_asks_provider then p_asks_email_provider
        else asks_email_provider
      end
  where fund_id = p_fund_id;
  if not found then return false; end if;

  update public.fund_email_provider_credentials
  set sending_api_key_encrypted = null,
      updated_at = now()
  where fund_id = p_fund_id
    and sending_api_key_encrypted is not null;

  return true;
end;
$$;

revoke all on function public.fund_email_set_authoritative_resend_key(uuid, text, boolean, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.fund_email_set_authoritative_resend_key(uuid, text, boolean, text, boolean, text)
  to service_role;

create or replace function public.fund_email_promote_legacy_resend_key(
  p_fund_id uuid,
  p_resend_api_key_encrypted text,
  p_expected_sending_api_key_encrypted text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(p_resend_api_key_encrypted), '') is null
    or nullif(trim(p_expected_sending_api_key_encrypted), '') is null then
    raise exception using errcode = '22023', message = 'Invalid Resend API key ciphertext';
  end if;

  update public.fund_settings as settings
  set resend_api_key_encrypted = p_resend_api_key_encrypted
  from public.fund_email_provider_credentials as credentials
  where settings.fund_id = p_fund_id
    and settings.asks_email_provider = 'resend'
    and settings.resend_api_key_encrypted is null
    and credentials.fund_id = settings.fund_id
    and credentials.sending_api_key_encrypted = p_expected_sending_api_key_encrypted;
  if not found then return false; end if;

  update public.fund_email_provider_credentials
  set sending_api_key_encrypted = null,
      updated_at = now()
  where fund_id = p_fund_id
    and sending_api_key_encrypted = p_expected_sending_api_key_encrypted;
  if not found then
    raise exception using errcode = '40001', message = 'Resend credential changed during promotion';
  end if;

  return true;
end;
$$;

revoke all on function public.fund_email_promote_legacy_resend_key(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fund_email_promote_legacy_resend_key(uuid, text, text)
  to service_role;
