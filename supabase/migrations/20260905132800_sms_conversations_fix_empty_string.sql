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
    COALESCE(r.customer_id, cust.id::text) AS customer_id,
    COALESCE(
      NULLIF(TRIM(cust.org_name), ''), 
      NULLIF(TRIM(CONCAT(cust.first_name, ' ', cust.last_name)), '')
    ) AS customer_name,
    r.created_at AS last_activity,
    r.body AS last_message,
    COALESCE((
      SELECT bool_or(NOT m2.is_read) 
      FROM public."SmsMessage" m2 
      WHERE (m2.from_phone = r.external_phone OR m2.to_phone = r.external_phone) 
        AND m2.direction = 'inbound'
    ), false) AS is_unread
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
  WHERE r.rn = 1
  ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

