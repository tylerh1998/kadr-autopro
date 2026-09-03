-- Migration: Device-Session PIN Authentication & RLS Update
-- Description: Adds pin_hash and current_session_id to UserDevices, updates staff_strong_auth,
-- and adds RPC functions for registering and stamping device PIN sessions.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Add pin_hash and current_session_id to UserDevices
ALTER TABLE public."UserDevices"
  ADD COLUMN IF NOT EXISTS pin_hash text NULL,
  ADD COLUMN IF NOT EXISTS current_session_id uuid NULL;

-- 2. Index current_session_id for instant RLS lookups
CREATE INDEX IF NOT EXISTS idx_user_devices_current_session_id 
  ON public."UserDevices" USING btree (current_session_id) TABLESPACE pg_default;

-- 3. Update public.staff_strong_auth() to accept active device sessions
CREATE OR REPLACE FUNCTION public.staff_strong_auth()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT
    -- 1. Standard TOTP MFA (aal2)
    coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'

    -- 2. Native Passkey / WebAuthn
    OR exists (
      SELECT 1
      FROM jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) am
      WHERE (am->>'method') ILIKE '%webauthn%' OR (am->>'method') ILIKE '%passkey%'
    )

    -- 3. Active Registered Device Session
    OR exists (
      SELECT 1
      FROM public."UserDevices" ud
      WHERE ud.user_id = auth.uid()
        AND ud.current_session_id = (auth.jwt()->>'session_id')::uuid
        AND ud.is_revoked = false
    );
$$;

COMMENT ON FUNCTION public.staff_strong_auth() IS
  'True when the calling session satisfied TOTP MFA (aal2), native passkey, or has an active registered device session in UserDevices. Used as RESTRICTIVE RLS gate on staff tables.';

-- 4. RPC function to register a device PIN (Called during Phase 4)
CREATE OR REPLACE FUNCTION public.register_device_pin(
  p_device_uuid uuid,
  p_device_name text,
  p_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_session_id uuid;
  v_pin_hash text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_pin IS NULL OR length(trim(p_pin)) != 4 OR p_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  IF p_device_uuid IS NULL THEN
    RAISE EXCEPTION 'Device UUID is required';
  END IF;

  -- Extract current session ID if available
  BEGIN
    v_session_id := (auth.jwt()->>'session_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_session_id := NULL;
  END;

  -- Hash the 4-digit PIN using bcrypt with a high-cost factor
  v_pin_hash := extensions.crypt(p_pin, extensions.gen_salt('bf', 10));

  -- Upsert device record
  INSERT INTO public."UserDevices" (
    user_id,
    device_uuid,
    device_name,
    pin_hash,
    current_session_id,
    last_active_at,
    is_revoked
  )
  VALUES (
    v_user_id,
    p_device_uuid,
    coalesce(p_device_name, 'Trusted Device'),
    v_pin_hash,
    v_session_id,
    now(),
    false
  )
  ON CONFLICT (device_uuid) DO UPDATE SET
    user_id = v_user_id,
    device_name = coalesce(EXCLUDED.device_name, public."UserDevices".device_name),
    pin_hash = EXCLUDED.pin_hash,
    current_session_id = EXCLUDED.current_session_id,
    last_active_at = now(),
    is_revoked = false;

  RETURN true;
END;
$$;

-- 5. RPC function to verify a PIN and stamp the active session
CREATE OR REPLACE FUNCTION public.verify_and_stamp_device_session(
  p_device_uuid uuid,
  p_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_session_id uuid;
  v_device record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_pin IS NULL OR length(trim(p_pin)) != 4 THEN
    RETURN false;
  END IF;

  -- Find device
  SELECT id, user_id, pin_hash, is_revoked INTO v_device
  FROM public."UserDevices"
  WHERE device_uuid = p_device_uuid;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_device.is_revoked IS TRUE THEN
    RETURN false;
  END IF;

  IF v_device.user_id != v_user_id THEN
    RETURN false;
  END IF;

  -- Verify PIN against bcrypt hash
  IF v_device.pin_hash IS NULL OR v_device.pin_hash != extensions.crypt(p_pin, v_device.pin_hash) THEN
    RETURN false;
  END IF;

  -- Extract session_id
  BEGIN
    v_session_id := (auth.jwt()->>'session_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_session_id := NULL;
  END;

  -- Stamp current session onto device
  UPDATE public."UserDevices"
  SET current_session_id = v_session_id,
      last_active_at = now()
  WHERE id = v_device.id;

  RETURN true;
END;
$$;
