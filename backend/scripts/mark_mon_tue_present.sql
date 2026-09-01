-- Monday 2026-08-31 only: every check-in is arrived early (Present).
-- Also sets that day's session official start to 11:00 so the weekly grid
-- cannot still mark 09:00 arrivals as Late. Checkout times are left in place.

BEGIN;

UPDATE attendance_sessions
SET official_start = TIME '11:00'
WHERE session_date = DATE '2026-08-31';

UPDATE attendance_records AS ar
SET
    minutes_late = 0,
    status = 'PRESENT',
    check_in_at = ((sess.session_date + TIME '09:00') AT TIME ZONE 'Africa/Dar_es_Salaam')
FROM attendance_sessions AS sess
WHERE sess.id = ar.session_id
  AND sess.session_date = DATE '2026-08-31';

SELECT ar.status, COUNT(*) AS records, COUNT(*) FILTER (WHERE ar.minutes_late > 0) AS still_late
FROM attendance_records AS ar
JOIN attendance_sessions AS sess ON sess.id = ar.session_id
WHERE sess.session_date = DATE '2026-08-31'
GROUP BY ar.status;

COMMIT;
