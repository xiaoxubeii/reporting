-- Multi-tenant Resend mail infrastructure.
--
-- Platform mail remains environment-owned. These tables contain only per-Fund
-- BYOK connections and are deliberately unavailable through the Data API.

alter table public.funds
  add column if not exists email_subdomain text;

alter table public.inbound_deals
  drop constraint if exists inbound_deals_intro_source_check;

alter table public.inbound_deals
  add constraint inbound_deals_intro_source_check check (
    intro_source is null or intro_source in (
      'referral', 'cold', 'warm_intro', 'accelerator',
      'demo_day', 'event', 'heartbeat', 'email', 'other'
    )
  );

alter table public.funds
  drop constraint if exists funds_email_subdomain_check;

alter table public.funds
  add constraint funds_email_subdomain_check check (
    email_subdomain is null
    or (
      email_subdomain = lower(email_subdomain)
      and char_length(email_subdomain) between 1 and 63
      and email_subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    )
  );

create unique index funds_email_subdomain_key
  on public.funds (lower(email_subdomain))
  where email_subdomain is not null;

create table public.fund_email_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  provider text not null default 'resend' check (provider = 'resend'),
  domain text not null check (
    domain = lower(domain)
    and char_length(domain) between 3 and 253
    and domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  provider_domain_id text check (
    provider_domain_id is null or char_length(provider_domain_id) between 1 and 200
  ),
  sending_api_key_encrypted text not null,
  receiving_api_key_encrypted text not null,
  webhook_secret_encrypted text not null,
  route_token_hash text not null check (route_token_hash ~ '^[a-f0-9]{64}$'),
  previous_route_token_hash text check (
    previous_route_token_hash is null or previous_route_token_hash ~ '^[a-f0-9]{64}$'
  ),
  previous_route_expires_at timestamptz,
  status text not null default 'enabled' check (status in ('enabled', 'disabled', 'error')),
  domain_status text not null default 'pending'
    check (domain_status in ('pending', 'verified', 'failed')),
  sending_status text not null default 'pending'
    check (sending_status in ('pending', 'verified', 'failed')),
  receiving_status text not null default 'pending'
    check (receiving_status in ('pending', 'verified', 'failed')),
  dns_records jsonb not null default '[]'::jsonb check (jsonb_typeof(dns_records) = 'array'),
  last_verified_at timestamptz,
  last_error_code text check (
    last_error_code is null or (
      char_length(last_error_code) between 1 and 100
      and last_error_code ~ '^[a-z0-9_]+$'
    )
  ),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id),
  unique (id, fund_id)
  ,constraint fund_email_provider_credentials_previous_route_check check (
    (previous_route_token_hash is null and previous_route_expires_at is null)
    or (previous_route_token_hash is not null and previous_route_expires_at is not null)
  )
);

create unique index fund_email_provider_credentials_domain_key
  on public.fund_email_provider_credentials (lower(domain));

create unique index fund_email_provider_credentials_route_token_key
  on public.fund_email_provider_credentials (route_token_hash);

create unique index fund_email_provider_credentials_previous_route_token_key
  on public.fund_email_provider_credentials (previous_route_token_hash)
  where previous_route_token_hash is not null;

create table public.fund_email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  local_part text not null check (
    local_part = lower(local_part)
    and char_length(local_part) between 1 and 64
    and local_part ~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$'
  ),
  kind text not null check (kind in ('user', 'pitch', 'expert', 'shared')),
  user_id uuid,
  display_name text not null check (
    char_length(display_name) between 1 and 120
    and display_name !~ E'[\r\n]'
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, local_part),
  unique (id, fund_id),
  foreign key (fund_id, user_id)
    references public.fund_members (fund_id, user_id) on delete cascade,
  constraint fund_email_mailboxes_owner_check check (
    (kind = 'user' and user_id is not null and local_part not in ('pitch', 'expert'))
    or (kind <> 'user' and user_id is null)
  ),
  constraint fund_email_mailboxes_reserved_check check (
    (kind = 'pitch' and local_part = 'pitch')
    or (kind = 'expert' and local_part = 'expert')
    or kind in ('user', 'shared')
  )
);

create unique index fund_email_mailboxes_user_key
  on public.fund_email_mailboxes (fund_id, user_id)
  where user_id is not null;

create table public.fund_email_threads (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  mailbox_id uuid not null,
  purpose text not null check (purpose in ('general', 'pitch', 'expert_invitation', 'system')),
  context_type text check (
    context_type is null or context_type in ('inbound_deal', 'diligence_expert_request')
  ),
  context_id uuid,
  external_participant_address text check (
    external_participant_address is null
    or (
      char_length(external_participant_address) between 3 and 320
      and external_participant_address !~ E'[\r\n]'
    )
  ),
  subject text check (
    subject is null or (char_length(subject) <= 998 and subject !~ E'[\r\n]')
  ),
  status text not null default 'open' check (status in ('open', 'closed', 'quarantined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, fund_id),
  foreign key (mailbox_id, fund_id)
    references public.fund_email_mailboxes (id, fund_id) on delete restrict,
  constraint fund_email_threads_context_check check (
    (context_type is null and context_id is null)
    or (context_type is not null and context_id is not null)
  )
);

create index fund_email_threads_mailbox_idx
  on public.fund_email_threads (fund_id, mailbox_id, updated_at desc);

create index fund_email_threads_context_idx
  on public.fund_email_threads (fund_id, context_type, context_id)
  where context_type is not null;

alter table public.inbound_emails
  add constraint inbound_emails_id_fund_key unique (id, fund_id);

create table public.fund_email_messages (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  thread_id uuid not null,
  mailbox_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'resend' check (provider = 'resend'),
  provider_message_id text check (
    provider_message_id is null or char_length(provider_message_id) between 1 and 240
  ),
  internet_message_id text check (
    internet_message_id is null or (
      char_length(internet_message_id) between 3 and 998
      and internet_message_id !~ E'[\r\n]'
    )
  ),
  in_reply_to text check (
    in_reply_to is null or (
      char_length(in_reply_to) between 3 and 998
      and in_reply_to !~ E'[\r\n]'
    )
  ),
  message_references text[] not null default '{}',
  from_address text not null check (
    char_length(from_address) between 3 and 320 and from_address !~ E'[\r\n]'
  ),
  to_addresses text[] not null check (cardinality(to_addresses) between 1 and 50),
  cc_addresses text[] not null default '{}' check (cardinality(cc_addresses) <= 50),
  bcc_addresses text[] not null default '{}' check (cardinality(bcc_addresses) <= 50),
  reply_to_address text check (
    reply_to_address is null or (
      char_length(reply_to_address) between 3 and 320
      and reply_to_address !~ E'[\r\n]'
    )
  ),
  subject text check (
    subject is null or (char_length(subject) <= 998 and subject !~ E'[\r\n]')
  ),
  text_body text check (text_body is null or octet_length(text_body) <= 1048576),
  html_body_untrusted text check (
    html_body_untrusted is null or octet_length(html_body_untrusted) <= 2097152
  ),
  attachment_metadata jsonb not null default '[]'::jsonb check (
    jsonb_typeof(attachment_metadata) = 'array'
    and octet_length(attachment_metadata::text) <= 1048576
  ),
  routing_status text not null default 'pending'
    check (routing_status in ('pending', 'routed', 'unroutable', 'quarantined', 'failed')),
  inbound_email_id uuid,
  idempotency_key text check (
    idempotency_key is null or (
      char_length(idempotency_key) between 16 and 200
      and idempotency_key ~ '^[A-Za-z0-9:_-]+$'
    )
  ),
  provider_submitted_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, fund_id),
  unique (fund_id, provider, provider_message_id),
  unique (fund_id, idempotency_key),
  foreign key (thread_id, fund_id)
    references public.fund_email_threads (id, fund_id) on delete cascade,
  foreign key (mailbox_id, fund_id)
    references public.fund_email_mailboxes (id, fund_id) on delete restrict,
  foreign key (inbound_email_id, fund_id)
    references public.inbound_emails (id, fund_id) on delete set null
);

create index fund_email_messages_thread_idx
  on public.fund_email_messages (fund_id, thread_id, created_at);

create index fund_email_messages_rfc_idx
  on public.fund_email_messages (fund_id, internet_message_id)
  where internet_message_id is not null;

create table public.fund_email_reply_routes (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  thread_id uuid not null,
  mailbox_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, fund_id),
  foreign key (thread_id, fund_id)
    references public.fund_email_threads (id, fund_id) on delete cascade,
  foreign key (mailbox_id, fund_id)
    references public.fund_email_mailboxes (id, fund_id) on delete cascade,
  constraint fund_email_reply_routes_expiry_check check (
    expires_at is null or expires_at > created_at
  )
);

create index fund_email_reply_routes_active_idx
  on public.fund_email_reply_routes (fund_id, token_hash)
  where revoked_at is null;

create table public.fund_email_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  fund_id uuid not null references public.funds(id) on delete cascade,
  svix_id text not null check (char_length(svix_id) between 1 and 240),
  provider_email_id text not null check (char_length(provider_email_id) between 1 and 240),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempt_id uuid not null default gen_random_uuid(),
  attempts integer not null default 1 check (attempts between 1 and 20),
  lease_expires_at timestamptz not null default (now() + interval '2 minutes'),
  disposition text check (
    disposition is null or disposition in ('routed', 'unroutable', 'quarantined', 'ignored')
  ),
  last_error_code text check (
    last_error_code is null or (
      char_length(last_error_code) between 1 and 100
      and last_error_code ~ '^[a-z0-9_]+$'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (connection_id, svix_id),
  unique (connection_id, provider_email_id),
  foreign key (connection_id, fund_id)
    references public.fund_email_provider_credentials (id, fund_id) on delete cascade
);

create index fund_email_webhook_events_retry_idx
  on public.fund_email_webhook_events (status, lease_expires_at)
  where status in ('processing', 'failed');

-- Preserve provider linkage on the existing screening/audit record without
-- making general email content directly accessible to authenticated clients.
alter table public.inbound_emails
  add column if not exists provider text,
  add column if not exists provider_email_id text,
  add column if not exists to_address text,
  add column if not exists email_thread_id uuid,
  add column if not exists internet_message_id text,
  add column if not exists in_reply_to text,
  add column if not exists message_references text[] not null default '{}';

alter table public.inbound_emails
  add constraint inbound_emails_email_thread_fund_fkey
  foreign key (email_thread_id, fund_id)
  references public.fund_email_threads (id, fund_id) on delete set null;

alter table public.diligence_expert_requests
  add column if not exists email_thread_id uuid;

alter table public.diligence_expert_requests
  add constraint diligence_expert_requests_email_thread_fund_fkey
  foreign key (email_thread_id, fund_id)
  references public.fund_email_threads (id, fund_id) on delete set null;

create unique index inbound_emails_provider_message_key
  on public.inbound_emails (fund_id, provider, provider_email_id)
  where provider is not null and provider_email_id is not null;

create or replace function public.fund_email_reject_connected_slug_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email_subdomain is distinct from old.email_subdomain
    and exists (
      select 1
      from public.fund_email_provider_credentials as credentials
      where credentials.fund_id = old.id
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Fund email subdomain cannot change while a provider connection exists';
  end if;
  return new;
end;
$$;

create trigger funds_reject_connected_email_subdomain_change
before update of email_subdomain on public.funds
for each row execute function public.fund_email_reject_connected_slug_change();

create or replace function public.fund_email_ensure_reserved_mailboxes(p_fund_id uuid)
returns setof public.fund_email_mailboxes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.funds where id = p_fund_id) then
    raise exception using errcode = '23503', message = 'Fund not found';
  end if;

  insert into public.fund_email_mailboxes (fund_id, local_part, kind, display_name)
  values
    (p_fund_id, 'pitch', 'pitch', 'Pitch'),
    (p_fund_id, 'expert', 'expert', 'Expert')
  on conflict (fund_id, local_part) do nothing;

  return query
  select mailboxes.*
  from public.fund_email_mailboxes as mailboxes
  where mailboxes.fund_id = p_fund_id
    and mailboxes.local_part in ('pitch', 'expert')
  order by mailboxes.local_part;
end;
$$;

create or replace function public.fund_email_create_connection(
  p_fund_id uuid,
  p_slug text,
  p_domain text,
  p_sending_api_key_encrypted text,
  p_receiving_api_key_encrypted text,
  p_webhook_secret_encrypted text,
  p_route_token_hash text,
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
    or p_route_token_hash !~ '^[a-f0-9]{64}$'
    or p_sending_api_key_encrypted is null
    or p_receiving_api_key_encrypted is null
    or p_webhook_secret_encrypted is null
  then
    raise exception using errcode = '22023', message = 'Invalid Fund email connection';
  end if;
  if v_fund.email_subdomain is not null and v_fund.email_subdomain <> p_slug then
    raise exception using errcode = '23505', message = 'Fund email slug conflict';
  end if;
  if exists (
    select 1 from public.fund_email_provider_credentials as credentials
    where credentials.fund_id = p_fund_id
  ) then
    raise exception using errcode = '23505', message = 'Fund email connection exists';
  end if;

  update public.funds
  set email_subdomain = p_slug
  where id = p_fund_id;

  insert into public.fund_email_provider_credentials (
    fund_id,
    domain,
    sending_api_key_encrypted,
    receiving_api_key_encrypted,
    webhook_secret_encrypted,
    route_token_hash,
    created_by,
    updated_by
  ) values (
    p_fund_id,
    p_domain,
    p_sending_api_key_encrypted,
    p_receiving_api_key_encrypted,
    p_webhook_secret_encrypted,
    p_route_token_hash,
    p_actor_user_id,
    p_actor_user_id
  )
  returning * into v_connection;

  insert into public.fund_email_mailboxes (fund_id, local_part, kind, display_name)
  values
    (p_fund_id, 'pitch', 'pitch', 'Pitch'),
    (p_fund_id, 'expert', 'expert', 'Expert')
  on conflict (fund_id, local_part) do nothing;

  return v_connection;
end;
$$;

create or replace function public.fund_email_rotate_webhook_route(
  p_fund_id uuid,
  p_route_token_hash text,
  p_actor_user_id uuid,
  p_overlap_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  if p_route_token_hash !~ '^[a-f0-9]{64}$'
    or p_overlap_seconds not between 60 and 3600
  then
    raise exception using errcode = '22023', message = 'Invalid webhook route rotation';
  end if;

  update public.fund_email_provider_credentials
  set previous_route_token_hash = route_token_hash,
      previous_route_expires_at = now() + make_interval(secs => p_overlap_seconds),
      route_token_hash = p_route_token_hash,
      updated_by = p_actor_user_id,
      updated_at = now()
  where fund_id = p_fund_id;

  v_updated := found;
  return v_updated;
end;
$$;

create or replace function public.fund_email_set_user_mailbox(
  p_fund_id uuid,
  p_user_id uuid,
  p_local_part text,
  p_display_name text
)
returns public.fund_email_mailboxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mailbox public.fund_email_mailboxes;
begin
  if not exists (
    select 1
    from public.fund_members as members
    where members.fund_id = p_fund_id
      and members.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'Fund membership is required';
  end if;

  if p_local_part is null
    or p_local_part <> lower(p_local_part)
    or char_length(p_local_part) not between 1 and 64
    or p_local_part !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$'
    or p_local_part like '%..%'
    or p_local_part in (
      'abuse', 'admin', 'expert', 'mail', 'no-reply', 'noreply',
      'pitch', 'postmaster', 'security', 'support', 'system'
    )
    or p_display_name is null
    or char_length(p_display_name) not between 1 and 120
    or p_display_name ~ E'[\r\n]'
  then
    raise exception using errcode = '22023', message = 'Invalid Fund mailbox';
  end if;

  insert into public.fund_email_mailboxes (
    fund_id,
    local_part,
    kind,
    user_id,
    display_name,
    active
  ) values (
    p_fund_id,
    p_local_part,
    'user',
    p_user_id,
    p_display_name,
    true
  )
  on conflict (fund_id, user_id) where user_id is not null
  do update set
    local_part = excluded.local_part,
    kind = 'user',
    display_name = excluded.display_name,
    active = true,
    updated_at = now()
  returning * into v_mailbox;

  return v_mailbox;
end;
$$;

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
  p_reply_token_hash text,
  p_idempotency_key text
)
returns table (
  message_id uuid,
  thread_id uuid,
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
    if v_message.mailbox_id <> p_mailbox_id
      or v_message.from_address <> p_from_address
      or v_message.to_addresses <> p_to_addresses
      or v_message.cc_addresses <> coalesce(p_cc_addresses, '{}')
      or v_message.bcc_addresses <> coalesce(p_bcc_addresses, '{}')
      or v_message.subject is distinct from p_subject
      or v_message.text_body is distinct from p_text_body
      or v_message.html_body_untrusted is distinct from p_html_body_untrusted
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
    v_message.idempotency_key,
    v_message.provider_message_id,
    coalesce(v_prior_ids, '{}');
end;
$$;

create or replace function public.fund_email_store_inbound_message(
  p_fund_id uuid,
  p_mailbox_id uuid,
  p_thread_id uuid,
  p_purpose text,
  p_provider_message_id text,
  p_internet_message_id text,
  p_in_reply_to text,
  p_message_references text[],
  p_from_address text,
  p_to_addresses text[],
  p_cc_addresses text[],
  p_bcc_addresses text[],
  p_reply_to_address text,
  p_subject text,
  p_text_body text,
  p_html_body_untrusted text,
  p_attachment_metadata jsonb,
  p_received_at timestamptz
)
returns table (
  message_id uuid,
  thread_id uuid,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.fund_email_messages;
  v_thread public.fund_email_threads;
begin
  if p_purpose not in ('general', 'pitch', 'expert_invitation', 'system')
    or p_provider_message_id is null
    or char_length(p_provider_message_id) not between 1 and 240
    or p_internet_message_id is null
    or char_length(p_internet_message_id) not between 3 and 998
    or p_attachment_metadata is null
    or jsonb_typeof(p_attachment_metadata) <> 'array'
    or octet_length(p_attachment_metadata::text) > 1048576
  then
    raise exception using errcode = '22023', message = 'Invalid inbound Fund email';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fund-email-inbound:' || p_fund_id::text || ':' || p_provider_message_id,
      0
    )
  );

  select messages.* into v_message
  from public.fund_email_messages as messages
  where messages.fund_id = p_fund_id
    and messages.provider = 'resend'
    and messages.provider_message_id = p_provider_message_id;

  if v_message.id is not null then
    return query select v_message.id, v_message.thread_id, true;
    return;
  end if;

  if not exists (
    select 1
    from public.fund_email_mailboxes as mailboxes
    where mailboxes.id = p_mailbox_id
      and mailboxes.fund_id = p_fund_id
      and mailboxes.active
  ) then
    raise exception using errcode = '23503', message = 'Inbound mailbox not found';
  end if;

  if p_thread_id is not null then
    select threads.* into v_thread
    from public.fund_email_threads as threads
    where threads.id = p_thread_id
      and threads.fund_id = p_fund_id
      and threads.mailbox_id = p_mailbox_id
    for update;

    if v_thread.id is null then
      raise exception using errcode = '23503', message = 'Inbound thread not found';
    end if;
  else
    insert into public.fund_email_threads (
      fund_id,
      mailbox_id,
      purpose,
      external_participant_address,
      subject
    ) values (
      p_fund_id,
      p_mailbox_id,
      p_purpose,
      p_from_address,
      p_subject
    )
    returning * into v_thread;
  end if;

  begin
    insert into public.fund_email_messages (
      fund_id,
      thread_id,
      mailbox_id,
      direction,
      provider,
      provider_message_id,
      internet_message_id,
      in_reply_to,
      message_references,
      from_address,
      to_addresses,
      cc_addresses,
      bcc_addresses,
      reply_to_address,
      subject,
      text_body,
      html_body_untrusted,
      attachment_metadata,
      routing_status,
      received_at
    ) values (
      p_fund_id,
      v_thread.id,
      p_mailbox_id,
      'inbound',
      'resend',
      p_provider_message_id,
      p_internet_message_id,
      p_in_reply_to,
      coalesce(p_message_references, '{}'),
      p_from_address,
      p_to_addresses,
      coalesce(p_cc_addresses, '{}'),
      coalesce(p_bcc_addresses, '{}'),
      p_reply_to_address,
      p_subject,
      p_text_body,
      p_html_body_untrusted,
      p_attachment_metadata,
      'routed',
      p_received_at
    )
    returning * into v_message;
  exception when unique_violation then
    select messages.* into v_message
    from public.fund_email_messages as messages
    where messages.fund_id = p_fund_id
      and messages.provider = 'resend'
      and messages.provider_message_id = p_provider_message_id;
    if v_message.id is null then raise; end if;
  end;

  update public.fund_email_threads
  set updated_at = greatest(updated_at, p_received_at)
  where id = v_message.thread_id
    and fund_id = p_fund_id;

  return query select v_message.id, v_message.thread_id, false;
end;
$$;

-- Membership deletion must never be blocked by historical mail threads. Keep
-- the mailbox as an inactive audit identity while removing its live owner.
create or replace function public.fund_email_detach_deleted_member_mailbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fund_email_mailboxes
  set user_id = null,
      kind = 'shared',
      active = false,
      updated_at = now()
  where fund_id = old.fund_id
    and user_id = old.user_id;
  return old;
end;
$$;

create trigger fund_members_detach_email_mailbox
before delete on public.fund_members
for each row execute function public.fund_email_detach_deleted_member_mailbox();

create or replace function public.fund_email_claim_webhook_event(
  p_route_token_hash text,
  p_svix_id text,
  p_provider_email_id text,
  p_lease_seconds integer default 120
)
returns public.fund_email_webhook_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.fund_email_provider_credentials;
  v_event public.fund_email_webhook_events;
begin
  if p_route_token_hash !~ '^[a-f0-9]{64}$'
    or p_svix_id is null
    or char_length(p_svix_id) not between 1 and 240
    or p_provider_email_id is null
    or char_length(p_provider_email_id) not between 1 and 240
    or p_lease_seconds not between 30 and 900
  then
    raise exception using errcode = '22023', message = 'Invalid webhook event claim';
  end if;

  select credentials.* into v_connection
  from public.fund_email_provider_credentials as credentials
  where (
      credentials.route_token_hash = p_route_token_hash
      or (
        credentials.previous_route_token_hash = p_route_token_hash
        and credentials.previous_route_expires_at > now()
      )
    )
    and credentials.status = 'enabled'
    and credentials.domain_status = 'verified'
    and credentials.receiving_status = 'verified';

  if v_connection.id is null then
    return null;
  end if;

  insert into public.fund_email_webhook_events (
    connection_id,
    fund_id,
    svix_id,
    provider_email_id,
    lease_expires_at
  ) values (
    v_connection.id,
    v_connection.fund_id,
    p_svix_id,
    p_provider_email_id,
    now() + make_interval(secs => p_lease_seconds)
  )
  on conflict do nothing
  returning * into v_event;

  if v_event.id is not null then
    return v_event;
  end if;

  select events.* into v_event
  from public.fund_email_webhook_events as events
  where events.connection_id = v_connection.id
    and (
      events.svix_id = p_svix_id
      or events.provider_email_id = p_provider_email_id
    )
  order by events.created_at
  limit 1
  for update skip locked;

  if v_event.id is null then
    return null;
  end if;

  if v_event.svix_id = p_svix_id
    and v_event.provider_email_id is distinct from p_provider_email_id
  then
    raise exception using errcode = '22023', message = 'Webhook event identity conflict';
  end if;

  if v_event.status = 'completed'
    or (v_event.status = 'processing' and v_event.lease_expires_at > now())
    or v_event.attempts >= 20
  then
    return null;
  end if;

  update public.fund_email_webhook_events
  set status = 'processing',
      attempt_id = gen_random_uuid(),
      attempts = attempts + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      disposition = null,
      last_error_code = null,
      completed_at = null,
      updated_at = now()
  where id = v_event.id
    and (
      status = 'failed'
      or (status = 'processing' and lease_expires_at <= now())
    )
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.fund_email_complete_webhook_event(
  p_event_id uuid,
  p_attempt_id uuid,
  p_disposition text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  if p_disposition not in ('routed', 'unroutable', 'quarantined', 'ignored') then
    raise exception using errcode = '22023', message = 'Invalid webhook disposition';
  end if;

  update public.fund_email_webhook_events
  set status = 'completed',
      disposition = p_disposition,
      completed_at = now(),
      updated_at = now()
  where id = p_event_id
    and attempt_id = p_attempt_id
    and status = 'processing'
    and lease_expires_at > now();

  v_updated := found;
  return v_updated;
end;
$$;

create or replace function public.fund_email_fail_webhook_event(
  p_event_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  if p_error_code is null
    or char_length(p_error_code) not between 1 and 100
    or p_error_code !~ '^[a-z0-9_]+$'
  then
    raise exception using errcode = '22023', message = 'Invalid webhook error code';
  end if;

  update public.fund_email_webhook_events
  set status = 'failed',
      last_error_code = p_error_code,
      lease_expires_at = now(),
      updated_at = now()
  where id = p_event_id
    and attempt_id = p_attempt_id
    and status = 'processing';

  v_updated := found;
  return v_updated;
end;
$$;

create trigger fund_email_provider_credentials_set_updated_at
before update on public.fund_email_provider_credentials
for each row execute function public.set_updated_at();

create trigger fund_email_mailboxes_set_updated_at
before update on public.fund_email_mailboxes
for each row execute function public.set_updated_at();

create trigger fund_email_threads_set_updated_at
before update on public.fund_email_threads
for each row execute function public.set_updated_at();

create trigger fund_email_messages_set_updated_at
before update on public.fund_email_messages
for each row execute function public.set_updated_at();

create trigger fund_email_webhook_events_set_updated_at
before update on public.fund_email_webhook_events
for each row execute function public.set_updated_at();

alter table public.fund_email_provider_credentials enable row level security;
alter table public.fund_email_mailboxes enable row level security;
alter table public.fund_email_threads enable row level security;
alter table public.fund_email_messages enable row level security;
alter table public.fund_email_reply_routes enable row level security;
alter table public.fund_email_webhook_events enable row level security;

revoke all on public.fund_email_provider_credentials from public, anon, authenticated;
revoke all on public.fund_email_mailboxes from public, anon, authenticated;
revoke all on public.fund_email_threads from public, anon, authenticated;
revoke all on public.fund_email_messages from public, anon, authenticated;
revoke all on public.fund_email_reply_routes from public, anon, authenticated;
revoke all on public.fund_email_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on public.fund_email_provider_credentials to service_role;
grant select, insert, update, delete on public.fund_email_mailboxes to service_role;
grant select, insert, update, delete on public.fund_email_threads to service_role;
grant select, insert, update, delete on public.fund_email_messages to service_role;
grant select, insert, update, delete on public.fund_email_reply_routes to service_role;
grant select, insert, update, delete on public.fund_email_webhook_events to service_role;

revoke all on function public.fund_email_reject_connected_slug_change()
  from public, anon, authenticated;
revoke all on function public.fund_email_ensure_reserved_mailboxes(uuid)
  from public, anon, authenticated;
revoke all on function public.fund_email_set_user_mailbox(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fund_email_create_connection(uuid, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.fund_email_rotate_webhook_route(uuid, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.fund_email_prepare_outbound_message(uuid, uuid, text, text, uuid, text, text, text, text[], text[], text[], text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.fund_email_store_inbound_message(uuid, uuid, uuid, text, text, text, text, text[], text, text[], text[], text[], text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fund_email_detach_deleted_member_mailbox()
  from public, anon, authenticated;
revoke all on function public.fund_email_claim_webhook_event(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.fund_email_complete_webhook_event(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.fund_email_fail_webhook_event(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.fund_email_ensure_reserved_mailboxes(uuid)
  to service_role;
grant execute on function public.fund_email_set_user_mailbox(uuid, uuid, text, text)
  to service_role;
grant execute on function public.fund_email_create_connection(uuid, text, text, text, text, text, text, uuid)
  to service_role;
grant execute on function public.fund_email_rotate_webhook_route(uuid, text, uuid, integer)
  to service_role;
grant execute on function public.fund_email_prepare_outbound_message(uuid, uuid, text, text, uuid, text, text, text, text[], text[], text[], text, text, text, text)
  to service_role;
grant execute on function public.fund_email_store_inbound_message(uuid, uuid, uuid, text, text, text, text, text[], text, text[], text[], text[], text, text, text, text, jsonb, timestamptz)
  to service_role;
grant execute on function public.fund_email_claim_webhook_event(text, text, text, integer)
  to service_role;
grant execute on function public.fund_email_complete_webhook_event(uuid, uuid, text)
  to service_role;
grant execute on function public.fund_email_fail_webhook_event(uuid, uuid, text)
  to service_role;
