import ReviewApp from "@/components/ReviewApp";
import {
  getSources,
  getPrismaFlow,
  getSearchStrings,
} from "@/lib/queries";

// Read at request time: the numbers on screen are read out of the review database,
// so a decision recorded in the app is reflected on the next load rather than at
// the next build.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ReviewApp
      sources={getSources()}
      flow={getPrismaFlow()}
      searchStrings={getSearchStrings()}
    />
  );
}
