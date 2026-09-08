CREATE OR REPLACE FUNCTION trigger_link_sms_customer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.customer_id := (
      SELECT id::text
      FROM public."Customer"
      WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g'), 10) = RIGHT(NEW.from_phone, 10)
         OR RIGHT(REGEXP_REPLACE(COALESCE(secondary_phone, ''), '\D', '', 'g'), 10) = RIGHT(NEW.from_phone, 10)
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS link_sms_customer_trigger ON public."SmsMessage";

CREATE TRIGGER link_sms_customer_trigger
BEFORE INSERT ON public."SmsMessage"
FOR EACH ROW
EXECUTE FUNCTION trigger_link_sms_customer();
