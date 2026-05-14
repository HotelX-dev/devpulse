-- Migration: rename roles to owner / admin / member
-- Run in Supabase SQL editor (or psql) once.
--
-- Before: manager | management | member
-- After:  owner   | admin      | member

BEGIN;

UPDATE members SET role = 'owner' WHERE role = 'manager';
UPDATE members SET role = 'admin' WHERE role = 'management';

-- Verify
SELECT role, COUNT(*) FROM members GROUP BY role ORDER BY role;

COMMIT;
