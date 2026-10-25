import { format } from "date-fns";
import { cacheLife } from "next/cache";
import { getSeason } from "@/lib/dates";

// The masthead's "VOL. IV FALL '26". Reading the clock while prerendering
// needs a cache boundary; refreshing daily rolls the season over on its own.
export async function Edition() {
  "use cache";
  cacheLife("days");
  return (
    <>
      VOL. IV {getSeason()} &apos;{format(new Date(), "yy")}
    </>
  );
}
