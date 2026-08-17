-- Production counterpart of 20260817013753_add_authorized_by_name_to_approvals.sql,
-- applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned its
-- own migration version for the identical SQL -- see master_context.md's note
-- on the two Supabase projects having independent migration histories.
alter table "Approvals" add column authorized_by_name text;
