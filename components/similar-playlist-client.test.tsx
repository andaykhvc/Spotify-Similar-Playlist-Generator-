import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExplorationLevelPicker } from "@/components/similar-playlist-client";
import { DEFAULT_CONSENSUS_STRICTNESS, STRICTNESS } from "@/lib/recommendations/recommendation-config";

describe("exploration level picker", () => {
  it("starts with Yakın selected and explains the trade-offs", () => {
    expect(DEFAULT_CONSENSUS_STRICTNESS).toBe("strict");
    const markup = renderToStaticMarkup(
      <ExplorationLevelPicker value={DEFAULT_CONSENSUS_STRICTNESS} onChange={() => {}} />,
    );
    expect(markup).toMatch(/<input(?=[^>]*value="strict")(?=[^>]*checked="")[^>]*>/);
    expect(markup).toContain("Daha az şarkı çıkabilir.");
    expect(markup).toContain("biraz daha geniş bir şarkı havuzunu");
    expect(markup).toContain("farklı ama ilişkili şarkılara");
  });

  it("uses increasingly wider real admission thresholds", () => {
    expect(STRICTNESS.strict.bothRadius).toBeLessThan(STRICTNESS.balanced.bothRadius);
    expect(STRICTNESS.balanced.bothRadius).toBeLessThan(STRICTNESS.exploratory.bothRadius);
  });
});
