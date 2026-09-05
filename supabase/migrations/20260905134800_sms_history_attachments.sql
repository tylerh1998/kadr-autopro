CREATE OR REPLACE FUNCTION get_sms_history(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  direction TEXT,
  from_phone TEXT,
  to_phone TEXT,
  body TEXT,
  is_read BOOLEAN,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  customer_id TEXT,
  work_order_id TEXT,
  twilio_message_sid TEXT,
  created_by_id UUID,
  created_by_name TEXT,
  attachments JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.direction,
    m.from_phone,
    m.to_phone,
    m.body,
    m.is_read,
    m.status,
    m.created_at,
    m.customer_id,
    m.work_order_id,
    m.twilio_message_sid,
    m.created_by_id,
    m.created_by_name,
    m.attachments
  FROM public."SmsMessage" m
  WHERE m.from_phone = p_phone OR m.to_phone = p_phone
  ORDER BY m.created_at ASC
  LIMIT 500;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

