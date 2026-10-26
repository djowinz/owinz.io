ALTER TABLE "posts" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "talks" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: posts and projects were first published when their earliest
-- published revision was saved (unpublishing keeps revisions).
UPDATE "posts" SET "first_published_at" = (
  SELECT min("created_at") FROM "revisions" WHERE "post_id" = "posts"."id" AND "kind" = 'published'
);--> statement-breakpoint
UPDATE "projects" SET "first_published_at" = (
  SELECT min("created_at") FROM "revisions" WHERE "project_id" = "projects"."id" AND "kind" = 'published'
);--> statement-breakpoint
-- Talks keep no history: a live talk counts from its last change. A talk
-- unpublished before this column existed can't be told apart from a draft.
UPDATE "talks" SET "first_published_at" = "updated_at" WHERE "state" = 'published';
