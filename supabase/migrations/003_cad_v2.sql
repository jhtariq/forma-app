-- Migration: 003_cad_v2.sql
-- Adds pattern_ir (PatternIR JSON) and manufacturing_pack_path columns to cad_versions
-- for the v2 Text-to-CAD expansion (expanded params, Manufacturing Pack, 3D preview)

ALTER TABLE cad_versions
  ADD COLUMN IF NOT EXISTS pattern_ir jsonb,
  ADD COLUMN IF NOT EXISTS manufacturing_pack_path text;

-- Add tech_sketch_storage_path for individual tech sketch SVG storage
ALTER TABLE cad_versions
  ADD COLUMN IF NOT EXISTS tech_sketch_storage_path text;

-- Comment migration
COMMENT ON COLUMN cad_versions.pattern_ir IS
  'PatternIR schema_version=2 object for deterministic re-export';
COMMENT ON COLUMN cad_versions.manufacturing_pack_path IS
  'Storage path to assembled manufacturing_pack.zip';
COMMENT ON COLUMN cad_versions.tech_sketch_storage_path IS
  'Storage path to tech_sketch.svg';
