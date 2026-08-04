import { Cpu, Download } from "lucide-react";
import { useState } from "react";

import {
  setMeshModel,
  setMeshSharing,
  setMeshVram,
} from "@/features/compute/mesh-mutations";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { MeshNode } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Bytes as GB, which is the unit a model download is actually discussed in. */
function formatGb(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

const STATUS_LABELS: Record<MeshNode["status"], string> = {
  off: "共有していません",
  starting: "起動中",
  serving: "共有中",
};

/**
 * Sharing this machine's inference capacity with the community.
 *
 * Described in terms of what happens rather than how: a member deciding whether
 * to turn this on cares that their GPU will answer other people's requests, not
 * about the protocol underneath. The desktop client made the same call and kept
 * the raw node controls out of Settings entirely.
 *
 * The VRAM cap is the one control that has to be prominent. Sharing without a
 * ceiling is how someone ends up unable to use their own machine, and a setting
 * buried behind "Advanced" would be found after that happened rather than before.
 */
export function MeshComputeSettings() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  // The VRAM field is the one control that cannot read straight from the
  // fixtures: it is a number input, and "" and "1" have to be typeable on the way
  // to "16". So the text is local while the committed value is not — see `onBlur`.
  const [vramText, setVramText] = useState<string | null>(null);

  if (!showcase) {
    return (
      <p className="text-2xs text-muted-foreground">
        共有計算の状態はまだ読めていません。
      </p>
    );
  }

  const mesh = showcase.mesh;
  const sharing = mesh.status !== "off";
  const status = mesh.status;

  return (
    <div className="flex flex-col gap-4" data-testid="mesh-settings">
      <p className="text-2xs text-muted-foreground">
        ブラウザからはGPUを他の人に貸せません。この画面はデスクトップ版の設定を再現したものです。
      </p>

      {/* A switch: sharing starts or stops when it is flipped. */}
      <div className="flex items-start justify-between gap-3">
        <label className="min-w-0 cursor-pointer" htmlFor="mesh-share">
          <span className="block text-2xs font-medium">計算資源を共有する</span>
          <span className="block text-badge text-muted-foreground">
            このマシンが、コミュニティのエージェントからの推論要求に応えます。
          </span>
        </label>
        <Switch
          checked={sharing}
          className="mt-0.5 shrink-0"
          data-testid="mesh-share"
          disabled={update === null}
          id="mesh-share"
          onCheckedChange={(on) =>
            update?.((current) => setMeshSharing(current, on))
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-badge font-medium",
            status === "serving"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
          data-testid="mesh-status"
        >
          <Cpu aria-hidden className="size-3" />
          {STATUS_LABELS[status]}
        </span>
        {status === "serving" && (
          <span className="text-badge text-muted-foreground">
            いま {mesh.servingRequests} 件を処理中
          </span>
        )}
      </div>

      {sharing && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                提供するモデル
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="mesh-model"
                disabled={update === null}
                list="mesh-installed-models"
                onChange={(event) =>
                  update?.((current) =>
                    setMeshModel(current, event.target.value),
                  )
                }
                value={mesh.model}
              />
              {/* Installed models offered as suggestions rather than a closed
                  select: a model can be pulled on demand, so restricting the
                  field to what is already here would block the normal case. */}
              <datalist id="mesh-installed-models">
                {mesh.installedModels.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                使わせるVRAMの上限（GB）
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="mesh-vram"
                disabled={update === null}
                min={1}
                // Committed on blur rather than per keystroke: clamping to 1 while
                // someone is still typing turns a half-entered "16" into "1" and
                // eats the 6.
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
              <span className="text-badge text-muted-foreground">
                自分の作業に必要な分を残しておくための上限です。
              </span>
            </label>
          </div>

          {mesh.download && (
            <div
              className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5"
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
                      (mesh.download.receivedBytes / mesh.download.totalBytes) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-2xs font-medium text-muted-foreground">
              入っているモデル
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {mesh.installedModels.map((name) => (
                <li
                  className="rounded-md border border-border px-2 py-1 text-badge"
                  key={name}
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
