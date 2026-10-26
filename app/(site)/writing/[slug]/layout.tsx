import { ReadingProgress } from "@/components/ReadingProgress";

// Articles get a reading progress bar tracking their body (.prose).
export default function ArticleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-reading>
      <ReadingProgress />
      {children}
    </div>
  );
}
