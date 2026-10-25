CREATE TYPE "public"."publish_state" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."revision_kind" AS ENUM('published', 'autosave');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"project_id" uuid,
	"name" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_one_owner" CHECK (num_nonnulls("assets"."post_id", "assets"."project_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"date" date NOT NULL,
	"updated" date,
	"byline" text,
	"body" text DEFAULT '' NOT NULL,
	"state" "publish_state" DEFAULT 'draft' NOT NULL,
	"published_slug" text,
	"published_revision_id" uuid,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "posts_live_has_revision" CHECK (state = 'draft' or (published_revision_id is not null and published_slug is not null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"challenge" text DEFAULT '' NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text,
	"role" text,
	"project_status" text,
	"platform" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"launch_date" date,
	"updated" date,
	"live_url" text,
	"source_url" text,
	"image" text,
	"body" text DEFAULT '' NOT NULL,
	"state" "publish_state" DEFAULT 'draft' NOT NULL,
	"published_slug" text,
	"published_revision_id" uuid,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "projects_live_has_revision" CHECK (state = 'draft' or (published_revision_id is not null and published_slug is not null))
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"post_id" uuid,
	"project_id" uuid,
	"kind" "revision_kind" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_one_owner" CHECK (num_nonnulls("revisions"."post_id", "revisions"."project_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "talks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"venue" text,
	"format" text,
	"talk_status" text,
	"upcoming" boolean,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "publish_state" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talks_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_published_revision_id_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_published_revision_id_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_post_name_key" ON "assets" USING btree ("post_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_project_name_key" ON "assets" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_key" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_published_slug_key" ON "posts" USING btree ("published_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_key" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_published_slug_key" ON "projects" USING btree ("published_slug");--> statement-breakpoint
CREATE INDEX "revisions_post_idx" ON "revisions" USING btree ("post_id","kind","seq");--> statement-breakpoint
CREATE INDEX "revisions_project_idx" ON "revisions" USING btree ("project_id","kind","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "talks_slug_key" ON "talks" USING btree ("slug");