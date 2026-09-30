import { readFileSync } from "node:fs";
import path from "node:path";

// Read once at build time, so the deployed page is the committed file verbatim.
export const dynamic = "force-static";

export const metadata = { title: "Implementation protocol: Workstream 1" };

export default function ImplementationPage() {
  const text = readFileSync(path.join(process.cwd(), "docs/IMPLEMENTATION.md"), "utf8");
  return (
    <div className="wrap">
      <p className="pnote">
        <a href="/">Back to the review</a>. This is <code>docs/IMPLEMENTATION.md</code>{" "}
        as committed, shown as plain text.
      </p>
      <pre className="doc">{text}</pre>
    </div>
  );
}
