CREATE OR REPLACE FUNCTION get_sms_conversations()
RETURNS TABLE (
  external_phone TEXT,
  customer_id TEXT,
  customer_name TEXT,
  last_activity TIMESTAMP WITH TIME ZONE,
  last_message TEXT,
  is_unread BOOLEAN
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
    COALESCE(r.customer_id, c.id::text) AS customer_id,
    COALESCE(c.org_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer_name,
    r.created_at AS last_activity,
    r.body AS last_message,
    COALESCE((
      SELECT bool_or(NOT m2.is_read) 
      FROM public."SmsMessage" m2 
      WHERE (m2.from_phone = r.external_phone OR m2.to_phone = r.external_phone) 
        AND m2.direction = 'inbound'
    ), false) AS is_unread
  FROM ranked r
  LEFT JOIN public."Customer" c 
    ON c.id::text = r.customer_id 
    OR (r.customer_id IS NULL AND (c.phone = r.external_phone OR c.secondary_phone = r.external_phone))
  WHERE r.rn = 1
  ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

