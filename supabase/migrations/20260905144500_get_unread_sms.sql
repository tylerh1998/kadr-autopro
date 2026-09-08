CREATE OR REPLACE FUNCTION get_unread_sms()
RETURNS TABLE (
  id UUID,
  from_phone TEXT,
  body TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  sender_name TEXT,
  attachments JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.from_phone,
    m.body,
    m.created_at,
    COALESCE(
      NULLIF(TRIM(cust.org_name), ''), 
      NULLIF(TRIM(CONCAT(cust.first_name, ' ', cust.last_name)), '')
    ) AS sender_name,
    m.attachments
  FROM public."SmsMessage" m
  LEFT JOIN LATERAL (
    SELECT id, org_name, first_name, last_name 
    FROM public."Customer" c
    WHERE c.id::text = m.customer_id
       OR (m.customer_id IS NULL AND (
             RIGHT(REGEXP_REPLACE(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = m.from_phone 
          OR RIGHT(REGEXP_REPLACE(COALESCE(c.secondary_phone, ''), '\D', '', 'g'), 10) = m.from_phone
       ))
    LIMIT 1
  ) cust ON true
  WHERE m.is_read = false AND m.direction = 'inbound'
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

