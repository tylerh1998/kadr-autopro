-- Enable RLS (just in case it isn't already)
ALTER TABLE public."SmsMessage" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated employees to read/write all SMS messages
CREATE POLICY "Employees can view SMS messages" ON public."SmsMessage" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Employees can insert SMS messages" ON public."SmsMessage" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Employees can update SMS messages" ON public."SmsMessage" 
FOR UPDATE USING (auth.role() = 'authenticated');

