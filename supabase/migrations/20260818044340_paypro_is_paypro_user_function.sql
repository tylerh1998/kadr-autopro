CREATE OR REPLACE FUNCTION public.is_paypro_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."Employee"
    WHERE mykadr_user_id = auth.uid()
      AND paypro_user IS TRUE
  )
$function$;
