import { Play, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import {
  speakSample,
  systemVoices,
  useVoiceListReady,
  useVoicePrefs,
} from "@/features/settings/use-voice-prefs";
import { ValuePicker } from "@/shared/ui/field-row";
import { Switch } from "@/shared/ui/switch";

/**
 * Voice: whether agent messages are read aloud during a huddle.
 *
 * Reading aloud is for the case a huddle is actually for — hands off the keyboard,
 * looking at something else — so it is scoped to an active huddle rather than to the
 * whole app. An agent's report narrated while someone is typing in another channel
 * is noise.
 *
 * The voices come from the browser's own speech synthesis, which is why the list
 * differs per machine and why the panel says so rather than promising a fixed set.
 */
export function VoicePanel() {
  const { prefs, setPrefs } = useVoicePrefs();
  // Chrome fills the voice list asynchronously and returns nothing on the first
  // read, so without this the panel says "no voices" on a machine that has thirty.
  useVoiceListReady();
  const voices = systemVoices();
  const fileInput = useRef<HTMLInputElement>(null);
  const [added, setAdded] = useState<string[]>([]);

  const options = [
    ...voices.map((voice) => ({ value: voice, label: voice })),
    ...added.map((voice) => ({ value: voice, label: `${voice}（追加）` })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="届いた順に、エージェントのメッセージを読み上げます。"
          testId="tts-row"
          title="Agent text to speech"
        >
          <Switch
            checked={prefs.enabled}
            data-testid="tts-enabled"
            onCheckedChange={(next) => setPrefs({ ...prefs, enabled: next })}
          />
        </SettingRow>

        <SettingRow
          description={
            voices.length === 0
              ? "このブラウザは読み上げに対応していません。"
              : "音声ファイルはこの端末から出ません。"
          }
          testId="tts-voice-row"
          title="読み上げの声"
        >
          <ValuePicker
            ariaLabel="読み上げの声"
            disabled={options.length === 0}
            onChange={(next) => setPrefs({ ...prefs, voice: next })}
            options={
              options.length > 0
                ? options
                : [{ value: "", label: "使える声がありません" }]
            }
            testId="tts-voice"
            value={prefs.voice}
          />
          <button
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
            data-testid="tts-preview"
            disabled={voices.length === 0}
            onClick={() => {
              if (!speakSample(prefs.voice)) {
                toast.error("読み上げを開始できませんでした。");
              }
            }}
            type="button"
          >
            <Play aria-hidden className="size-3" />
            Preview
          </button>
          <input
            accept="audio/*"
            aria-label="音声ファイルを選ぶ"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              // Named, listed, and kept in this component only. The browser will not
              // synthesize speech from an arbitrary audio file, so this records the
              // reader's choice without claiming it will be spoken — saying that
              // plainly beats a picker that silently keeps using the system voice.
              setAdded((current) => [...current, file.name]);
              setPrefs({ ...prefs, voice: file.name });
              toast.success(
                `${file.name} を追加しました。合成には使えないので、読み上げは選んだシステムの声で行われます。`,
              );
            }}
            ref={fileInput}
            type="file"
          />
          <button
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
            data-testid="tts-add-voice"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <Upload aria-hidden className="size-3" />
            Add voice
          </button>
        </SettingRow>
      </SettingCard>
    </div>
  );
}
