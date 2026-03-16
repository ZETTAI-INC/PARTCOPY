-- Add quality_score column to source_sections
alter table source_sections add column if not exists quality_score float;
