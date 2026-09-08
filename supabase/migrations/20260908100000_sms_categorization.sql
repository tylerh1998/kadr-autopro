CREATE TABLE IF NOT EXISTS public."SmsConversationMetadata" (
    "external_phone" TEXT PRIMARY KEY,
    "category" TEXT,
    "is_archived" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public."SmsConversationMetadata" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users on SmsConversationMetadata"
    ON public."SmsConversationMetadata" FOR ALL USING (auth.role() = 'authenticated');

-- Modify get_sms_conversations to include category and is_archived
DROP FUNCTION IF EXISTS get_sms_conversations();
CREATE OR REPLACE FUNCTION get_sms_conversations()
RETURNS TABLE (
  external_phone TEXT,
  customer_id TEXT,
  customer_name TEXT,
  last_activity TIMESTAMP WITH TIME ZONE,
  last_message TEXT,
  is_unread BOOLEAN,
  category TEXT,
  is_archived BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH expanded AS (
    SELECT 
      m.id,
      CASE WHEN m.direction = 'inbound' THEN m.from_phone ELSE m.to_phone END AS external_phone,
      m.customer_id,
      m.created_at,
      m.body,
      m.is_read,
      m.direction
    FROM public."SmsMessage" m
  ),
  ranked AS (
    SELECT 
      e.external_phone,
      e.customer_id,
      e.created_at,
      e.body,
      e.is_read,
      e.direction,
      ROW_NUMBER() OVER(PARTITION BY e.external_phone ORDER BY e.created_at DESC) as rn
    FROM expanded e
  )
  SELECT 
    r.external_phone,
    COALESCE(r.customer_id, cust.id::text) AS customer_id,
    COALESCE(cust.org_name, NULLIF(TRIM(CONCAT(cust.first_name, ' ', cust.last_name)), '')) AS customer_name,
    r.created_at AS last_activity,
    r.body AS last_message,
    COALESCE((
      SELECT bool_or(NOT m2.is_read) 
      FROM public."SmsMessage" m2 
      WHERE (m2.from_phone = r.external_phone OR m2.to_phone = r.external_phone) 
        AND m2.direction = 'inbound'
    ), false) AS is_unread,
    meta.category,
    COALESCE(meta.is_archived, false) AS is_archived
  FROM ranked r
  LEFT JOIN LATERAL (
    SELECT id, org_name, first_name, last_name 
    FROM public."Customer" c
    WHERE c.id::text = r.customer_id
       OR (r.customer_id IS NULL AND (
             RIGHT(REGEXP_REPLACE(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = r.external_phone 
          OR RIGHT(REGEXP_REPLACE(COALESCE(c.secondary_phone, ''), '\D', '', 'g'), 10) = r.external_phone
       ))
    LIMIT 1
  ) cust ON true
  LEFT JOIN public."SmsConversationMetadata" meta ON meta.external_phone = r.external_phone
  WHERE r.rn = 1
  ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically unarchive when a new inbound message arrives
CREATE OR REPLACE FUNCTION unarchive_sms_on_inbound()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.direction = 'inbound' THEN
        INSERT INTO public."SmsConversationMetadata" (external_phone, is_archived)
        VALUES (NEW.from_phone, false)
        ON CONFLICT (external_phone) 
        DO UPDATE SET is_archived = false, updated_at = timezone('utc'::text, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_unarchive_sms_on_inbound ON public."SmsMessage";
CREATE TRIGGER trigger_unarchive_sms_on_inbound
AFTER INSERT ON public."SmsMessage"
FOR EACH ROW
EXECUTE FUNCTION unarchive_sms_on_inbound();
