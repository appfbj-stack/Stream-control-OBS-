import OBSWebSocket from "obs-websocket-js";
import type {
  MediaItem,
  ObsAudioInput,
  ObsMediaSource,
  ObsScene,
  ObsSceneItem,
  ObsSettings,
  RecordAction,
  StreamAction,
} from "@/lib/types";

export const obs = new OBSWebSocket();

export function buildObsUrl(settings: ObsSettings) {
  return `ws://${settings.host}:${settings.port}`;
}

export async function connectToObs(settings: ObsSettings) {
  await obs.connect(buildObsUrl(settings), settings.password || undefined);
}

export async function connectOBS(host: string, password: string, port = 4455) {
  await connectToObs({ host, password, port });
}

export async function loadScenes() {
  const response = (await obs.call("GetSceneList")) as unknown as {
    currentProgramSceneName: string;
    scenes: Array<{ sceneName: string }>;
  };
  const current = response.currentProgramSceneName;
  const scenes: ObsScene[] = response.scenes.map((scene: { sceneName: string }) => ({
    name: scene.sceneName,
    isCurrent: scene.sceneName === current,
  }));

  return scenes;
}

export async function switchScene(sceneName: string) {
  await obs.call("SetCurrentProgramScene", { sceneName });
}

export async function changeScene(sceneName: string) {
  await switchScene(sceneName);
}

export async function getStreamActive() {
  const streamStatus = await obs.call("GetStreamStatus");
  return Boolean(streamStatus.outputActive);
}

export async function setStreamState(action: StreamAction) {
  if (action === "start") {
    await obs.call("StartStream");
    return;
  }
  await obs.call("StopStream");
}

export async function getRecordActive() {
  const recordStatus = await obs.call("GetRecordStatus");
  return Boolean(recordStatus.outputActive);
}

export async function setRecordState(action: RecordAction) {
  if (action === "start") {
    await obs.call("StartRecord");
    return;
  }
  await obs.call("StopRecord");
}

export async function getStudioModeEnabled() {
  const status = await obs.call("GetStudioModeEnabled");
  return Boolean(status.studioModeEnabled);
}

export async function setStudioModeEnabled(enabled: boolean) {
  await obs.call("SetStudioModeEnabled", { studioModeEnabled: enabled });
}

export async function setPreviewScene(sceneName: string) {
  await obs.call("SetCurrentPreviewScene", { sceneName });
}

export async function triggerStudioModeTransition() {
  await obs.call("TriggerStudioModeTransition");
}

export async function createScene(sceneName: string) {
  await obs.call("CreateScene", { sceneName });
}

export async function removeScene(sceneName: string) {
  await obs.call("RemoveScene", { sceneName });
}

export async function loadAudioInputs() {
  const response = (await obs.call("GetInputList")) as unknown as {
    inputs: Array<{ inputName: string; inputKind?: string }>;
  };
  const channels: Array<ObsAudioInput | null> = await Promise.all(
    response.inputs.map(async (input: { inputName: string; inputKind?: string }): Promise<ObsAudioInput | null> => {
      try {
        const [volume, mute] = await Promise.all([
          obs.call("GetInputVolume", { inputName: input.inputName }),
          obs.call("GetInputMute", { inputName: input.inputName }),
        ]);

        const kind = input.inputKind?.toLowerCase() || "";
        const looksLikeAudio =
          kind.includes("audio") ||
          kind.includes("mic") ||
          kind.includes("wasapi") ||
          kind.includes("ffmpeg") ||
          kind.includes("asio") ||
          kind.includes("pulse") ||
          kind.includes("coreaudio") ||
          kind.includes("jack") ||
          kind.includes("browser") ||
          kind.includes("vlc");

        const volumeMul = Number(volume.inputVolumeMul ?? 0);
        const muted = Boolean(mute.inputMuted);
        const hasAudioControls = typeof volume.inputVolumeMul === "number" || typeof volume.inputVolumeDb === "number" || typeof mute.inputMuted === "boolean";

        if (!looksLikeAudio && !hasAudioControls) {
          return null;
        }

        return {
          inputName: input.inputName,
          ...(input.inputKind ? { inputKind: input.inputKind } : {}),
          volumeMul,
          volumePercent: Math.round(volumeMul * 100),
          volumeDb: typeof volume.inputVolumeDb === "number" ? Number(volume.inputVolumeDb) : undefined,
          muted,
        } satisfies ObsAudioInput;
      } catch {
        return null;
      }
    }),
  );

  return channels.filter((channel): channel is ObsAudioInput => channel !== null);
}

export async function setInputVolume(inputName: string, volumePercent: number) {
  await obs.call("SetInputVolume", {
    inputName,
    inputVolumeMul: Math.max(0, Math.min(1, volumePercent / 100)),
  });
}

export async function setVolume(inputName: string, value: number) {
  await setInputVolume(inputName, value);
}

export async function setInputMute(inputName: string, muted: boolean) {
  await obs.call("SetInputMute", {
    inputName,
    inputMuted: muted,
  });
}

export async function muteInput(inputName: string, state: boolean) {
  await setInputMute(inputName, state);
}

export async function toggleInputMute(inputName: string, current: boolean) {
  await setInputMute(inputName, !current);
}

export async function loadMediaSources() {
  const response = (await obs.call("GetInputList")) as unknown as {
    inputs: Array<{ inputName: string; inputKind?: string }>;
  };
  return response.inputs
    .filter((input: { inputKind?: string }) => {
      const kind = input.inputKind?.toLowerCase() || "";
      return kind.includes("image") || kind.includes("ffmpeg") || kind.includes("vlc");
    })
    .map((input: { inputName: string; inputKind?: string }) => ({
      inputName: input.inputName,
      inputKind: input.inputKind,
    })) satisfies ObsMediaSource[];
}

export async function createInput(input: {
  sceneName: string;
  inputName: string;
  inputKind: string;
  inputSettings?: Record<string, unknown>;
  sceneItemEnabled?: boolean;
}) {
  await obs.call("CreateInput", {
    sceneName: input.sceneName,
    inputName: input.inputName,
    inputKind: input.inputKind,
    inputSettings: (input.inputSettings || {}) as never,
    sceneItemEnabled: input.sceneItemEnabled ?? true,
  });
}

export async function removeInput(inputName: string) {
  await obs.call("RemoveInput", { inputName });
}

export async function replaceMediaInSource(sourceName: string, media: MediaItem, settingKey: "file" | "local_file") {
  await obs.call("SetInputSettings", {
    inputName: sourceName,
    inputSettings: {
      [settingKey]: media.dataUrl,
    },
    overlay: true,
  });
}

export async function controlMediaSource(sourceName: string, action: "play" | "stop") {
  await obs.call("TriggerMediaInputAction", {
    inputName: sourceName,
    mediaAction:
      action === "play"
        ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
        : "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
  });
}

export async function loadSceneItems(sceneName: string) {
  const response = (await obs.call("GetSceneItemList", { sceneName })) as unknown as {
    sceneItems: Array<{ sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }>;
  };
  return response.sceneItems.map((item: { sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }) => ({
    sceneName,
    sceneItemId: item.sceneItemId,
    sourceName: item.sourceName,
    enabled: Boolean(item.sceneItemEnabled),
  })) satisfies ObsSceneItem[];
}

export async function setSceneItemVisibility(sceneName: string, sceneItemId: number, enabled: boolean) {
  await obs.call("SetSceneItemEnabled", {
    sceneName,
    sceneItemId,
    sceneItemEnabled: enabled,
  });
}
