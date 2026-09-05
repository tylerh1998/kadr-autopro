-- Add attachments column to SmsMessage
ALTER TABLE public."SmsMessage" ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Create storage bucket for SMS media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('sms-media', 'sms-media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for sms-media bucket
-- Allow public viewing
CREATE POLICY "Public Access to SMS Media" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'sms-media');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload SMS Media" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'sms-media' AND auth.role() = 'authenticated');

-- Allow edge functions (service_role) to upload
CREATE POLICY "Service Role can upload SMS Media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sms-media');

