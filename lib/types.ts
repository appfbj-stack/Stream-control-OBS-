export type ObsSettings = {
  host: string;
  port: number;
  password: string;
};

export type HermesSceneRole = "aguardando" | "louvor" | "oferta" | "biblia" | "pregacao" | "encerramento";

export type HermesMonitorSource = "webAudio" | "obs" | "estimated";

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

export type AudioPresetRule = {
  id: string;
  label: string;
  matchType: "exact" | "keyword";
  matchValues: string[];
  volumePercent: number;
  muted: boolean;
};

export type StoredAudioPreset = {
  id?: number;
  name: string;
  description: string;
  color: string;
  system: boolean;
  applyToUnmatched: boolean;
  fallbackVolumePercent: number;
  fallbackMuted: boolean;
  rules: AudioPresetRule[];
  createdAt: string;
};

export type AppSettings = {
  id: "app-settings";
  obs: ObsSettings;
  hermes: HermesSettings;
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
  volumeDb?: number;
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

export type HermesAudioMetrics = {
  rms: number;
  peak: number;
  db: number;
  clipping: boolean;
  source: HermesMonitorSource;
  updatedAt: string;
};

export type HermesChannel = {
  id: string;
  inputName: string;
  name: string;
  color: string;
  aliases: string[];
  priority: number;
  currentVolumePercent: number;
  currentDb: number;
  estimatedDb: number;
  rms: number;
  peak: number;
  muted: boolean;
  inputKind?: string;
  monitorDeviceId?: string;
  monitorLabel?: string;
  monitorSource: HermesMonitorSource;
  clipping: boolean;
  updatedAt: string;
};

export type HermesRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  channelMatch: string[];
  operator: "lt" | "gt";
  thresholdDb: number;
  action: "increase" | "decrease";
  amountPercent: number;
  minVolumePercent: number;
  maxVolumePercent: number;
  reason: string;
};

export type HermesCultoStep = {
  id: string;
  label: string;
  sceneRole: HermesSceneRole;
  offsetMinutes: number;
  description: string;
};

export type HermesCultoRun = {
  startedAt: string;
  active: boolean;
  currentStepId: string;
};

export type HermesSceneMap = Record<HermesSceneRole, string>;

export type HermesSettings = {
  autoMode: boolean;
  sceneMap: HermesSceneMap;
  defaultMonitorDeviceId?: string;
  commandHistory: string[];
  cultoRun?: HermesCultoRun | null;
  aiProvider: "openai" | "openrouter" | "ollama";
  aiModel: string;
  systemPrompt: string;
  speakResponses: boolean;
};

export type HermesChatRole = "system" | "user" | "assistant";

export type HermesChatMessage = {
  id: string;
  role: HermesChatRole;
  content: string;
  createdAt: string;
};

export type HermesAction =
  | { type: "scene"; sceneName: string }
  | { type: "volume"; inputName: string; deltaPercent: number }
  | { type: "mute"; inputName: string; state: boolean }
  | { type: "autoMode"; enabled: boolean }
  | { type: "startCulto" }
  | { type: "status" };

export type HermesParsedCommand =
  | {
      type: "scene";
      sceneName: string;
      confidence: number;
      response: string;
    }
  | {
      type: "volume";
      inputName: string;
      deltaPercent: number;
      confidence: number;
      response: string;
    }
  | {
      type: "mute";
      inputName: string;
      state: boolean;
      confidence: number;
      response: string;
    }
  | {
      type: "autoMode";
      enabled: boolean;
      confidence: number;
      response: string;
    }
  | {
      type: "startCulto";
      confidence: number;
      response: string;
    }
  | {
      type: "unknown";
      confidence: number;
      response: string;
    };
