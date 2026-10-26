CREATE TABLE "project_tags" (
	"project_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "project_tags_project_id_term_id_pk" PRIMARY KEY("project_id","term_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_tags_term_idx" ON "project_tags" USING btree ("term_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_id_terms_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Data: free-text project categories and technologies (on projects and inside
-- revision snapshots) become projects terms — categories, and tags shown as
-- "Technologies" — and projects and snapshots then refer to them by id.
-- Categories take the display order of the first project that uses them.
INSERT INTO "terms" ("kind", "collection", "slug", "name", "sort_order")
SELECT 'category', 'projects', slug, name, (row_number() OVER (ORDER BY rank, slug))::int - 1 FROM (
  SELECT DISTINCT ON (slug) slug, name, rank FROM (
    SELECT trim(name) AS name, rank, coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled') AS slug FROM (
      SELECT "category" AS name, "sort_order"::bigint AS rank FROM "projects" WHERE coalesce(trim("category"), '') <> ''
      UNION ALL SELECT "snapshot"->>'category', 9223372036854775807 FROM "revisions" WHERE "project_id" IS NOT NULL AND coalesce(trim("snapshot"->>'category'), '') <> ''
    ) names
  ) s ORDER BY slug, rank, name
) d
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "terms" ("kind", "collection", "slug", "name")
SELECT DISTINCT ON (slug) 'tag', 'projects', slug, name FROM (
  SELECT trim(name) AS name, coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled') AS slug FROM (
    SELECT unnest("technologies") AS name FROM "projects"
    UNION SELECT jsonb_array_elements_text("snapshot"->'technologies') FROM "revisions"
      WHERE "project_id" IS NOT NULL AND jsonb_typeof("snapshot"->'technologies') = 'array'
  ) names WHERE coalesce(trim(name), '') <> ''
) s ORDER BY slug, name
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "projects" p SET "category_id" = t."id" FROM "terms" t
WHERE t."kind" = 'category' AND t."collection" = 'projects' AND coalesce(trim(p."category"), '') <> ''
  AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(p."category")), '[^a-z0-9]+', '-', 'g')), ''), 'untitled');--> statement-breakpoint
INSERT INTO "project_tags" ("project_id", "term_id", "position")
SELECT project_id, term_id, (row_number() OVER (PARTITION BY project_id ORDER BY ord))::int - 1 FROM (
  SELECT DISTINCT ON (p."id", t."id") p."id" AS project_id, t."id" AS term_id, x.ord
  FROM "projects" p CROSS JOIN LATERAL unnest(p."technologies") WITH ORDINALITY AS x(name, ord)
  JOIN "terms" t ON t."kind" = 'tag' AND t."collection" = 'projects' AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(x.name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled')
  WHERE coalesce(trim(x.name), '') <> ''
  ORDER BY p."id", t."id", x.ord
) firsts;--> statement-breakpoint
-- Snapshots also drop sortOrder: the /projects display order is set by
-- reordering in the CMS and applies at once, without republishing.
UPDATE "revisions" r SET "snapshot" = (r."snapshot" - 'category' - 'technologies' - 'sortOrder') || jsonb_build_object(
  'categoryId', (
    SELECT t."id" FROM "terms" t
    WHERE t."kind" = 'category' AND t."collection" = 'projects' AND coalesce(trim(r."snapshot"->>'category'), '') <> ''
      AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(r."snapshot"->>'category')), '[^a-z0-9]+', '-', 'g')), ''), 'untitled')
  ),
  'technologyIds', coalesce((
    SELECT jsonb_agg(q."id" ORDER BY q.ord) FROM (
      SELECT DISTINCT ON (t."id") t."id", x.ord
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r."snapshot"->'technologies') = 'array' THEN r."snapshot"->'technologies' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(name, ord)
      JOIN "terms" t ON t."kind" = 'tag' AND t."collection" = 'projects' AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(x.name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled')
      WHERE coalesce(trim(x.name), '') <> ''
      ORDER BY t."id", x.ord
    ) q
  ), '[]'::jsonb)
)
WHERE r."project_id" IS NOT NULL AND (r."snapshot" ? 'category' OR r."snapshot" ? 'technologies' OR r."snapshot" ? 'sortOrder');
