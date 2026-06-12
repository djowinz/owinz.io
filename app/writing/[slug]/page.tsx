import { getBlogPost, getBlogPosts } from "@/lib/markdown";
import Link from "next/link";
import { notFound } from "next/navigation";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return { title: "Post Not Found" };
  return {
    title: `${post.title} | Blog`,
    description: post.excerpt,
  };
}
