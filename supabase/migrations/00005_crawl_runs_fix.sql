ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS run_after timestamptz;
ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0;

-- Also add RLS for crawl_runs service_role
DROP POLICY IF EXISTS "crawl_runs_service_all" ON crawl_runs;
CREATE POLICY "crawl_runs_service_all" ON crawl_runs
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- source_pages service_role
DROP POLICY IF EXISTS "source_pages_service_all" ON source_pages;
CREATE POLICY "source_pages_service_all" ON source_pages
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- page_assets service_role  
DROP POLICY IF EXISTS "page_assets_service_all" ON page_assets;
CREATE POLICY "page_assets_service_all" ON page_assets
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- section_dom_snapshots service_role
DROP POLICY IF EXISTS "dom_snapshots_service_all" ON section_dom_snapshots;
CREATE POLICY "dom_snapshots_service_all" ON section_dom_snapshots
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- section_nodes service_role
DROP POLICY IF EXISTS "section_nodes_service_all" ON section_nodes;
CREATE POLICY "section_nodes_service_all" ON section_nodes
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- section_patch_sets service_role
DROP POLICY IF EXISTS "patch_sets_service_all" ON section_patch_sets;
CREATE POLICY "patch_sets_service_all" ON section_patch_sets
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- section_patches service_role
DROP POLICY IF EXISTS "patches_service_all" ON section_patches;
CREATE POLICY "patches_service_all" ON section_patches
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- block_instances service_role
DROP POLICY IF EXISTS "block_instances_service_all" ON block_instances;
CREATE POLICY "block_instances_service_all" ON block_instances
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- block_families service_role
DROP POLICY IF EXISTS "block_families_service_all" ON block_families;
CREATE POLICY "block_families_service_all" ON block_families
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- block_variants service_role
DROP POLICY IF EXISTS "block_variants_service_all" ON block_variants;
CREATE POLICY "block_variants_service_all" ON block_variants
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
