export type ObsSettings = {
  host: string;
  port: number;
  password: string;
};

export type X18ChannelMapItem = {
  channel: number;
  name: string;
  color?: string;
};

export type MixProfileSlot = "igreja" | "live";

export type MixProfileChannelState = {
  channel?: number;
  inputName: string;
  volumePercent: number;
  muted: boolean;
  inputKind?: string;
};

export type MixProfileState = {
  key: MixProfileSlot;
  label: string;
  description: string;
  source: "obs" | "x18" | "hybrid";
  channels: MixProfileChannelState[];
  updatedAt?: string;
};

export type X18Settings = {
  enabled: boolean;
  ip: string;
  port: number;
  channelMap: X18ChannelMapItem[];
  mixProfiles: Record<MixProfileSlot, MixProfileState>;
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
export type RecordAction = "start" | "stop";
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
  x18: X18Settings;
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
  | { type: "navigateTab"; tab: "buttons" | "audio" | "media" | "hermes" | "config" }
  | { type: "scene"; sceneName: string }
  | { type: "previewScene"; sceneName: string }
  | { type: "createScene"; sceneName: string }
  | { type: "deleteScene"; sceneName: string }
  | { type: "volume"; inputName: string; deltaPercent: number }
  | { type: "mute"; inputName: string; state: boolean }
  | { type: "stream"; action: StreamAction }
  | { type: "record"; action: RecordAction }
  | { type: "studioMode"; enabled: boolean }
  | { type: "triggerTransition" }
  | { type: "connectX18" }
  | { type: "configureX18"; ip?: string; port?: number }
  | { type: "x18Fader"; channel?: number; channelName?: string; levelPercent: number }
  | { type: "x18Mute"; channel?: number; channelName?: string; muted: boolean }
  | { type: "x18Send"; channel?: number; channelName?: string; bus: number; levelPercent: number }
  | { type: "x18Gain"; channel: number; gainPercent: number }
  | { type: "x18Phantom"; channel: number; enabled: boolean }
  | { type: "x18Eq"; channel?: number; channelName?: string; band: 1 | 2 | 3 | 4; gainPercent: number; frequencyPercent?: number; qPercent?: number; enabled?: boolean }
  | { type: "x18Gate"; channel?: number; channelName?: string; enabled: boolean; thresholdPercent?: number; rangePercent?: number }
  | { type: "x18Compressor"; channel?: number; channelName?: string; enabled: boolean; thresholdPercent?: number; ratioPercent?: number; makeupPercent?: number }
  | { type: "x18MainMute"; muted: boolean }
  | { type: "x18RenameChannel"; channel: number; name: string }
  | { type: "x18ApplyPreset"; presetName: string }
  | { type: "saveMixProfile"; profile: MixProfileSlot }
  | { type: "applyMixProfile"; profile: MixProfileSlot }
  | { type: "x18Osc"; address: string; argType: "f" | "i" | "s"; value: number | string }
  | { type: "connectObs" }
  | { type: "disconnectObs" }
  | { type: "configureObs"; host?: string; port?: number; password?: string }
  | { type: "setSceneMap"; role: HermesSceneRole; sceneName: string }
  | { type: "speakResponses"; enabled: boolean }
  | {
      type: "createButton";
      name: string;
      color?: string;
      buttonType: StoredButtonType;
      sceneName?: string;
      inputName?: string;
      audioMode?: AudioActionMode;
      volumePercent?: number;
      macroId?: number;
      sourceName?: string;
      mediaMode?: MediaActionMode;
      mediaId?: number;
      sceneItemId?: number;
      settingKey?: "file" | "local_file";
    }
  | {
      type: "createMacro";
      name: string;
      actions: MacroAction[];
    }
  | {
      type: "createAudioPreset";
      name: string;
      description?: string;
      color?: string;
      fallbackVolumePercent?: number;
      fallbackMuted?: boolean;
      applyToUnmatched?: boolean;
      rules: AudioPresetRule[];
    }
  | { type: "applyAudioPreset"; presetName: string }
  | { type: "createRecommendedPreset"; presetName: string }
  | { type: "deleteButton"; buttonName: string }
  | { type: "runButton"; buttonName: string }
  | { type: "deleteMacro"; macroName: string }
  | { type: "runMacro"; macroName: string }
  | { type: "deleteAudioPreset"; presetName: string }
  | {
      type: "createInput";
      sceneName: string;
      inputName: string;
      inputKind: string;
      inputSettings?: Record<string, unknown>;
      sceneItemEnabled?: boolean;
    }
  | { type: "deleteInput"; inputName: string }
  | {
      type: "media";
      sourceName?: string;
      mediaName?: string;
      mode: MediaActionMode;
      mediaId?: number;
      sceneName?: string;
      sceneItemId?: number;
      sceneItemName?: string;
      settingKey?: "file" | "local_file";
    }
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
