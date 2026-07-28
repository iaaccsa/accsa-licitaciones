import { readFileSync } from "fs";
import { join } from "path";

// Unlisted view: accessible only by typing /nerd-graph in the browser.
// No links point here and it is intentionally outside the auth flow.
// The graph document is fully self-contained (data, CSS and logic are inline);
// its only dependency is /vendor/vis-network.min.js, served as a static asset.
export const dynamic = "force-static";

const graphHtml = readFileSync(
  join(process.cwd(), "src/app/nerd-graph/graph.html"),
  "utf-8",
);

export default function NerdGraphPage() {
  return (
    <iframe
      title="nerd-graph"
      srcDoc={graphHtml}
      className="fixed inset-0 z-[100] h-screen w-screen border-0"
    />
  );
}
