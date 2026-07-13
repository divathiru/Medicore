-- =============================================================
-- MediCore — Shared PostgreSQL Schema
-- One Postgres instance, schema-per-service pattern.
-- Run order: this file first, then seed.sql.
-- =============================================================
-- pgvector extension (required for ai-service embeddings)
CREATE EXTENSION IF NOT EXISTS vector;
-- =============================================================
-- SCHEMAS
-- =============================================================
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS doctors;
CREATE SCHEMA IF NOT EXISTS patients;
CREATE SCHEMA IF NOT EXISTS appointments;
CREATE SCHEMA IF NOT EXISTS cashier;
-- =============================================================
-- AUTH SCHEMA
-- role CHECK is intentionally restricted to the three active
-- roles in this build.  admin/strategist are v2/descoped.
-- =============================================================
CREATE TABLE auth.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient','doctor','cashier')),
  created_at    TIMESTAMPTZ DEFAULT now()
);
-- =============================================================
-- DOCTORS SCHEMA
-- =============================================================
CREATE TABLE doctors.doctors (
  id               UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name        TEXT NOT NULL,
  department       TEXT NOT NULL,
  experience_years INT,
  bio              TEXT
);
-- =============================================================
-- PATIENTS SCHEMA
-- =============================================================
CREATE TABLE patients.patients (
  id        UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  dob       DATE,
  phone     TEXT
);
CREATE TABLE patients.old_summaries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID REFERENCES patients.patients(id),
  source_hospital TEXT,
  file_url       TEXT,
  extracted_text TEXT,        -- used for RAG ingestion
  uploaded_at    TIMESTAMPTZ DEFAULT now()
);
-- =============================================================
-- APPOINTMENTS SCHEMA
-- =============================================================
CREATE TABLE appointments.appointments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID REFERENCES patients.patients(id),
  doctor_id      UUID REFERENCES doctors.doctors(id),
  scheduled_date DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'booked'
                   CHECK (status IN ('booked','paid','in_queue','completed','cancelled')),
  queue_position INT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_appt_doctor_date ON appointments.appointments(doctor_id, scheduled_date);
CREATE INDEX idx_appt_patient     ON appointments.appointments(patient_id);
CREATE TABLE appointments.prescriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID REFERENCES appointments.appointments(id),
  doctor_summary   TEXT,
  prescription_text TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
-- =============================================================
-- CASHIER SCHEMA
-- =============================================================
CREATE TABLE cashier.payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments.appointments(id),
  amount         NUMERIC(10,2),
  paid_at        TIMESTAMPTZ
);
-- =============================================================
-- EMBEDDINGS TABLE  (ai-service / pgvector RAG store)
-- namespace = 'public'  → hospital-info chatbot
-- namespace = 'patient' → per-patient doctor chatbot
-- embedding dimension = 1024 (Mistral mistral-embed output)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.embeddings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace  TEXT NOT NULL,            -- 'public' | 'patient'
  patient_id UUID,                     -- NULL for namespace='public'
  content    TEXT NOT NULL,            -- original chunk text
  embedding  vector(1024) NOT NULL,
  metadata   JSONB DEFAULT '{}'::jsonb
);
-- Cosine-similarity index for fast ANN lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_namespace
  ON public.embeddings(namespace);
CREATE INDEX IF NOT EXISTS idx_embeddings_patient_id
  ON public.embeddings(patient_id)
  WHERE patient_id IS NOT NULL;