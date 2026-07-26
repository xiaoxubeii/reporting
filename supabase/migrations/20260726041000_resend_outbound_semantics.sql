-- Close the durable outbound/reply loop without rewriting the already-applied
-- multi-tenant Resend migration.

drop function if exists public.fund_email_prepare_outbound_message(
  uuid, uuid, text, text, uuid, text, text, text, text[], text[], text[],
  text, text, text, text
);

create or replace function public.fund_email_prepare_outbound_message(
  p_fund_id uuid,
  p_mailbox_id uuid,
  p_purpose text,
  p_context_type text,
  p_context_id uuid,
  p_external_participant_address text,
  p_subject text,
  p_from_address text,
  p_to_addresses text[],
  p_cc_addresses text[],
  p_bcc_addresses text[],
  p_text_body text,
  p_html_body_untrusted text,
  p_internet_message_id text,
  p_reply_token_hash text,
  p_idempotency_key text
)
returns table (
  message_id uuid,
  thread_id uuid,
  internet_message_id text,
  idempotency_key text,
  provider_message_id text,
  prior_internet_message_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.fund_email_messages;
  v_thread public.fund_email_threads;
  v_prior_ids text[];
begin
  if p_reply_token_hash !~ '^[a-f0-9]{64}$'
    or p_internet_message_id is null
    or char_length(p_internet_message_id) not between 3 and 998
    or p_internet_message_id !~ '^<[^<>[:space:]]+>$'
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
    or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or p_purpose not in ('general', 'pitch', 'expert_invitation', 'system')
    or (p_context_type is null) <> (p_context_id is null)
  then
    raise exception using errcode = '22023', message = 'Invalid outbound Fund email';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fund-email-message:' || p_fund_id::text || ':' || p_idempotency_key, 0)
  );

  select messages.* into v_message
  from public.fund_email_messages as messages
  where messages.fund_id = p_fund_id
    and messages.idempotency_key = p_idempotency_key;

  if v_message.id is not null then
    select threads.* into v_thread
    from public.fund_email_threads as threads
    where threads.id = v_message.thread_id
      and threads.fund_id = p_fund_id;

    if v_thread.id is null
      or v_thread.purpose is distinct from p_purpose
      or v_thread.context_type is distinct from p_context_type
      or v_thread.context_id is distinct from p_context_id
      or v_thread.external_participant_address is distinct from p_external_participant_address
      or v_message.mailbox_id <> p_mailbox_id
      or v_message.internet_message_id is distinct from p_internet_message_id
      or v_message.from_address <> p_from_address
      or v_message.to_addresses <> p_to_addresses
      or v_message.cc_addresses <> coalesce(p_cc_addresses, '{}')
      or v_message.bcc_addresses <> coalesce(p_bcc_addresses, '{}')
      or v_message.subject is distinct from p_subject
      or v_message.text_body is distinct from p_text_body
      or v_message.html_body_untrusted is distinct from p_html_body_untrusted
      or not exists (
        select 1
        from public.fund_email_reply_routes as reply_routes
        where reply_routes.fund_id = p_fund_id
          and reply_routes.thread_id = v_message.thread_id
          and reply_routes.mailbox_id = p_mailbox_id
          and reply_routes.token_hash = p_reply_token_hash
          and reply_routes.revoked_at is null
          and (reply_routes.expires_at is null or reply_routes.expires_at > now())
      )
    then
      raise exception using errcode = '22023', message = 'Outbound idempotency conflict';
    end if;

    select coalesce(array_agg(previous.internet_message_id order by previous.created_at), '{}')
      into v_prior_ids
    from public.fund_email_messages as previous
    where previous.fund_id = p_fund_id
      and previous.thread_id = v_message.thread_id
      and previous.id <> v_message.id
      and previous.internet_message_id is not null;

    return query select
      v_message.id,
      v_message.thread_id,
      v_message.internet_message_id,
      v_message.idempotency_key,
      v_message.provider_message_id,
      coalesce(v_prior_ids, '{}');
    return;
  end if;

  if p_context_type is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'fund-email-thread:' || p_fund_id::text || ':' || p_context_type || ':'
          || p_context_id::text || ':' || p_mailbox_id::text || ':'
          || p_external_participant_address,
        0
      )
    );

    select threads.* into v_thread
    from public.fund_email_threads as threads
    where threads.fund_id = p_fund_id
      and threads.mailbox_id = p_mailbox_id
      and threads.purpose = p_purpose
      and threads.context_type = p_context_type
      and threads.context_id = p_context_id
      and threads.external_participant_address = p_external_participant_address
      and threads.status = 'open'
    order by threads.created_at
    limit 1
    for update;
  end if;

  if v_thread.id is null then
    insert into public.fund_email_threads (
      fund_id,
      mailbox_id,
      purpose,
      context_type,
      context_id,
      external_participant_address,
      subject
    ) values (
      p_fund_id,
      p_mailbox_id,
      p_purpose,
      p_context_type,
      p_context_id,
      p_external_participant_address,
      p_subject
    )
    returning * into v_thread;
  end if;

  insert into public.fund_email_reply_routes (
    fund_id,
    thread_id,
    mailbox_id,
    token_hash
  ) values (
    p_fund_id,
    v_thread.id,
    p_mailbox_id,
    p_reply_token_hash
  );

  insert into public.fund_email_messages (
    fund_id,
    thread_id,
    mailbox_id,
    direction,
    internet_message_id,
    from_address,
    to_addresses,
    cc_addresses,
    bcc_addresses,
    subject,
    text_body,
    html_body_untrusted,
    routing_status,
    idempotency_key
  ) values (
    p_fund_id,
    v_thread.id,
    p_mailbox_id,
    'outbound',
    p_internet_message_id,
    p_from_address,
    p_to_addresses,
    coalesce(p_cc_addresses, '{}'),
    coalesce(p_bcc_addresses, '{}'),
    p_subject,
    p_text_body,
    p_html_body_untrusted,
    'pending',
    p_idempotency_key
  )
  returning * into v_message;

  select coalesce(array_agg(previous.internet_message_id order by previous.created_at), '{}')
    into v_prior_ids
  from public.fund_email_messages as previous
  where previous.fund_id = p_fund_id
    and previous.thread_id = v_thread.id
    and previous.id <> v_message.id
    and previous.internet_message_id is not null;

  return query select
    v_message.id,
    v_thread.id,
    v_message.internet_message_id,
    v_message.idempotency_key,
    v_message.provider_message_id,
    coalesce(v_prior_ids, '{}');
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

  if v_message.id is null then
    return false;
  end if;
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
  where id = p_message_id
    and fund_id = p_fund_id;

  update public.fund_email_provider_credentials
  set sending_status = 'verified',
      last_error_code = null,
      last_verified_at = now(),
      updated_at = now()
  where id = p_connection_id
    and fund_id = p_fund_id;

  if not found then
    raise exception using errcode = '23503', message = 'Fund email connection not found';
  end if;
  return true;
end;
$$;

-- One provider email may create at most one screening record. Existing data is
-- never rewritten or deleted: deployments with historical duplicates fail
-- visibly here and require an operator decision before the constraint is added.
create unique index inbound_deals_email_id_key
  on public.inbound_deals (email_id);

revoke all on function public.fund_email_prepare_outbound_message(
  uuid, uuid, text, text, uuid, text, text, text, text[], text[], text[],
  text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.fund_email_mark_outbound_submitted(uuid, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.fund_email_prepare_outbound_message(
  uuid, uuid, text, text, uuid, text, text, text, text[], text[], text[],
  text, text, text, text, text
) to service_role;
grant execute on function public.fund_email_mark_outbound_submitted(uuid, uuid, uuid, text)
  to service_role;
