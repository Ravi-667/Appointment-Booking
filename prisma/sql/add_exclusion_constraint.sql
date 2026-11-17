-- =============================================================================
-- Migration: Add exclusion constraint to prevent double bookings
-- Run this migration or execute it directly in PostgreSQL:
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_double_booking;

ALTER TABLE bookings ADD CONSTRAINT no_double_booking
EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(start_time, end_time, '[)') WITH &&
)
WHERE (status NOT IN ('CANCELLED', 'PAYMENT_FAILED', 'RESCHEDULED'));
