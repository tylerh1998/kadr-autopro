-- Create the PartsTechCart staging table
CREATE TABLE public."PartsTechCart" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wo_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' or 'processed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public."PartsTechCart" ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
CREATE POLICY "Allow authenticated users to read PartsTechCart"
ON public."PartsTechCart" FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to update PartsTechCart"
ON public."PartsTechCart" FOR UPDATE
TO authenticated
USING (true);

-- The Edge Functions will use the service_role key, which bypasses RLS,
-- so they can insert records without needing specific policies here.
