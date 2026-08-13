import {
  CONFIDENCE_LABELS,
  evaluationConfidence,
  formatEvaluationScore,
  groupEvaluationsBySource,
  SOURCE_LABELS,
} from "@/features/agents/evaluation-model";
import type { EvaluationResult } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";

/**
 * What an agent scored, and who says so.
 *
 * Grouped by source with the counts spelled out, because the two ways this
 * display goes wrong are showing a percentage without its sample size, and
 * presenting one merged figure that nobody actually measured. Neither is
 * expressible here: the numbers come from `evaluation-model`, which never sums
 * across a source, dataset, model or agent version.
 *
 * A never-evaluated agent gets a sentence rather than an empty panel — the
 * absence of a number is itself the answer to "how good is this".
 */
export function EvaluationCard({ results }: { results: EvaluationResult[] }) {
  if (results.length === 0) {
    return (
      <p
        className="rounded-md border border-border px-2.5 py-2 text-2xs text-muted-foreground"
        data-testid="evaluation-unevaluated"
      >
        {CONFIDENCE_LABELS.unevaluated}
        。このエージェントはまだ評価されていません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="evaluation-card">
      {groupEvaluationsBySource(results).map((group) => (
        <section className="flex flex-col gap-1" key={group.source}>
          <h3 className="text-2xs font-medium text-muted-foreground">
            {SOURCE_LABELS[group.source]}
          </h3>
          <ul className="flex flex-col gap-1">
            {group.results.map((result) => {
              const confidence = evaluationConfidence(result.total);
              const score = formatEvaluationScore(result);
              return (
                <li
                  className="rounded-md border border-border px-2.5 py-2"
                  data-testid={`evaluation-${result.id}`}
                  key={result.id}
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {/* The counts, always — never a bare percentage. */}
                    <span className="font-mono text-sm font-medium">
                      {score ?? CONFIDENCE_LABELS.unevaluated}
                    </span>
                    {confidence !== "established" && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-badge font-medium",
                          "bg-warning-bg text-warning",
                        )}
                        data-testid={`evaluation-${result.id}-qualifier`}
                      >
                        {CONFIDENCE_LABELS[confidence]}
                      </span>
                    )}
                    <span className="text-badge text-muted-foreground">
                      {result.dataset}
                    </span>
                  </p>
                  {/* The axes a result is pinned to. Shown on every row, since
                      two rows that differ only by model are the whole reason
                      they are two rows. */}
                  <p className="mt-0.5 truncate text-badge text-muted-foreground">
                    {result.model} · v{result.agentVersion}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
