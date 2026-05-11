
ALTER TABLE diagnostic_sessions DROP COLUMN IF EXISTS persona_detected;
ALTER TABLE diagnostic_sessions DROP COLUMN IF EXISTS persona_matching_score;
ALTER TABLE diagnostic_sessions DROP COLUMN IF EXISTS ai_key_messages;
ALTER TABLE diagnostic_sessions DROP COLUMN IF EXISTS ai_suggested_segment;
