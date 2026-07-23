-- Internal compliance items do not always have an external regulation URL.
alter table public.compliance_items
  alter column regulation_url drop not null;
