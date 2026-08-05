import { ChevronDown, Cpu, Download } from "lucide-react";
import { useState } from "react";

import { FIT_LABELS, rankModels, type Fit } from "@/features/compute/model-fit";
import {
  setMeshModel,
  setMeshSharing,
  setMeshVram,
} from "@/features/compute/mesh-mutations";
import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { NotWiredUp } from "@/features/showcase/ui/ShowcasePage";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { FIELD_CONTROL_CLASS, FieldShell } from "@/shared/ui/field-row";
import { Switch } from "@/shared/ui/switch";

/** How many suggestions are shown before the rest are behind a link. */
const VISIBLE_SUGGESTIONS = 2;

const FIT_CLASS: Record<Fit, string> = {
  fits: "text-status-added",
  tight: "text-warning",
  over: "text-destructive",
};

/** Bytes as GB, which is the unit a model download is actually discussed in. */
function formatGb(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * Share compute: lending this machine to the relay.
 *
 * The desktop client sizes its model suggestions against the machine's AI memory. A
 * browser cannot read that — there is no GPU-memory API, and `deviceMemory` is
 * rounded system RAM, capped at 8, and Chromium-only — so the budget is a number the
 * reader states and the screen says so. A guessed "Recommended for this machine"
 * would be a claim this client cannot support, and the reader would find out when
 * the model failed to load.
 */
export function ComputePanel() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [vramText, setVramText] = useState<string | null>(null);

  if (!showcase) return <NotWiredUp what="共有計算の状態" />;

  const mesh = showcase.mesh;
  const sharing = mesh.status !== "off";
  const ranked = rankModels(mesh.catalog, mesh.maxVramGb);
  const visible = showAll ? ranked : ranked.slice(0, VISIBLE_SUGGESTIONS);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description={
            mesh.status === "serving"
              ? `共有中。いま ${mesh.servingRequests} 件を処理しています。`
              : mesh.status === "starting"
                ? "起動しています。"
                : "いまは共有していません。"
          }
          testId="mesh-share-row"
          title="Share this machine"
        >
          <Switch
            checked={sharing}
            data-testid="mesh-share"
            disabled={update === null}
            onCheckedChange={(on) =>
              update?.((current) => setMeshSharing(current, on))
            }
          />
        </SettingRow>
      </SettingCard>

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-base font-semibold">
          <Cpu aria-hidden className="size-4" />
          Model
        </p>
        <FieldShell className="px-3 py-2">
          <input
            aria-label="提供するモデル"
            className={FIELD_CONTROL_CLASS}
            data-testid="mesh-model"
            disabled={update === null}
            onChange={(event) =>
              update?.((current) => setMeshModel(current, event.target.value))
            }
            value={mesh.model}
          />
        </FieldShell>
        <p className="text-2xs text-muted-foreground">
          下から選ぶか、モデルの参照名かローカルのファイルを入力します。共有を始めるときに取得します。
        </p>

        <p className="mt-2 text-2xs text-muted-foreground">
          {/* Where the number came from, stated. The browser cannot read the
              machine's memory, so the budget is the reader's own cap below. */}
          {mesh.maxVramGb} GB
          に収まるもの（この数字はブラウザからは分からないので、下の上限をそのまま使っています）:
        </p>
        <ul className="flex flex-col gap-1.5" data-testid="model-suggestions">
          {visible.map(({ model, fit }) => (
            <li key={model.ref}>
              <button
                className={cn(
                  "flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  mesh.model === model.ref
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/40",
                )}
                data-testid={`model-${model.ref}`}
                disabled={update === null}
                onClick={() =>
                  update?.((current) => setMeshModel(current, model.ref))
                }
                type="button"
              >
                <code className="min-w-0 flex-1 truncate font-mono text-2xs">
                  {model.ref}
                </code>
                <span className="text-2xs text-muted-foreground">
                  {model.sizeGb}GB
                </span>
                <span className={cn("text-2xs font-medium", FIT_CLASS[fit])}>
                  {FIT_LABELS[fit]}
                </span>
                {mesh.installedModels.includes(model.ref) && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
                    入っています
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {!showAll && ranked.length > VISIBLE_SUGGESTIONS && (
          <button
            className="w-fit text-2xs text-muted-foreground underline hover:text-foreground"
            data-testid="show-all-models"
            onClick={() => setShowAll(true)}
            type="button"
          >
            ほかの {ranked.length - VISIBLE_SUGGESTIONS} 件も見る
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          aria-expanded={advancedOpen}
          className="flex w-fit items-center gap-1.5 text-base font-semibold"
          data-testid="toggle-compute-advanced"
          onClick={() => setAdvancedOpen((open) => !open)}
          type="button"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform",
              advancedOpen ? "" : "-rotate-90",
            )}
          />
          Advanced
        </button>
        {advancedOpen && (
          <SettingCard testId="compute-advanced">
            <SettingRow
              description="他の人の要求に使わせるメモリの上限です。自分の作業に必要な分を残しておくための数字で、上の候補もこれに対して判定しています。"
              title="使わせるメモリの上限（GB）"
            >
              <FieldShell className="w-24 px-3 py-2">
                <input
                  aria-label="使わせるメモリの上限"
                  className={FIELD_CONTROL_CLASS}
                  data-testid="mesh-vram"
                  disabled={update === null}
                  min={1}
                  // Committed on blur: clamping to 1 while someone is still typing
                  // turns a half-entered "16" into "1" and eats the 6.
                  onBlur={() => {
                    if (vramText === null) return;
                    update?.((current) =>
                      setMeshVram(current, Number.parseInt(vramText, 10)),
                    );
                    setVramText(null);
                  }}
                  onChange={(event) => setVramText(event.target.value)}
                  type="number"
                  value={vramText ?? String(mesh.maxVramGb)}
                />
              </FieldShell>
            </SettingRow>

            {mesh.download && (
              <div
                className="flex flex-col gap-1.5 px-4 py-3.5"
                data-testid="mesh-download"
              >
                <span className="flex items-center gap-1.5 text-2xs">
                  <Download aria-hidden className="size-3 text-primary" />
                  <span className="font-medium">{mesh.download.model}</span>
                  <span className="text-muted-foreground">
                    {formatGb(mesh.download.receivedBytes)} /{" "}
                    {formatGb(mesh.download.totalBytes)}
                  </span>
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.round(
                        (mesh.download.receivedBytes /
                          mesh.download.totalBytes) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </SettingCard>
        )}
      </div>

      <SettingCard>
        <p className="px-4 py-3.5 text-2xs text-muted-foreground">
          このマシンの共有計算を使えるのは、このリレーのメンバーだけです。
          ブラウザからは他の人に GPU
          を貸せないので、この画面はデスクトップ版の設定の再現です。
        </p>
      </SettingCard>
    </div>
  );
}
