-- =============================================================
-- DevPulse — Phase 1: Seed Data
-- Run AFTER 01_schema.sql and 02_rls.sql
--
-- IMPORTANT: Members need matching Supabase Auth accounts.
-- Step 1 — Create auth users in Supabase Dashboard > Authentication > Users
--           Use the emails below and note the generated UUIDs.
-- Step 2 — Replace the placeholder UUIDs in this file with the real ones.
-- Step 3 — Run this script.
-- =============================================================

-- ─── PRODUCTS ────────────────────────────────────────────────
INSERT INTO products (name, code) VALUES
  ('HotelX',   'HOTEL'),
  ('MenuX',    'MENU'),
  ('EventX',   'EVENT')
ON CONFLICT (code) DO NOTHING;
-- ,
--   ('AccountX', 'ACCOUNT')
-- ─── MEMBERS ─────────────────────────────────────────────────
-- Replace each UUID below with the one Supabase Auth assigned
-- to that user's account (visible in Auth > Users table).
--
-- After creating auth users, you can fetch their UUIDs with:
--   SELECT id, email FROM auth.users ORDER BY created_at;

INSERT INTO members (id, name, email, role, avatar_color) VALUES
  -- Manager
  ('28b00ddc-db1d-4706-bd6a-66327d4227a4', 'Chia',     'pakmunchia@ifca.com.my',    'manager', '#A78BFA'),

  -- Senior Programmers
  ('00000000-0000-0000-0000-000000000002', 'Syafiq',   'muhammadsyafiq.abukasim@ifca.com.my',  'member',  '#F472B6'),
  ('b4c11316-eea6-46d9-bf9a-1a85ec0a6f21', 'Aaron',    'aaronlee@ifca.com.my',   'member',  '#60A5FA'),
  ('6ad07761-a0ad-4b71-9b68-339964ea8e3b', 'Lum',      'biingyew@ifca.com.my',     'member',  '#34D399'),

  -- Programmers
  ('02f8d463-73b6-4728-b3bb-fb08a96f4004', 'Hasan',    'ajibhasan@ifca.com.my',   'member',  '#FBBF24'),
  ('14314282-eb8c-4e8d-9526-aa1e3b533a09', 'Aina',     'ainashaheera.hamdan@ifca.com.my',    'member',  '#8B5CF6'),
  ('a9b0f557-4135-4de6-973f-d2c6188c3401', 'Azwaar',   'azwaarkhan@ifca.com.my',  'member',  '#F87171'),
  ('17de4aba-3ed7-4e30-bbb3-847077d83352', 'Madiha',   'nurmadiha@ifca.com.my',  'member',  '#A78BFA'),
  ('112e763a-5963-4e86-b34b-92dd9f889c5f', 'Kai Hao',  'kaihaochong@ifca.com.my',  'member',  '#34D399')
ON CONFLICT (email) DO NOTHING;

-- ─── MEMBER TICKET MAP (starter mappings) ────────────────────
-- These are example raw_name values from CSV exports.
-- Add more via the Team Management page once the app is running.
-- Replace member_id values to match the IDs above after auth setup.

INSERT INTO member_ticket_map (raw_name, member_id) VALUES
  ('HotelX - Chia',                        '28b00ddc-db1d-4706-bd6a-66327d4227a4'),
  ('HotelX RND - Syafiq',                  'b4c11316-eea6-46d9-bf9a-1a85ec0a6f21'),
  ('HotelX RND - Aaron Lee Jun Sheng',     '6ad07761-a0ad-4b71-9b68-339964ea8e3b'),
  ('HotelX RND - Lum Wei Liang',           '14314282-eb8c-4e8d-9526-aa1e3b533a09'),
  ('HotelX RND - Hasan',                   'a9b0f557-4135-4de6-973f-d2c6188c3401'),
  ('HotelX RND - Aina',                    '17de4aba-3ed7-4e30-bbb3-847077d83352'),
  ('HotelX RND - Azwaar',                  '112e763a-5963-4e86-b34b-92dd9f889c5f'),
  ('HotelX RND - Madiha',                  'a9b0f557-4135-4de6-973f-d2c6188c3401'),
  ('HotelX RND - Kai Hao',                 '112e763a-5963-4e86-b34b-92dd9f889c5f')
ON CONFLICT (raw_name) DO NOTHING;
