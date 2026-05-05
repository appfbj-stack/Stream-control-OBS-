export type ObsSettings = {
  host: string;
  port: number;
  password: string;
};

export type MediaKind = "image" | "video" | "audio";

export type MediaItem = {
  id?: number;
  name: string;
  kind: MediaKind;
  mimeType: string;
  dataUrl: string;
  size: number;
  createdAt: string;
};

export type StoredButtonType = "scene" | "audio" | "media" | "macro";

export type MacroActionKind = "scene" | "stream" | "audio" | "media";

export type StreamAction = "start" | "stop";
export type AudioActionMode = "toggleMute" | "setVolume";
export type MediaActionMode = "replace" | "play" | "stop" | "show" | "hide";

export type SceneButtonPayload = {
  sceneName: string;
};

export type AudioButtonPayload = {
  inputName: string;
  mode: AudioActionMode;
  volumePercent?: number;
};

export type MediaButtonPayload = {
  sourceName: string;
  mode: MediaActionMode;
  mediaId?: number;
  sceneName?: string;
  sceneItemId?: number;
  settingKey?: "file" | "local_file";
};

export type MacroButtonPayload = {
  macroId: number;
};

export type StoredButtonPayload =
  | SceneButtonPayload
  | AudioButtonPayload
  | MediaButtonPayload
  | MacroButtonPayload;

export type StoredButton = {
  id?: number;
  name: string;
  type: StoredButtonType;
  color: string;
  payload: StoredButtonPayload;
  createdAt: string;
};

export type MacroAction = {
  id: string;
  kind: MacroActionKind;
  delayMs: number;
  payload: {
    sceneName?: string;
    streamAction?: StreamAction;
    inputName?: string;
    volumePercent?: number;
    sourceName?: string;
    mediaId?: number;
    sceneNameForVisibility?: string;
    sceneItemId?: number;
    mediaActionMode?: MediaActionMode;
    settingKey?: "file" | "local_file";
  };
};

export type StoredMacro = {
  id?: number;
  name: string;
  actions: MacroAction[];
  createdAt: string;
};

export type AppSettings = {
  id: "app-settings";
  obs: ObsSettings;
};

export type ObsScene = {
  name: string;
  isCurrent: boolean;
};

export type ObsAudioInput = {
  inputName: string;
  inputKind?: string;
  volumeMul: number;
  volumePercent: number;
  muted: boolean;
};

export type ObsSceneItem = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  enabled: boolean;
};

export type ObsMediaSource = {
  inputName: string;
  inputKind?: string;
};
