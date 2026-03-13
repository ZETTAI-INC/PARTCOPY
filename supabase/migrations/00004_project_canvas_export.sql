-- ============================================================
-- PARTCOPY v4: Project Canvas Save/Load + Export
-- ============================================================
-- 変更内容:
--   1. projects.workspace_id を nullable に（ローカル作成対応）
--   2. project_pages に label / order_index カラム追加
--   3. project_page_blocks.block_variant_id を nullable に
--   4. exports テーブル拡張（error_message, updated_at, html_storage_path）
--   5. exports.project_id を nullable に
--   6. exports.format チェック制約を拡張
--   7. RLS ポリシー追加（service_role による全操作許可）
-- ============================================================

-- 1. projects: workspace_id を nullable に
alter table projects alter column workspace_id drop not null;

-- 2. project_pages: label / order_index 追加
alter table project_pages add column if not exists label text;
alter table project_pages add column if not exists order_index int default 0;
-- slug の NOT NULL 制約を緩和（Canvas保存時は自動生成）
alter table project_pages alter column slug drop not null;
-- unique制約も削除（slug が null の場合に問題になる）
alter table project_pages drop constraint if exists project_pages_project_id_slug_key;

-- 3. project_page_blocks: block_variant_id を nullable に
alter table project_page_blocks alter column block_variant_id drop not null;

-- 4. exports テーブル拡張
alter table exports add column if not exists error_message text;
alter table exports add column if not exists updated_at timestamptz default now();
alter table exports add column if not exists html_storage_path text;

-- 5. exports.project_id を nullable に（Canvas直接エクスポート対応）
alter table exports alter column project_id drop not null;

-- 6. exports.format: 'html' を許可
alter table exports drop constraint if exists exports_format_check;
alter table exports add constraint exports_format_check
  check (format in ('static_html', 'nextjs_tailwind', 'wordpress', 'json_schema', 'html'));

-- 7. RLS: service_role による全操作許可
-- projects
create policy "projects_service_all" on projects
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- project_pages
create policy "project_pages_service_all" on project_pages
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- project_page_blocks
create policy "ppb_service_all" on project_page_blocks
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- exports
create policy "exports_service_all" on exports
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- source_sections / source_sites: service_role での全操作許可（既存は select のみ）
create policy "source_sections_service_all" on source_sections
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "source_sites_service_all" on source_sites
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
