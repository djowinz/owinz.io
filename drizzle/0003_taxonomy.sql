CREATE TYPE "public"."term_collection" AS ENUM('writing', 'projects');--> statement-breakpoint
CREATE TYPE "public"."term_kind" AS ENUM('category', 'tag');--> statement-breakpoint
CREATE TABLE "post_tags" (
	"post_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "post_tags_post_id_term_id_pk" PRIMARY KEY("post_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "term_kind" NOT NULL,
	"collection" "term_collection" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_tags_term_idx" ON "post_tags" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_slug_key" ON "terms" USING btree ("kind","collection","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_name_key" ON "terms" USING btree ("kind","collection",lower("name"));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_terms_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Data: free-text categories and tags (on posts and inside revision
-- snapshots) become writing terms; posts and snapshots then refer to them by id.
INSERT INTO "terms" ("kind", "collection", "slug", "name")
SELECT DISTINCT ON (slug) 'category', 'writing', slug, name FROM (
  SELECT trim(name) AS name, coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled') AS slug FROM (
    SELECT "category" AS name FROM "posts" WHERE coalesce(trim("category"), '') <> ''
    UNION SELECT "snapshot"->>'category' FROM "revisions" WHERE "post_id" IS NOT NULL AND coalesce(trim("snapshot"->>'category'), '') <> ''
  ) names
) s ORDER BY slug, name;--> statement-breakpoint
INSERT INTO "terms" ("kind", "collection", "slug", "name")
SELECT DISTINCT ON (slug) 'tag', 'writing', slug, name FROM (
  SELECT trim(name) AS name, coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled') AS slug FROM (
    SELECT unnest("tags") AS name FROM "posts"
    UNION SELECT jsonb_array_elements_text("snapshot"->'tags') FROM "revisions"
      WHERE "post_id" IS NOT NULL AND jsonb_typeof("snapshot"->'tags') = 'array'
  ) names WHERE coalesce(trim(name), '') <> ''
) s ORDER BY slug, name;--> statement-breakpoint
UPDATE "posts" p SET "category_id" = t."id" FROM "terms" t
WHERE t."kind" = 'category' AND t."collection" = 'writing' AND coalesce(trim(p."category"), '') <> ''
  AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(p."category")), '[^a-z0-9]+', '-', 'g')), ''), 'untitled');--> statement-breakpoint
INSERT INTO "post_tags" ("post_id", "term_id", "position")
SELECT DISTINCT ON (p."id", t."id") p."id", t."id", x.ord - 1
FROM "posts" p CROSS JOIN LATERAL unnest(p."tags") WITH ORDINALITY AS x(name, ord)
JOIN "terms" t ON t."kind" = 'tag' AND t."collection" = 'writing' AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(x.name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled')
WHERE coalesce(trim(x.name), '') <> ''
ORDER BY p."id", t."id", x.ord;--> statement-breakpoint
UPDATE "revisions" r SET "snapshot" = (r."snapshot" - 'category' - 'tags') || jsonb_build_object(
  'categoryId', (
    SELECT t."id" FROM "terms" t
    WHERE t."kind" = 'category' AND t."collection" = 'writing' AND coalesce(trim(r."snapshot"->>'category'), '') <> ''
      AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(r."snapshot"->>'category')), '[^a-z0-9]+', '-', 'g')), ''), 'untitled')
  ),
  'tagIds', coalesce((
    SELECT jsonb_agg(q."id" ORDER BY q.ord) FROM (
      SELECT DISTINCT ON (t."id") t."id", x.ord
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r."snapshot"->'tags') = 'array' THEN r."snapshot"->'tags' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(name, ord)
      JOIN "terms" t ON t."kind" = 'tag' AND t."collection" = 'writing' AND t."slug" = coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(x.name)), '[^a-z0-9]+', '-', 'g')), ''), 'untitled')
      WHERE coalesce(trim(x.name), '') <> ''
      ORDER BY t."id", x.ord
    ) q
  ), '[]'::jsonb)
)
WHERE r."post_id" IS NOT NULL AND (r."snapshot" ? 'category' OR r."snapshot" ? 'tags');
