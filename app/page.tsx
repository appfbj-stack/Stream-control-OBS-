"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HermesController } from "@/components/hermes-controller";
import { startAudioMonitor } from "@/lib/audio-monitor";
import { db, DEFAULT_SETTINGS } from "@/lib/db";
import { DEFAULT_CULTO_STEPS, DEFAULT_HERMES_RULES, applyAudioMetrics, evaluateHermesRules, getCultoStep, parseCommand, syncHermesChannels, volumePercentToDb } from "@/lib/hermes";
import {
  changeScene,
  connectToObs,
  controlMediaSource,
  connectOBS,
  getStreamActive,
  loadAudioInputs,
  loadMediaSources,
  loadSceneItems,
  loadScenes,
  muteInput,
  obs,
  replaceMediaInSource,
  setInputMute,
  setInputVolume,
  setVolume,
  setSceneItemVisibility,
  setStreamState,
  switchScene,
  toggleInputMute,
} from "@/lib/obs";
import type {
  AppSettings,
  HermesChannel,
  MacroAction,
  MediaActionMode,
  MediaItem,
  StoredAudioPreset,
  ObsAudioInput,
  ObsMediaSource,
  ObsScene,
  ObsSceneItem,
  StoredButton,
  StoredButtonType,
  StoredMacro,
} from "@/lib/types";

type TabKey = "buttons" | "audio" | "media" | "hermes" | "config";

const tabs: { key: TabKey; label: string }[] = [
  { key: "buttons", label: "Botões" },
  { key: "audio", label: "Áudio" },
  { key: "media", label: "Mídia" },
  { key: "hermes", label: "Hermes" },
  { key: "config", label: "OBS" },
];

const initialButtonForm = {
  id: "",
  name: "",
  color: "#1dd3b0",
  type: "scene" as StoredButtonType,
  sceneName: "",
  inputName: "",
  audioMode: "toggleMute",
  volumePercent: "70",
  mediaSourceName: "",
  mediaMode: "replace" as MediaActionMode,
  mediaId: "",
  visibilitySceneName: "",
  visibilitySceneItemId: "",
  settingKey: "local_file" as "file" | "local_file",
  macroId: "",
};

const initialAudioPresetForm = {
  name: "",
  description: "",
  color: "#38bdf8",
};

function createMacroAction(): MacroAction {
  return {
    id: crypto.randomUUID(),
    kind: "scene",
    delayMs: 0,
    payload: {},
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("buttons");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [obsConnected, setObsConnected] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("Pronto para conectar");
  const [streamActive, setStreamActive] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [scenes, setScenes] = useState<ObsScene[]>([]);
  const [audioInputs, setAudioInputs] = useState<ObsAudioInput[]>([]);
  const [mediaSources, setMediaSources] = useState<ObsMediaSource[]>([]);
  const [selectedSceneForItems, setSelectedSceneForItems] = useState("");
  const [sceneItems, setSceneItems] = useState<ObsSceneItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [buttons, setButtons] = useState<StoredButton[]>([]);
  const [macros, setMacros] = useState<StoredMacro[]>([]);
  const [customAudioPresets, setCustomAudioPresets] = useState<StoredAudioPreset[]>([]);
  const [hermesChannels, setHermesChannels] = useState<HermesChannel[]>([]);
  const [commandText, setCommandText] = useState("");
  const [commandFeedback, setCommandFeedback] = useState("Hermes pronto para interpretar comandos.");
  const [availableAudioDevices, setAvailableAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [buttonForm, setButtonForm] = useState(initialButtonForm);
  const [audioPresetForm, setAudioPresetForm] = useState(initialAudioPresetForm);
  const [macroForm, setMacroForm] = useState<{ id: string; name: string; actions: MacroAction[] }>({
    id: "",
    name: "",
    actions: [createMacroAction()],
  });
  const [busyAction, setBusyAction] = useState("");
  const pollRef = useRef<number | null>(null);
  const monitorRef = useRef<Map<string, () => Promise<void>>>(new Map());

  const sceneOptions = useMemo(() => scenes.map((scene) => scene.name), [scenes]);
  const recommendedAudioPresets = useMemo(() => buildRecommendedAudioPresets(), []);
  const allAudioPresets = useMemo(
    () =>
      [...recommendedAudioPresets, ...customAudioPresets].sort((left, right) => {
        if (left.system !== right.system) return left.system ? -1 : 1;
        return left.name.localeCompare(right.name);
      }),
    [customAudioPresets, recommendedAudioPresets],
  );

  useEffect(() => {
    void bootstrap();
    void loadLocalData();
    void loadAudioDevices();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (pollRef.current) window.clearInterval(pollRef.current);
      for (const stopMonitor of monitorRef.current.values()) {
        void stopMonitor();
      }
      monitorRef.current.clear();
      obs.disconnect().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!selectedSceneForItems || !obsConnected) return;
    void refreshSceneItems(selectedSceneForItems);
  }, [selectedSceneForItems, obsConnected]);

  useEffect(() => {
    if (!settings.hermes.autoMode || !obsConnected || !hermesChannels.length) return;

    const interval = window.setInterval(() => {
      void runHermesAutomation();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [settings.hermes.autoMode, obsConnected, hermesChannels]);

  useEffect(() => {
    const cultoRun = settings.hermes.cultoRun;
    if (!cultoRun?.active || !obsConnected) return;

    const interval = window.setInterval(() => {
      void syncCultoScene();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [settings.hermes.cultoRun, settings.hermes.sceneMap, obsConnected]);

  async function bootstrap() {
    const stored = (await db.settings.get("app-settings")) || DEFAULT_SETTINGS;
    setSettings(mergeSettings(stored));
  }

  async function loadLocalData() {
    const [storedMedia, storedButtons, storedMacros, storedAudioPresets, storedHermesChannels] = await Promise.all([
      db.media.toArray(),
      db.buttons.toArray(),
      db.macros.toArray(),
      db.audioPresets.toArray(),
      db.hermesChannels.toArray(),
    ]);
    setMediaItems(storedMedia.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setButtons(storedButtons.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setMacros(storedMacros.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setCustomAudioPresets(storedAudioPresets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setHermesChannels(storedHermesChannels.sort((a, b) => b.priority - a.priority));
  }

  async function loadAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAvailableAudioDevices(devices.filter((device) => device.kind === "audioinput"));
  }

  async function connectObs() {
    setLoadingConnection(true);
    setConnectionMessage("Conectando ao OBS...");

    try {
      await connectOBS(settings.obs.host, settings.obs.password, settings.obs.port);
      setObsConnected(true);
      setConnectionMessage("Conectado com sucesso");
      await refreshObsState();

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => {
        void refreshObsState();
      }, 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao conectar";
      setConnectionMessage(message);
      setObsConnected(false);
    } finally {
      setLoadingConnection(false);
    }
  }

  async function disconnectObs() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    await obs.disconnect().catch(() => undefined);
    setObsConnected(false);
    setScenes([]);
    setAudioInputs([]);
    setMediaSources([]);
    setSceneItems([]);
    setStreamActive(false);
    setConnectionMessage("Conexão encerrada");
  }

  async function refreshObsState() {
    if (!obsConnected && !obs.identified) return;

    const [nextScenes, nextAudio, nextMedia, nextStream] = await Promise.all([
      loadScenes(),
      loadAudioInputs(),
      loadMediaSources(),
      getStreamActive(),
    ]);

    setScenes(nextScenes);
    setAudioInputs(nextAudio);
    setMediaSources(nextMedia);
    setStreamActive(nextStream);
    setHermesChannels((current) => {
      const synced = syncHermesChannels(current, nextAudio);
      void db.hermesChannels.bulkPut(synced);
      return synced;
    });

    if (!selectedSceneForItems && nextScenes[0]) {
      setSelectedSceneForItems(nextScenes[0].name);
    }
  }

  async function refreshSceneItems(sceneName: string) {
    const items = await loadSceneItems(sceneName);
    setSceneItems(items);
  }

  async function saveSettings() {
    await db.settings.put(settings);
    setConnectionMessage("Configurações salvas localmente");
  }

  async function updateHermesSettings(patch: Partial<AppSettings["hermes"]>) {
    const latest = mergeSettings((await db.settings.get("app-settings")) || settings);
    const next = mergeSettings({
      ...latest,
      hermes: {
        ...latest.hermes,
        ...patch,
      },
    });
    setSettings(next);
    await db.settings.put(next);
  }

  async function handleSceneClick(sceneName: string) {
    setBusyAction(`scene-${sceneName}`);
    try {
      await changeScene(sceneName);
      await refreshObsState();
    } finally {
      setBusyAction("");
    }
  }

  async function handleStreamToggle() {
    setBusyAction("stream");
    try {
      await setStreamState(streamActive ? "stop" : "start");
      await refreshObsState();
    } finally {
      setBusyAction("");
    }
  }

  async function handleVolumeChange(inputName: string, value: number) {
    setAudioInputs((current) => current.map((item) => (item.inputName === inputName ? { ...item, volumePercent: value, volumeMul: value / 100 } : item)));
    setHermesChannels((current) =>
      current.map((channel) =>
        channel.inputName === inputName
          ? { ...channel, currentVolumePercent: value, currentDb: volumePercentToDb(value), estimatedDb: volumePercentToDb(value), updatedAt: new Date().toISOString() }
          : channel,
      ),
    );
    await setVolume(inputName, value);
  }

  async function handleMuteToggle(input: ObsAudioInput) {
    await muteInput(input.inputName, !input.muted);
    await refreshObsState();
  }

  async function applyAudioPreset(preset: StoredAudioPreset) {
    const realInputs = audioInputs.filter((input) => input.inputKind !== "placeholder");
    if (!realInputs.length) return;

    setBusyAction(`audio-preset-${preset.id ?? preset.name}`);

    try {
      // Aplica regras por canal para deixar trocas de contexto rápidas no meio da live.
      for (const input of realInputs) {
        const rule = preset.rules.find((candidate) => matchesAudioPresetRule(candidate, input.inputName));
        const targetVolume = rule ? rule.volumePercent : preset.fallbackVolumePercent;
        const targetMuted = rule ? rule.muted : preset.fallbackMuted;

        if (!rule && !preset.applyToUnmatched) {
          continue;
        }

        await setInputVolume(input.inputName, targetVolume);
        await setInputMute(input.inputName, targetMuted);
      }

      await refreshObsState();
    } finally {
      setBusyAction("");
    }
  }

  async function saveCurrentMixAsPreset() {
    if (!audioInputs.length || !audioPresetForm.name.trim()) return;

    const preset: StoredAudioPreset = {
      name: audioPresetForm.name.trim(),
      description: audioPresetForm.description.trim() || "Preset salvo a partir do mix atual do OBS.",
      color: audioPresetForm.color,
      system: false,
      applyToUnmatched: false,
      fallbackVolumePercent: 0,
      fallbackMuted: false,
      rules: audioInputs
        .filter((input) => input.inputKind !== "placeholder")
        .map((input) => ({
          id: crypto.randomUUID(),
          label: input.inputName,
          matchType: "exact" as const,
          matchValues: [input.inputName],
          volumePercent: input.volumePercent,
          muted: input.muted,
        })),
      createdAt: new Date().toISOString(),
    };

    await db.audioPresets.add(preset);
    setAudioPresetForm(initialAudioPresetForm);
    await loadLocalData();
  }

  async function removeAudioPreset(presetId?: number) {
    if (!presetId) return;
    await db.audioPresets.delete(presetId);
    await loadLocalData();
  }

  async function handleMediaUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await readFileAsDataUrl(file);
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : "audio";

    await db.media.add({
      name: file.name,
      kind,
      mimeType: file.type,
      dataUrl,
      size: file.size,
      createdAt: new Date().toISOString(),
    });

    await loadLocalData();
    event.target.value = "";
  }

  async function handleDeleteMedia(mediaId?: number) {
    if (!mediaId) return;
    await db.media.delete(mediaId);
    await loadLocalData();
  }

  async function handleApplyMediaToObs(sourceName: string, mediaId: number, settingKey: "file" | "local_file") {
    const media = mediaItems.find((item) => item.id === mediaId);
    if (!media) return;
    await replaceMediaInSource(sourceName, media, settingKey);
  }

  async function handleMediaVisibility(sceneName: string, sceneItemId: number, enabled: boolean) {
    await setSceneItemVisibility(sceneName, sceneItemId, enabled);
    await refreshSceneItems(sceneName);
  }

  async function saveButton() {
    if (!buttonForm.name.trim()) return;

    let payload: StoredButton["payload"];

    if (buttonForm.type === "scene") {
      payload = { sceneName: buttonForm.sceneName };
    } else if (buttonForm.type === "audio") {
      payload = {
        inputName: buttonForm.inputName,
        mode: buttonForm.audioMode as "toggleMute" | "setVolume",
        volumePercent: Number(buttonForm.volumePercent || 0),
      };
    } else if (buttonForm.type === "media") {
      payload = {
        sourceName: buttonForm.mediaSourceName,
        mode: buttonForm.mediaMode,
        mediaId: buttonForm.mediaId ? Number(buttonForm.mediaId) : undefined,
        sceneName: buttonForm.visibilitySceneName || undefined,
        sceneItemId: buttonForm.visibilitySceneItemId ? Number(buttonForm.visibilitySceneItemId) : undefined,
        settingKey: buttonForm.settingKey,
      };
    } else {
      payload = {
        macroId: Number(buttonForm.macroId),
      };
    }

    const record: StoredButton = {
      id: buttonForm.id ? Number(buttonForm.id) : undefined,
      name: buttonForm.name.trim(),
      type: buttonForm.type,
      color: buttonForm.color,
      payload,
      createdAt: new Date().toISOString(),
    };

    await db.buttons.put(record);
    setButtonForm(initialButtonForm);
    await loadLocalData();
  }

  async function removeButton(buttonId?: number) {
    if (!buttonId) return;
    await db.buttons.delete(buttonId);
    await loadLocalData();
  }

  function editButton(button: StoredButton) {
    const next = { ...initialButtonForm, id: String(button.id), name: button.name, color: button.color, type: button.type };
    if (button.type === "scene" && "sceneName" in button.payload) next.sceneName = button.payload.sceneName || "";
    if (button.type === "audio" && "inputName" in button.payload) {
      next.inputName = button.payload.inputName || "";
      next.audioMode = button.payload.mode;
      next.volumePercent = String(button.payload.volumePercent ?? 70);
    }
    if (button.type === "media" && "sourceName" in button.payload) {
      next.mediaSourceName = button.payload.sourceName || "";
      next.mediaMode = button.payload.mode;
      next.mediaId = button.payload.mediaId ? String(button.payload.mediaId) : "";
      next.visibilitySceneName = button.payload.sceneName || "";
      next.visibilitySceneItemId = button.payload.sceneItemId ? String(button.payload.sceneItemId) : "";
      next.settingKey = button.payload.settingKey || "local_file";
    }
    if (button.type === "macro" && "macroId" in button.payload) next.macroId = String(button.payload.macroId ?? "");
    setButtonForm(next);
  }

  async function runButton(button: StoredButton) {
    setBusyAction(`button-${button.id}`);
    try {
      if (button.type === "scene" && "sceneName" in button.payload && button.payload.sceneName) {
        await handleSceneClick(button.payload.sceneName);
        return;
      }
      if (button.type === "audio" && "inputName" in button.payload && button.payload.inputName) {
        const payload = button.payload;
        if (payload.mode === "setVolume") {
          await setInputVolume(payload.inputName, Number(payload.volumePercent || 0));
        } else {
          const target = audioInputs.find((item) => item.inputName === payload.inputName);
          await setInputMute(payload.inputName, !(target?.muted ?? false));
        }
        await refreshObsState();
        return;
      }
      if (button.type === "media" && "sourceName" in button.payload && button.payload.sourceName) {
        const payload = button.payload;
        await executeMediaAction({
          mode: payload.mode,
          sourceName: payload.sourceName,
          mediaId: payload.mediaId,
          sceneName: payload.sceneName,
          sceneItemId: payload.sceneItemId,
          settingKey: payload.settingKey,
        });
        return;
      }
      if (button.type === "macro" && "macroId" in button.payload) {
        const payload = button.payload;
        const macro = macros.find((item) => item.id === payload.macroId);
        if (macro) await runMacro(macro);
      }
    } finally {
      setBusyAction("");
    }
  }

  async function executeMediaAction(action: {
    mode: MediaActionMode;
    sourceName: string;
    mediaId?: number;
    sceneName?: string;
    sceneItemId?: number;
    settingKey?: "file" | "local_file";
  }) {
    if (action.mode === "replace" && action.mediaId) {
      await handleApplyMediaToObs(action.sourceName, action.mediaId, action.settingKey || "local_file");
      return;
    }
    if (action.mode === "play" || action.mode === "stop") {
      await controlMediaSource(action.sourceName, action.mode);
      return;
    }
    if ((action.mode === "show" || action.mode === "hide") && action.sceneName && action.sceneItemId) {
      await handleMediaVisibility(action.sceneName, action.sceneItemId, action.mode === "show");
    }
  }

  async function saveMacro() {
    if (!macroForm.name.trim()) return;
    await db.macros.put({
      id: macroForm.id ? Number(macroForm.id) : undefined,
      name: macroForm.name.trim(),
      actions: macroForm.actions,
      createdAt: new Date().toISOString(),
    });
    setMacroForm({ id: "", name: "", actions: [createMacroAction()] });
    await loadLocalData();
  }

  function editMacro(macro: StoredMacro) {
    setMacroForm({
      id: String(macro.id),
      name: macro.name,
      actions: macro.actions.length ? macro.actions : [createMacroAction()],
    });
  }

  async function deleteMacro(macroId?: number) {
    if (!macroId) return;
    await db.macros.delete(macroId);
    await loadLocalData();
  }

  async function runMacro(macro: StoredMacro) {
    for (const action of macro.actions) {
      if (action.delayMs > 0) await wait(action.delayMs);

      if (action.kind === "scene" && action.payload.sceneName) {
        await switchScene(action.payload.sceneName);
      }
      if (action.kind === "stream" && action.payload.streamAction) {
        await setStreamState(action.payload.streamAction);
      }
      if (action.kind === "audio" && action.payload.inputName) {
        if (typeof action.payload.volumePercent === "number") {
          await setInputVolume(action.payload.inputName, action.payload.volumePercent);
        } else {
          const channel = audioInputs.find((item) => item.inputName === action.payload.inputName);
          await setInputMute(action.payload.inputName, !(channel?.muted ?? false));
        }
      }
      if (action.kind === "media" && action.payload.sourceName) {
        await executeMediaAction({
          mode: action.payload.mediaActionMode || "play",
          sourceName: action.payload.sourceName,
          mediaId: action.payload.mediaId,
          sceneName: action.payload.sceneNameForVisibility,
          sceneItemId: action.payload.sceneItemId,
          settingKey: action.payload.settingKey,
        });
      }
    }

    await refreshObsState();
  }

  async function runHermesAutomation() {
    const actions = evaluateHermesRules(hermesChannels, DEFAULT_HERMES_RULES);
    if (!actions.length) return;

    const appliedInputs = new Set<string>();
    for (const action of actions) {
      if (appliedInputs.has(action.channel.inputName)) continue;
      appliedInputs.add(action.channel.inputName);
      await handleVolumeChange(action.channel.inputName, action.nextVolume);
    }

    if (actions.length) {
      setCommandFeedback(actions[0]?.reason || "Hermes ajustou o mixer automaticamente.");
    }
    await persistHermesChannels();
  }

  async function startCulto() {
    const cultoRun = {
      startedAt: new Date().toISOString(),
      active: true,
      currentStepId: DEFAULT_CULTO_STEPS[0].id,
    };
    await updateHermesSettings({ cultoRun, autoMode: true });
    const sceneName = settings.hermes.sceneMap.aguardando || "Aguardando";
    if (sceneName) {
      await handleSceneClick(sceneName);
    }
    setCommandFeedback("Hermes iniciou o culto e entrou na cena Aguardando.");
  }

  async function syncCultoScene() {
    const cultoRun = settings.hermes.cultoRun;
    if (!cultoRun?.active) return;

    const startedAt = new Date(cultoRun.startedAt).getTime();
    const step = getCultoStep(Date.now() - startedAt);
    if (step.id !== cultoRun.currentStepId) {
      await updateHermesSettings({
        cultoRun: {
          ...cultoRun,
          currentStepId: step.id,
        },
      });
    }

    const sceneName = settings.hermes.sceneMap[step.sceneRole];
    if (!sceneName) return;
    if (currentScene !== sceneName) {
      await handleSceneClick(sceneName);
      setCommandFeedback(`Hermes mudou automaticamente para ${sceneName}.`);
    }
  }

  async function runHermesCommand() {
    const parsed = parseCommand(commandText, scenes, hermesChannels);
    setCommandFeedback(parsed.response);

    if (parsed.type === "scene") {
      await handleSceneClick(parsed.sceneName);
    }
    if (parsed.type === "volume") {
      const channel = hermesChannels.find((item) => item.inputName === parsed.inputName);
      const nextVolume = Math.max(0, Math.min(100, (channel?.currentVolumePercent || 0) + parsed.deltaPercent));
      await handleVolumeChange(parsed.inputName, nextVolume);
      await refreshObsState();
    }
    if (parsed.type === "mute") {
      await muteInput(parsed.inputName, parsed.state);
      await refreshObsState();
    }
    if (parsed.type === "autoMode") {
      await updateHermesSettings({ autoMode: parsed.enabled });
    }
    if (parsed.type === "startCulto") {
      await startCulto();
    }

    const nextHistory = [commandText, ...settings.hermes.commandHistory].filter(Boolean).slice(0, 8);
    await updateHermesSettings({ commandHistory: nextHistory });
  }

  async function persistHermesChannels(nextChannels = hermesChannels) {
    if (!nextChannels.length) return;
    await db.hermesChannels.bulkPut(nextChannels);
  }

  async function saveHermesScene(role: keyof AppSettings["hermes"]["sceneMap"], sceneName: string) {
    await updateHermesSettings({
      sceneMap: {
        ...settings.hermes.sceneMap,
        [role]: sceneName,
      },
    });
  }

  async function saveChannelMonitorDevice(channelId: string, deviceId: string) {
    const nextChannels = hermesChannels.map((channel) => (channel.id === channelId ? { ...channel, monitorDeviceId: deviceId } : channel));
    setHermesChannels(nextChannels);
    await persistHermesChannels(nextChannels);
  }

  async function toggleChannelMonitor(channelId: string) {
    const currentStop = monitorRef.current.get(channelId);
    if (currentStop) {
      await currentStop();
      monitorRef.current.delete(channelId);
      const nextChannels = hermesChannels.map((channel) =>
        channel.id === channelId ? { ...channel, monitorSource: "estimated" as const, rms: 0, peak: 0, clipping: false } : channel,
      );
      setHermesChannels(nextChannels);
      await persistHermesChannels(nextChannels);
      return;
    }

    const targetChannel = hermesChannels.find((channel) => channel.id === channelId);
    if (!targetChannel) return;

    const stopMonitor = await startAudioMonitor(targetChannel.monitorDeviceId || settings.hermes.defaultMonitorDeviceId, async (metrics) => {
      setHermesChannels((current) => {
        const nextChannels = current.map((channel) => (channel.id === channelId ? applyAudioMetrics(channel, metrics) : channel));
        void db.hermesChannels.bulkPut(nextChannels);
        return nextChannels;
      });
    });

    monitorRef.current.set(channelId, stopMonitor);
    await loadAudioDevices();
  }

  function paddedAudioInputs() {
    const placeholders = Array.from({ length: Math.max(0, 12 - audioInputs.length) }, (_, index) => ({
      inputName: `Canal livre ${index + 1}`,
      volumeMul: 0,
      volumePercent: 0,
      muted: true,
      inputKind: "placeholder",
    }));

    return [...audioInputs, ...placeholders];
  }

  const currentScene = scenes.find((scene) => scene.isCurrent)?.name || "Nenhuma";

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 pb-24 pt-5 sm:px-6">
      <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-soft backdrop-blur md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-accent">PWA Frontend Only</p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Stream Control Lite PRO</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Painel leve para controlar cenas, stream, áudio, mídia local e macros do OBS direto do navegador.
            </p>
          </div>
          <div className="space-y-3">
            <div className="rounded-full border border-white/10 bg-panel px-4 py-3 text-sm text-slate-200">
              {obsConnected ? `Conectado • Cena atual: ${currentScene}` : connectionMessage}
            </div>
            {installPrompt ? (
              <button
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-bold text-slate-950"
                onClick={async () => {
                  const promptEvent = installPrompt as BeforeInstallPromptEvent;
                  await promptEvent.prompt();
                  setInstallPrompt(null);
                }}
              >
                Instalar app
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-[24px] bg-panel/80 p-2 sm:grid-cols-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`rounded-[18px] px-4 py-3 text-sm font-bold transition ${
                activeTab === tab.key ? "bg-accent text-slate-950" : "bg-white/5 text-slate-300"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "buttons" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-6">
            <Panel title="Painel rápido" subtitle="Botões customizáveis para cena, áudio, mídia e macro.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {buttons.length ? (
                  buttons.map((button) => (
                    <div key={button.id} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                      <button
                        className="w-full rounded-[18px] px-4 py-5 text-left text-base font-black text-slate-950"
                        style={{ background: button.color }}
                        onClick={() => void runButton(button)}
                      >
                        {busyAction === `button-${button.id}` ? "Executando..." : button.name}
                      </button>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">{button.type}</p>
                      <div className="mt-3 flex gap-2">
                        <SmallButton onClick={() => editButton(button)}>Editar</SmallButton>
                        <SmallButton onClick={() => void removeButton(button.id)}>Excluir</SmallButton>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyBlock text="Nenhum botão salvo ainda." />
                )}
              </div>
            </Panel>

            <Panel title="Controle de cenas e stream" subtitle="Acesso rápido ao OBS em tempo real.">
              <div className="flex flex-wrap gap-3">
                <button
                  className={`rounded-full px-5 py-3 text-sm font-bold ${streamActive ? "bg-rose-500 text-white" : "bg-accent text-slate-950"}`}
                  onClick={() => void handleStreamToggle()}
                >
                  {busyAction === "stream" ? "Aguarde..." : streamActive ? "Stop Stream" : "Start Stream"}
                </button>
                <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white" onClick={() => void refreshObsState()}>
                  Atualizar estado
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {scenes.map((scene) => (
                  <button
                    key={scene.name}
                    className={`rounded-[20px] border px-4 py-4 text-left ${scene.isCurrent ? "border-accent bg-accentSoft text-accent" : "border-white/10 bg-white/5 text-white"}`}
                    onClick={() => void handleSceneClick(scene.name)}
                  >
                    <div className="text-sm font-semibold uppercase tracking-[0.18em]">{scene.isCurrent ? "No ar" : "Cena"}</div>
                    <div className="mt-2 text-lg font-black">{scene.name}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Macros" subtitle="Ações sequenciais para cenários repetitivos.">
              <div className="space-y-3">
                {macros.length ? (
                  macros.map((macro) => (
                    <div key={macro.id} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-white">{macro.name}</h3>
                          <p className="text-sm text-slate-400">{macro.actions.length} ações encadeadas</p>
                        </div>
                        <div className="flex gap-2">
                          <SmallButton onClick={() => void runMacro(macro)}>Executar</SmallButton>
                          <SmallButton onClick={() => editMacro(macro)}>Editar</SmallButton>
                          <SmallButton onClick={() => void deleteMacro(macro.id)}>Excluir</SmallButton>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyBlock text="Nenhuma macro cadastrada." />
                )}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Criar botão" subtitle="Monte atalhos do jeito que fizer sentido para sua live.">
              <div className="grid gap-3">
                <Field label="Nome do botão">
                  <input className={inputClass} value={buttonForm.name} onChange={(event) => setButtonForm((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <Field label="Cor">
                  <input className={`${inputClass} h-12`} type="color" value={buttonForm.color} onChange={(event) => setButtonForm((current) => ({ ...current, color: event.target.value }))} />
                </Field>
                <Field label="Tipo">
                  <select className={inputClass} value={buttonForm.type} onChange={(event) => setButtonForm((current) => ({ ...current, type: event.target.value as StoredButtonType }))}>
                    <option value="scene">Cena</option>
                    <option value="audio">Áudio</option>
                    <option value="media">Mídia</option>
                    <option value="macro">Macro</option>
                  </select>
                </Field>

                {buttonForm.type === "scene" ? (
                  <Field label="Cena">
                    <select className={inputClass} value={buttonForm.sceneName} onChange={(event) => setButtonForm((current) => ({ ...current, sceneName: event.target.value }))}>
                      <option value="">Selecione</option>
                      {sceneOptions.map((sceneName) => (
                        <option key={sceneName} value={sceneName}>
                          {sceneName}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                {buttonForm.type === "audio" ? (
                  <>
                    <Field label="Canal de áudio">
                      <select className={inputClass} value={buttonForm.inputName} onChange={(event) => setButtonForm((current) => ({ ...current, inputName: event.target.value }))}>
                        <option value="">Selecione</option>
                        {audioInputs.map((input) => (
                          <option key={input.inputName} value={input.inputName}>
                            {input.inputName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Ação">
                      <select className={inputClass} value={buttonForm.audioMode} onChange={(event) => setButtonForm((current) => ({ ...current, audioMode: event.target.value }))}>
                        <option value="toggleMute">Alternar mute</option>
                        <option value="setVolume">Definir volume</option>
                      </select>
                    </Field>
                    {buttonForm.audioMode === "setVolume" ? (
                      <Field label="Volume %">
                        <input className={inputClass} type="number" min={0} max={100} value={buttonForm.volumePercent} onChange={(event) => setButtonForm((current) => ({ ...current, volumePercent: event.target.value }))} />
                      </Field>
                    ) : null}
                  </>
                ) : null}

                {buttonForm.type === "media" ? (
                  <>
                    <Field label="Fonte OBS">
                      <select className={inputClass} value={buttonForm.mediaSourceName} onChange={(event) => setButtonForm((current) => ({ ...current, mediaSourceName: event.target.value }))}>
                        <option value="">Selecione</option>
                        {mediaSources.map((source) => (
                          <option key={source.inputName} value={source.inputName}>
                            {source.inputName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Ação de mídia">
                      <select className={inputClass} value={buttonForm.mediaMode} onChange={(event) => setButtonForm((current) => ({ ...current, mediaMode: event.target.value as MediaActionMode }))}>
                        <option value="replace">Trocar mídia</option>
                        <option value="play">Play</option>
                        <option value="stop">Stop</option>
                        <option value="show">Mostrar fonte</option>
                        <option value="hide">Ocultar fonte</option>
                      </select>
                    </Field>
                    {buttonForm.mediaMode === "replace" ? (
                      <>
                        <Field label="Arquivo salvo">
                          <select className={inputClass} value={buttonForm.mediaId} onChange={(event) => setButtonForm((current) => ({ ...current, mediaId: event.target.value }))}>
                            <option value="">Selecione</option>
                            {mediaItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Chave da fonte OBS">
                          <select className={inputClass} value={buttonForm.settingKey} onChange={(event) => setButtonForm((current) => ({ ...current, settingKey: event.target.value as "file" | "local_file" }))}>
                            <option value="local_file">local_file</option>
                            <option value="file">file</option>
                          </select>
                        </Field>
                      </>
                    ) : null}
                    {buttonForm.mediaMode === "show" || buttonForm.mediaMode === "hide" ? (
                      <>
                        <Field label="Cena da fonte">
                          <select className={inputClass} value={buttonForm.visibilitySceneName} onChange={(event) => setButtonForm((current) => ({ ...current, visibilitySceneName: event.target.value }))}>
                            <option value="">Selecione</option>
                            {sceneOptions.map((sceneName) => (
                              <option key={sceneName} value={sceneName}>
                                {sceneName}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Scene item ID">
                          <input className={inputClass} value={buttonForm.visibilitySceneItemId} onChange={(event) => setButtonForm((current) => ({ ...current, visibilitySceneItemId: event.target.value }))} />
                        </Field>
                      </>
                    ) : null}
                  </>
                ) : null}

                {buttonForm.type === "macro" ? (
                  <Field label="Macro">
                    <select className={inputClass} value={buttonForm.macroId} onChange={(event) => setButtonForm((current) => ({ ...current, macroId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {macros.map((macro) => (
                        <option key={macro.id} value={macro.id}>
                          {macro.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <div className="flex gap-3 pt-2">
                  <button className="rounded-full bg-accent px-5 py-3 text-sm font-black text-slate-950" onClick={() => void saveButton()}>
                    Salvar botão
                  </button>
                  <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white" onClick={() => setButtonForm(initialButtonForm)}>
                    Limpar
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Criar macro" subtitle="Sequência de ações para início, transição ou encerramento.">
              <div className="grid gap-4">
                <Field label="Nome da macro">
                  <input className={inputClass} value={macroForm.name} onChange={(event) => setMacroForm((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                {macroForm.actions.map((action, index) => (
                  <div key={action.id} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <strong className="text-sm uppercase tracking-[0.18em] text-accent">Ação {index + 1}</strong>
                      <button
                        className="text-xs font-bold text-slate-400"
                        onClick={() =>
                          setMacroForm((current) => ({
                            ...current,
                            actions: current.actions.filter((item) => item.id !== action.id),
                          }))
                        }
                      >
                        Remover
                      </button>
                    </div>
                    <div className="grid gap-3">
                      <Field label="Tipo">
                        <select
                          className={inputClass}
                          value={action.kind}
                          onChange={(event) =>
                            setMacroForm((current) => ({
                              ...current,
                              actions: current.actions.map((item) => (item.id === action.id ? { ...item, kind: event.target.value as MacroAction["kind"], payload: {} } : item)),
                            }))
                          }
                        >
                          <option value="scene">Cena</option>
                          <option value="stream">Stream</option>
                          <option value="audio">Áudio</option>
                          <option value="media">Mídia</option>
                        </select>
                      </Field>
                      <Field label="Delay (ms)">
                        <input
                          className={inputClass}
                          type="number"
                          value={action.delayMs}
                          onChange={(event) =>
                            setMacroForm((current) => ({
                              ...current,
                              actions: current.actions.map((item) => (item.id === action.id ? { ...item, delayMs: Number(event.target.value) } : item)),
                            }))
                          }
                        />
                      </Field>

                      {action.kind === "scene" ? (
                        <Field label="Cena alvo">
                          <select
                            className={inputClass}
                            value={action.payload.sceneName || ""}
                            onChange={(event) =>
                              setMacroForm((current) => ({
                                ...current,
                                actions: current.actions.map((item) =>
                                  item.id === action.id ? { ...item, payload: { ...item.payload, sceneName: event.target.value } } : item,
                                ),
                              }))
                            }
                          >
                            <option value="">Selecione</option>
                            {sceneOptions.map((sceneName) => (
                              <option key={sceneName} value={sceneName}>
                                {sceneName}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : null}

                      {action.kind === "stream" ? (
                        <Field label="Ação da stream">
                          <select
                            className={inputClass}
                            value={action.payload.streamAction || "start"}
                            onChange={(event) =>
                              setMacroForm((current) => ({
                                ...current,
                                actions: current.actions.map((item) =>
                                  item.id === action.id ? { ...item, payload: { ...item.payload, streamAction: event.target.value as "start" | "stop" } } : item,
                                ),
                              }))
                            }
                          >
                            <option value="start">Start</option>
                            <option value="stop">Stop</option>
                          </select>
                        </Field>
                      ) : null}

                      {action.kind === "audio" ? (
                        <>
                          <Field label="Canal">
                            <select
                              className={inputClass}
                              value={action.payload.inputName || ""}
                              onChange={(event) =>
                                setMacroForm((current) => ({
                                  ...current,
                                  actions: current.actions.map((item) =>
                                    item.id === action.id ? { ...item, payload: { ...item.payload, inputName: event.target.value } } : item,
                                  ),
                                }))
                              }
                            >
                              <option value="">Selecione</option>
                              {audioInputs.map((input) => (
                                <option key={input.inputName} value={input.inputName}>
                                  {input.inputName}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Volume % (deixe vazio para alternar mute)">
                            <input
                              className={inputClass}
                              type="number"
                              value={action.payload.volumePercent ?? ""}
                              onChange={(event) =>
                                setMacroForm((current) => ({
                                  ...current,
                                  actions: current.actions.map((item) =>
                                    item.id === action.id
                                      ? { ...item, payload: { ...item.payload, volumePercent: event.target.value === "" ? undefined : Number(event.target.value) } }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </Field>
                        </>
                      ) : null}

                      {action.kind === "media" ? (
                        <>
                          <Field label="Fonte OBS">
                            <select
                              className={inputClass}
                              value={action.payload.sourceName || ""}
                              onChange={(event) =>
                                setMacroForm((current) => ({
                                  ...current,
                                  actions: current.actions.map((item) =>
                                    item.id === action.id ? { ...item, payload: { ...item.payload, sourceName: event.target.value } } : item,
                                  ),
                                }))
                              }
                            >
                              <option value="">Selecione</option>
                              {mediaSources.map((source) => (
                                <option key={source.inputName} value={source.inputName}>
                                  {source.inputName}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Ação de mídia">
                            <select
                              className={inputClass}
                              value={action.payload.mediaActionMode || "play"}
                              onChange={(event) =>
                                setMacroForm((current) => ({
                                  ...current,
                                  actions: current.actions.map((item) =>
                                    item.id === action.id
                                      ? { ...item, payload: { ...item.payload, mediaActionMode: event.target.value as MediaActionMode } }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              <option value="replace">Trocar mídia</option>
                              <option value="play">Play</option>
                              <option value="stop">Stop</option>
                              <option value="show">Mostrar</option>
                              <option value="hide">Ocultar</option>
                            </select>
                          </Field>
                          {action.payload.mediaActionMode === "replace" ? (
                            <>
                              <Field label="Arquivo salvo">
                                <select
                                  className={inputClass}
                                  value={action.payload.mediaId ?? ""}
                                  onChange={(event) =>
                                    setMacroForm((current) => ({
                                      ...current,
                                      actions: current.actions.map((item) =>
                                        item.id === action.id ? { ...item, payload: { ...item.payload, mediaId: Number(event.target.value) } } : item,
                                      ),
                                    }))
                                  }
                                >
                                  <option value="">Selecione</option>
                                  {mediaItems.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Chave da fonte OBS">
                                <select
                                  className={inputClass}
                                  value={action.payload.settingKey || "local_file"}
                                  onChange={(event) =>
                                    setMacroForm((current) => ({
                                      ...current,
                                      actions: current.actions.map((item) =>
                                        item.id === action.id ? { ...item, payload: { ...item.payload, settingKey: event.target.value as "file" | "local_file" } } : item,
                                      ),
                                    }))
                                  }
                                >
                                  <option value="local_file">local_file</option>
                                  <option value="file">file</option>
                                </select>
                              </Field>
                            </>
                          ) : null}
                          {action.payload.mediaActionMode === "show" || action.payload.mediaActionMode === "hide" ? (
                            <>
                              <Field label="Cena da fonte">
                                <select
                                  className={inputClass}
                                  value={action.payload.sceneNameForVisibility || ""}
                                  onChange={(event) =>
                                    setMacroForm((current) => ({
                                      ...current,
                                      actions: current.actions.map((item) =>
                                        item.id === action.id
                                          ? { ...item, payload: { ...item.payload, sceneNameForVisibility: event.target.value } }
                                          : item,
                                      ),
                                    }))
                                  }
                                >
                                  <option value="">Selecione</option>
                                  {sceneOptions.map((sceneName) => (
                                    <option key={sceneName} value={sceneName}>
                                      {sceneName}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Scene item ID">
                                <input
                                  className={inputClass}
                                  value={action.payload.sceneItemId ?? ""}
                                  onChange={(event) =>
                                    setMacroForm((current) => ({
                                      ...current,
                                      actions: current.actions.map((item) =>
                                        item.id === action.id
                                          ? { ...item, payload: { ...item.payload, sceneItemId: Number(event.target.value) } }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                              </Field>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white"
                    onClick={() => setMacroForm((current) => ({ ...current, actions: [...current.actions, createMacroAction()] }))}
                  >
                    Adicionar ação
                  </button>
                  <button className="rounded-full bg-accent px-5 py-3 text-sm font-black text-slate-950" onClick={() => void saveMacro()}>
                    Salvar macro
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "audio" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Panel title="Presets de áudio" subtitle="Troque rápido entre voz, instrumentos, podcast e live.">
              <div className="grid gap-4">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <h3 className="text-lg font-black text-white">Salvar mix atual como preset</h3>
                  <p className="mt-1 text-sm text-slate-400">Use seus volumes atuais do OBS para criar um preset personalizado.</p>
                  <div className="mt-4 grid gap-3">
                    <Field label="Nome do preset">
                      <input
                        className={inputClass}
                        value={audioPresetForm.name}
                        onChange={(event) => setAudioPresetForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </Field>
                    <Field label="Descrição">
                      <input
                        className={inputClass}
                        value={audioPresetForm.description}
                        onChange={(event) => setAudioPresetForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </Field>
                    <Field label="Cor">
                      <input
                        className={`${inputClass} h-12`}
                        type="color"
                        value={audioPresetForm.color}
                        onChange={(event) => setAudioPresetForm((current) => ({ ...current, color: event.target.value }))}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-3">
                      <button className="rounded-full bg-accent px-5 py-3 text-sm font-black text-slate-950" onClick={() => void saveCurrentMixAsPreset()}>
                        Salvar preset atual
                      </button>
                      <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white" onClick={() => setAudioPresetForm(initialAudioPresetForm)}>
                        Limpar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {allAudioPresets.map((preset) => (
                    <div key={`${preset.system ? "system" : "custom"}-${preset.id ?? preset.name}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-950" style={{ background: preset.color }}>
                            {preset.system ? "Recomendado" : "Personalizado"}
                          </div>
                          <h3 className="text-lg font-black text-white">{preset.name}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-400">{preset.description}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {preset.rules.length} regras {preset.applyToUnmatched ? "• aplica fallback nos demais canais" : "• mantém canais não mapeados"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-full bg-accent px-4 py-2 text-xs font-black text-slate-950"
                            onClick={() => void applyAudioPreset(preset)}
                          >
                            {busyAction === `audio-preset-${preset.id ?? preset.name}` ? "Aplicando..." : "Aplicar"}
                          </button>
                          {!preset.system ? <SmallButton onClick={() => void removeAudioPreset(preset.id)}>Excluir</SmallButton> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Sugestões para som mais nítido" subtitle="Presets ajudam na operação, mas precisam de ganho e filtros corretos.">
              <div className="grid gap-3 sm:grid-cols-2">
                <TipCard title="Voz Limpa" text="Deixa microfone principal em evidência e derruba trilha, desktop e instrumentos." />
                <TipCard title="Voz + Fundo" text="Mantém a fala inteligível com música baixa e sem competir com o host." />
                <TipCard title="Voz + Violão" text="Equilibra voz na frente e violão abaixo, reduzindo sobras de outros canais." />
                <TipCard title="Segurança" text="Baixa tudo alguns degraus para evitar sustos, clipping e transições abruptas." />
              </div>
            </Panel>
          </div>

          <Panel title="Mixer de áudio" subtitle="Volume e mute em tempo real para no mínimo 12 canais.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {paddedAudioInputs().map((input) => (
                <div key={input.inputName} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-white">{input.inputName}</h3>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{input.inputKind || "Entrada"}</p>
                    </div>
                    {"placeholder" !== input.inputKind ? (
                      <button
                        className={`rounded-full px-4 py-2 text-xs font-black ${input.muted ? "bg-rose-500 text-white" : "bg-white/10 text-white"}`}
                        onClick={() => void handleMuteToggle(input)}
                      >
                        {input.muted ? "Muted" : "Mute"}
                      </button>
                    ) : (
                      <span className="rounded-full bg-white/5 px-4 py-2 text-xs font-bold text-slate-400">Livre</span>
                    )}
                  </div>

                  <div className="mt-6">
                    <input
                      className="w-full"
                      type="range"
                      min={0}
                      max={100}
                      value={input.volumePercent}
                      disabled={input.inputKind === "placeholder"}
                      onChange={(event) => void handleVolumeChange(input.inputName, Number(event.target.value))}
                    />
                    <div className="mt-2 flex justify-between text-xs text-slate-400">
                      <span>0%</span>
                      <span className="font-bold text-white">{input.volumePercent}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      ) : null}

      {activeTab === "media" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Biblioteca local" subtitle="Arquivos salvos no IndexedDB para uso offline.">
            <div className="space-y-5">
              <label className="block rounded-[22px] border border-dashed border-white/20 bg-white/5 p-6 text-center">
                <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-accent">Upload local</span>
                <span className="mt-2 block text-sm text-slate-300">Imagem, vídeo ou áudio</span>
                <input className="mt-4 block w-full text-sm text-slate-300" type="file" accept="image/*,video/*,audio/*" onChange={handleMediaUpload} />
              </label>

              <div className="space-y-3">
                {mediaItems.length ? (
                  mediaItems.map((item) => (
                    <div key={item.id} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-white">{item.name}</h3>
                          <p className="text-sm text-slate-400">
                            {item.kind} • {formatBytes(item.size)}
                          </p>
                        </div>
                        <SmallButton onClick={() => void handleDeleteMedia(item.id)}>Excluir</SmallButton>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyBlock text="Nenhuma mídia salva ainda." />
                )}
              </div>
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel title="Aplicar mídia no OBS" subtitle="Troca local da mídia de uma fonte existente.">
              <div className="grid gap-3">
                {mediaSources.length ? (
                  mediaSources.map((source) => (
                    <MediaSourceCard
                      key={source.inputName}
                      source={source}
                      mediaItems={mediaItems}
                      onApply={handleApplyMediaToObs}
                      onPlay={(name) => void controlMediaSource(name, "play")}
                      onStop={(name) => void controlMediaSource(name, "stop")}
                    />
                  ))
                ) : (
                  <EmptyBlock text="Conecte ao OBS para listar as fontes de mídia." />
                )}
              </div>
            </Panel>

            <Panel title="Mostrar ou ocultar fonte" subtitle="Usa os scene items da cena selecionada.">
              <div className="grid gap-3">
                <Field label="Cena">
                  <select className={inputClass} value={selectedSceneForItems} onChange={(event) => setSelectedSceneForItems(event.target.value)}>
                    <option value="">Selecione</option>
                    {sceneOptions.map((sceneName) => (
                      <option key={sceneName} value={sceneName}>
                        {sceneName}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="space-y-3">
                  {sceneItems.length ? (
                    sceneItems.map((item) => (
                      <div key={item.sceneItemId} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-bold text-white">{item.sourceName}</h3>
                            <p className="text-sm text-slate-400">Scene item ID: {item.sceneItemId}</p>
                          </div>
                          <button
                            className={`rounded-full px-4 py-2 text-sm font-black ${item.enabled ? "bg-accent text-slate-950" : "bg-white/10 text-white"}`}
                            onClick={() => void handleMediaVisibility(item.sceneName, item.sceneItemId, !item.enabled)}
                          >
                            {item.enabled ? "Ocultar" : "Mostrar"}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyBlock text="Selecione uma cena para listar suas fontes." />
                  )}
                </div>
              </div>
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "hermes" ? (
        <HermesController
          obsConnected={obsConnected}
          currentScene={currentScene}
          connectionMessage={connectionMessage}
          scenes={scenes}
          channels={hermesChannels}
          hermesSettings={settings.hermes}
          cultoStep={getCultoStep(settings.hermes.cultoRun ? Date.now() - new Date(settings.hermes.cultoRun.startedAt).getTime() : 0)}
          commandText={commandText}
          commandFeedback={commandFeedback}
          availableAudioDevices={availableAudioDevices}
          runningCulto={Boolean(settings.hermes.cultoRun?.active)}
          onCommandTextChange={setCommandText}
          onConnect={() => void connectObs()}
          onDisconnect={() => void disconnectObs()}
          onToggleAuto={() => void updateHermesSettings({ autoMode: !settings.hermes.autoMode })}
          onStartCulto={() => void startCulto()}
          onChangeScene={(sceneName) => void handleSceneClick(sceneName)}
          onRunCommand={() => void runHermesCommand()}
          onSaveSceneMap={(role, sceneName) => void saveHermesScene(role, sceneName)}
          onSaveMonitorDevice={(channelId, deviceId) => void saveChannelMonitorDevice(channelId, deviceId)}
          onToggleMonitor={(channelId) => void toggleChannelMonitor(channelId)}
        />
      ) : null}

      {activeTab === "config" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <Panel title="Conexão com OBS" subtitle="Informe IP, porta 4455 e senha.">
            <div className="grid gap-4">
              <Field label="IP / Host">
                <input className={inputClass} value={settings.obs.host} onChange={(event) => setSettings((current) => ({ ...current, obs: { ...current.obs, host: event.target.value } }))} />
              </Field>
              <Field label="Porta">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.obs.port}
                  onChange={(event) => setSettings((current) => ({ ...current, obs: { ...current.obs, port: Number(event.target.value) } }))}
                />
              </Field>
              <Field label="Senha">
                <input
                  className={inputClass}
                  type="password"
                  value={settings.obs.password}
                  onChange={(event) => setSettings((current) => ({ ...current, obs: { ...current.obs, password: event.target.value } }))}
                />
              </Field>
              <div className="flex flex-wrap gap-3 pt-2">
                <button className="rounded-full bg-accent px-5 py-3 text-sm font-black text-slate-950" onClick={() => void saveSettings()}>
                  Salvar local
                </button>
                <button className="rounded-full bg-sky-400 px-5 py-3 text-sm font-black text-slate-950" disabled={loadingConnection} onClick={() => void connectObs()}>
                  {loadingConnection ? "Conectando..." : "Conectar"}
                </button>
                <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white" onClick={() => void disconnectObs()}>
                  Desconectar
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Resumo operacional" subtitle="Visão rápida do estado atual do app.">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusCard label="Status OBS" value={obsConnected ? "Conectado" : "Desconectado"} accent={obsConnected ? "text-emerald-300" : "text-slate-300"} />
              <StatusCard label="Stream" value={streamActive ? "No ar" : "Parada"} accent={streamActive ? "text-rose-300" : "text-slate-300"} />
              <StatusCard label="Cenas" value={String(scenes.length)} accent="text-white" />
              <StatusCard label="Canais de áudio" value={String(audioInputs.length)} accent="text-white" />
              <StatusCard label="Fontes de mídia OBS" value={String(mediaSources.length)} accent="text-white" />
              <StatusCard label="Arquivos locais" value={String(mediaItems.length)} accent="text-white" />
            </div>
            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
              <p>Este MVP roda 100% no frontend. As configurações, botões, macros e mídias ficam no IndexedDB do navegador.</p>
              <p className="mt-2">Para o OBS aceitar conexão, o plugin WebSocket precisa estar ativo na porta configurada.</p>
            </div>
          </Panel>
        </section>
      ) : null}
    </main>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-panel/80 p-5 shadow-soft backdrop-blur md:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">{subtitle}</p>
        <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">{text}</div>;
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white" onClick={onClick}>
      {children}
    </button>
  );
}

function StatusCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accent}`}>{value}</div>
    </div>
  );
}

function TipCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
      <h3 className="text-base font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function MediaSourceCard({
  source,
  mediaItems,
  onApply,
  onPlay,
  onStop,
}: {
  source: ObsMediaSource;
  mediaItems: MediaItem[];
  onApply: (sourceName: string, mediaId: number, settingKey: "file" | "local_file") => Promise<void>;
  onPlay: (sourceName: string) => void;
  onStop: (sourceName: string) => void;
}) {
  const [mediaId, setMediaId] = useState("");
  const [settingKey, setSettingKey] = useState<"file" | "local_file">("local_file");

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">{source.inputName}</h3>
          <p className="text-sm text-slate-400">{source.inputKind || "Fonte de mídia"}</p>
        </div>
        <div className="flex gap-2">
          <SmallButton onClick={() => onPlay(source.inputName)}>Play</SmallButton>
          <SmallButton onClick={() => onStop(source.inputName)}>Stop</SmallButton>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <select className={inputClass} value={mediaId} onChange={(event) => setMediaId(event.target.value)}>
          <option value="">Selecione um arquivo</option>
          {mediaItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select className={inputClass} value={settingKey} onChange={(event) => setSettingKey(event.target.value as "file" | "local_file")}>
          <option value="local_file">local_file</option>
          <option value="file">file</option>
        </select>
        <button
          className="rounded-full bg-accent px-5 py-3 text-sm font-black text-slate-950"
          onClick={() => {
            if (!mediaId) return;
            void onApply(source.inputName, Number(mediaId), settingKey);
          }}
        >
          Trocar mídia da fonte
        </button>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesAudioPresetRule(rule: StoredAudioPreset["rules"][number], inputName: string) {
  const normalizedInput = inputName.toLowerCase();
  return rule.matchValues.some((value) => {
    const normalizedValue = value.toLowerCase();
    if (rule.matchType === "exact") {
      return normalizedInput === normalizedValue;
    }
    return normalizedInput.includes(normalizedValue);
  });
}

function buildRecommendedAudioPresets(): StoredAudioPreset[] {
  return [
    {
      id: -1,
      name: "Voz Limpa",
      description: "Puxa microfones de fala para frente e reduz trilhas, desktop e instrumentos para máxima inteligibilidade.",
      color: "#1dd3b0",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 18,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 86, false),
        createKeywordRule("Música de fundo", ["music", "musica", "trilha", "bgm", "spotify", "playback"], 12, false),
        createKeywordRule("Desktop", ["desktop", "game", "jogo", "browser", "discord", "chrome"], 10, false),
        createKeywordRule("Instrumentos", ["violao", "violão", "guitarra", "guitar", "teclado", "keyboard", "baixo", "bass", "bateria", "drums"], 0, true),
      ],
    },
    {
      id: -2,
      name: "Voz + Fundo",
      description: "Mantém a voz clara com trilha ambiente baixa para abertura, espera e transições leves.",
      color: "#38bdf8",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 20,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 82, false),
        createKeywordRule("Música de fundo", ["music", "musica", "trilha", "bgm", "spotify", "playback"], 24, false),
        createKeywordRule("Desktop", ["desktop", "game", "jogo", "browser", "discord", "chrome"], 12, false),
        createKeywordRule("Instrumentos", ["violao", "violão", "guitarra", "guitar", "teclado", "keyboard", "baixo", "bass", "bateria", "drums"], 0, true),
      ],
    },
    {
      id: -3,
      name: "Voz + Violão",
      description: "Configuração rápida para live acústica, deixando a voz na frente e o violão logo abaixo.",
      color: "#f59e0b",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 12,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 84, false),
        createKeywordRule("Violão", ["violao", "violão", "acoustic", "acustico"], 68, false),
        createKeywordRule("Música e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify"], 0, true),
        createKeywordRule("Outros instrumentos", ["guitarra", "guitar", "teclado", "keyboard", "baixo", "bass", "bateria", "drums"], 0, true),
      ],
    },
    {
      id: -4,
      name: "Teclado + Voz",
      description: "Boa base para cantor e teclado, com a fala definida e instrumento preenchendo sem embolar.",
      color: "#a78bfa",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 16,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 82, false),
        createKeywordRule("Teclado", ["teclado", "keyboard", "keys", "piano"], 70, false),
        createKeywordRule("Música e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify"], 0, true),
        createKeywordRule("Cordas e bateria", ["violao", "violão", "guitarra", "guitar", "baixo", "bass", "bateria", "drums"], 0, true),
      ],
    },
    {
      id: -5,
      name: "Banda / Louvor",
      description: "Distribuição mais ampla para banda, mantendo voz principal acima e instrumentos equilibrados.",
      color: "#fb7185",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 42,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 86, false),
        createKeywordRule("Violão", ["violao", "violão", "acoustic", "acustico"], 60, false),
        createKeywordRule("Guitarra", ["guitarra", "guitar", "lead", "solo"], 62, false),
        createKeywordRule("Teclado", ["teclado", "keyboard", "keys", "piano"], 64, false),
        createKeywordRule("Baixo", ["baixo", "bass"], 60, false),
        createKeywordRule("Bateria", ["bateria", "drums", "kick", "snare", "tom", "perc"], 58, false),
        createKeywordRule("Trilha e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify"], 0, true),
      ],
    },
    {
      id: -6,
      name: "Bateria + Teclado + Guitarra",
      description: "Preset base para banda sem voz em destaque, com bateria controlada, teclado preenchendo e guitarra presente sem sobrar.",
      color: "#22c55e",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 34,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 58, false),
        createKeywordRule("Guitarra", ["guitarra", "guitar", "lead", "solo", "gt"], 66, false),
        createKeywordRule("Teclado", ["teclado", "keyboard", "keys", "piano"], 68, false),
        createKeywordRule("Baixo", ["baixo", "bass"], 60, false),
        createKeywordRule("Bateria", ["bateria", "drums", "kick", "snare", "tom", "perc", "oh"], 62, false),
        createKeywordRule("Trilha e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify", "playback"], 0, true),
      ],
    },
    {
      id: -7,
      name: "Voz + Banda Completa",
      description: "Preset para condução principal da live, mantendo a voz nítida acima de bateria, teclado e guitarra.",
      color: "#06b6d4",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 36,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 86, false),
        createKeywordRule("Guitarra", ["guitarra", "guitar", "lead", "solo", "gt"], 58, false),
        createKeywordRule("Teclado", ["teclado", "keyboard", "keys", "piano"], 62, false),
        createKeywordRule("Baixo", ["baixo", "bass"], 56, false),
        createKeywordRule("Bateria", ["bateria", "drums", "kick", "snare", "tom", "perc", "oh"], 54, false),
        createKeywordRule("Trilha e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify", "playback"], 0, true),
      ],
    },
    {
      id: -8,
      name: "Solo de Guitarra",
      description: "Sobe guitarra para momentos de solo, segura teclado e bateria e mantém a voz utilizável se entrar.",
      color: "#eab308",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 28,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 74, false),
        createKeywordRule("Guitarra", ["guitarra", "guitar", "lead", "solo", "gt"], 78, false),
        createKeywordRule("Teclado", ["teclado", "keyboard", "keys", "piano"], 52, false),
        createKeywordRule("Baixo", ["baixo", "bass"], 54, false),
        createKeywordRule("Bateria", ["bateria", "drums", "kick", "snare", "tom", "perc", "oh"], 50, false),
        createKeywordRule("Trilha e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify", "playback"], 0, true),
      ],
    },
    {
      id: -9,
      name: "Momento de Palavra",
      description: "Derruba bateria, teclado e guitarra para a fala sair limpa durante avisos, oração, recados ou apresentação.",
      color: "#14b8a6",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 12,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 88, false),
        createKeywordRule("Guitarra", ["guitarra", "guitar", "lead", "solo", "gt"], 8, false),
        createKeywordRule("Teclado", ["teclado", "keyboard", "keys", "piano"], 10, false),
        createKeywordRule("Baixo", ["baixo", "bass"], 6, false),
        createKeywordRule("Bateria", ["bateria", "drums", "kick", "snare", "tom", "perc", "oh"], 6, false),
        createKeywordRule("Trilha e desktop", ["music", "musica", "trilha", "desktop", "browser", "spotify", "playback"], 0, true),
      ],
    },
    {
      id: -10,
      name: "Segurança Anti-Estouro",
      description: "Reduz todos os canais para um patamar seguro durante teste, retorno alto ou início de live.",
      color: "#f97316",
      system: true,
      applyToUnmatched: true,
      fallbackVolumePercent: 38,
      fallbackMuted: false,
      createdAt: "system",
      rules: [
        createKeywordRule("Microfones", ["mic", "voz", "voice", "microfone", "host", "talk"], 72, false),
        createKeywordRule("Música", ["music", "musica", "trilha", "bgm", "spotify", "playback"], 14, false),
        createKeywordRule("Desktop", ["desktop", "game", "jogo", "browser", "discord", "chrome"], 10, false),
        createKeywordRule("Instrumentos", ["violao", "violão", "guitarra", "guitar", "teclado", "keyboard", "baixo", "bass", "bateria", "drums"], 46, false),
      ],
    },
  ];
}

function createKeywordRule(label: string, matchValues: string[], volumePercent: number, muted: boolean) {
  return {
    id: `system-${label}-${matchValues.join("-")}`,
    label,
    matchType: "keyword" as const,
    matchValues,
    volumePercent,
    muted,
  };
}

function mergeSettings(settings: Partial<AppSettings> | AppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    obs: {
      ...DEFAULT_SETTINGS.obs,
      ...settings.obs,
    },
    hermes: {
      ...DEFAULT_SETTINGS.hermes,
      ...settings.hermes,
      sceneMap: {
        ...DEFAULT_SETTINGS.hermes.sceneMap,
        ...settings.hermes?.sceneMap,
      },
      commandHistory: settings.hermes?.commandHistory || DEFAULT_SETTINGS.hermes.commandHistory,
    },
  };
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}

const inputClass =
  "w-full rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent";
