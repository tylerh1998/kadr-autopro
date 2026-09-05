CREATE TABLE IF NOT EXISTS public."SmsMessage" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "direction" TEXT NOT NULL CHECK ("direction" IN ('inbound', 'outbound')),
    "from_phone" TEXT NOT NULL,
    "to_phone" TEXT NOT NULL,
    "body" TEXT,
    "is_read" BOOLEAN DEFAULT false NOT NULL,
    "status" TEXT DEFAULT 'received' CHECK ("status" IN ('received', 'queued', 'sent', 'failed')),
    "twilio_message_sid" TEXT UNIQUE,
    "customer_id" TEXT,
    "work_order_id" TEXT,
    "error_message" TEXT,
    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- Index for fast phone number lookups
CREATE INDEX IF NOT EXISTS "idx_sms_phone_numbers" ON public."SmsMessage" ("from_phone", "to_phone");

-- Index for unread filtering
CREATE INDEX IF NOT EXISTS "idx_sms_unread" ON public."SmsMessage" ("is_read") WHERE "is_read" = false;

-- Make sure sms_enabled exists on Employee just in case
ALTER TABLE public."Employee" ADD COLUMN IF NOT EXISTS "sms_enabled" BOOLEAN DEFAULT false;

