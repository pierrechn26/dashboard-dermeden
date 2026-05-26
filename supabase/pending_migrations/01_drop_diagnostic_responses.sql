-- ============================================================
-- Bloc 1 — Drop legacy diagnostic_responses table
-- ============================================================
-- The diagnostic_responses table is the legacy single-table format that
-- predated diagnostic_sessions + diagnostic_items. It has been superseded
-- since template_transformation_lot1 (2026-04-15) and is no longer written
-- to or read by any edge function or frontend component.
--
-- Apply this migration after remix + Lovable Cloud activation.

DROP TABLE IF EXISTS public.diagnostic_responses CASCADE;
