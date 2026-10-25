import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .claude/worktrees holds parallel checkouts of this repo; their tests aren't ours.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
