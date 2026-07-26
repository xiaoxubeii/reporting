-- Fund Resend attachments use a separate private bucket. The legacy
-- email-attachments policies assume `{inbound_email_uuid}/...`; Fund email must
-- finish route-token and recipient routing before it has an inbound email row.
-- No object policies are intentionally created: only the service role used by
-- the signed webhook and session-checked download APIs may access this bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'fund-email-inbound-attachments',
  'fund-email-inbound-attachments',
  false,
  10485760
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760;
