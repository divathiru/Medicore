-- =============================================================
-- MediCore — Seed Data
-- Inserts 2 doctor accounts and 1 cashier account.
-- Doctors/cashier are seeded (not self-registered) because
-- admin-service is v2/descoped.
--
-- DEV PASSWORD for ALL seed accounts: devpass123
-- Hashes generated with bcrypt, cost factor 10 (node bcrypt).
-- Verified: bcrypt.compare('devpass123', hash) === true for all.
--
--   dr.amelia.chen@medicore.dev  → $2b$10$oJLt7ykHXhblaCdlcjDBGOg8lruIueVMHhUtndCWxwPYMI65TIICa
--   dr.raj.patel@medicore.dev    → $2b$10$zQfXem3eABmoUvI0bS8AIOa/Y609TaZvozO/pQN8zCmx71IqD4owW
--   cashier@medicore.dev         → $2b$10$nJio4rkO7Kqlm.mRTaBLO.xiqe8HKOy4DZBy9DT6mnr24yhnHE8KC
--
-- NEVER use devpass123 in any non-development environment.
-- =============================================================
-- Use explicit UUIDs so the doctors.doctors FK inserts are simpler.
-- These IDs are stable across reseeds for deterministic dev testing.
DO $$
DECLARE
  doc1_id UUID := '11111111-0000-0000-0000-000000000001';
  doc2_id UUID := '11111111-0000-0000-0000-000000000002';
  cash_id UUID := '11111111-0000-0000-0000-000000000003';
BEGIN
  -- ── Doctor 1: Dr. Amelia Chen ─────────────────────────────
  INSERT INTO auth.users (id, email, password_hash, role)
  VALUES (
    doc1_id,
    'dr.amelia.chen@medicore.dev',
    '$2b$10$oJLt7ykHXhblaCdlcjDBGOg8lruIueVMHhUtndCWxwPYMI65TIICa',
    'doctor'
  )
  ON CONFLICT (email) DO NOTHING;
  INSERT INTO doctors.doctors (id, full_name, department, experience_years, bio)
  VALUES (
    doc1_id,
    'Dr. Amelia Chen',
    'Cardiology',
    12,
    'Dr. Chen specialises in interventional cardiology and heart failure management. She completed her residency at Johns Hopkins and has published extensively on cardiac rehabilitation.'
  )
  ON CONFLICT (id) DO NOTHING;
  -- ── Doctor 2: Dr. Raj Patel ───────────────────────────────
  INSERT INTO auth.users (id, email, password_hash, role)
  VALUES (
    doc2_id,
    'dr.raj.patel@medicore.dev',
    '$2b$10$zQfXem3eABmoUvI0bS8AIOa/Y609TaZvozO/pQN8zCmx71IqD4owW',
    'doctor'
  )
  ON CONFLICT (email) DO NOTHING;
  INSERT INTO doctors.doctors (id, full_name, department, experience_years, bio)
  VALUES (
    doc2_id,
    'Dr. Raj Patel',
    'Neurology',
    8,
    'Dr. Patel focuses on movement disorders and neuro-rehabilitation. He trained at UCSF and brings expertise in non-surgical management of Parkinson''s disease and stroke recovery.'
  )
  ON CONFLICT (id) DO NOTHING;
  -- ── Cashier: Front-Desk Billing ───────────────────────────
  INSERT INTO auth.users (id, email, password_hash, role)
  VALUES (
    cash_id,
    'cashier@medicore.dev',
    '$2b$10$nJio4rkO7Kqlm.mRTaBLO.xiqe8HKOy4DZBy9DT6mnr24yhnHE8KC',
    'cashier'
  )
  ON CONFLICT (email) DO NOTHING;
  -- cashier role has no profile table — auth.users entry is sufficient.

  -- ── Demo Patient: Alex Morgan ──────────────────────────────
  -- Email: patient@medicore.dev  Password: devpass123
  -- Hash: bcrypt cost 10 of 'devpass123' (same as other seed accounts)
  INSERT INTO auth.users (id, email, password_hash, role)
  VALUES (
    '22222222-0000-0000-0000-000000000001',
    'patient@medicore.dev',
    '$2b$10$oJLt7ykHXhblaCdlcjDBGOg8lruIueVMHhUtndCWxwPYMI65TIICa',
    'patient'
  )
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO patients.patients (id, full_name, dob, phone)
  VALUES (
    '22222222-0000-0000-0000-000000000001',
    'Alex Morgan',
    '1990-04-15',
    '+1-555-0100'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Pre-book an appointment with Dr. Chen (today) so the demo
  -- cashier can immediately process payment without booking first.
  INSERT INTO appointments.appointments
    (id, patient_id, doctor_id, scheduled_date, status)
  VALUES (
    '33333333-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    CURRENT_DATE,
    'booked'
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Seed complete: 2 doctors + 1 cashier + 1 demo patient + 1 appointment inserted.';
END
$$;

