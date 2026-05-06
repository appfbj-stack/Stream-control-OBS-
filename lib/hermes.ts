import type {
  HermesAudioMetrics,
  HermesChannel,
  HermesCultoStep,
  HermesParsedCommand,
  HermesRule,
  HermesSceneMap,
  ObsAudioInput,
  ObsScene,
} from "@/lib/types";

const CHANNEL_COLORS = ["#22c55e", "#38bdf8", "#f97316", "#fb7185", "#eab308", "#a78bfa", "#14b8a6", "#f43f5e"];

const KEYWORD_PRESETS: Array<{ test: RegExp; name: string; color: string; priority: number; aliases: string[] }> = [
  { test: /pastor|mic|microfone|voz/i, name: "Mic Pastor", color: "#22c55e", priority: 100, aliases: ["pastor", "microfone", "mic", "voz"] },
  { test: /teclado|keyboard|keys|piano/i, name: "Teclado", color: "#38bdf8", priority: 70, aliases: ["teclado", "keyboard", "piano"] },
  { test: /bateria|drum|kick|snare|perc/i, name: "Bateria", color: "#f97316", priority: 60, aliases: ["bateria", "drums", "drum"] },
  { test: /baixo|bass/i, name: "Baixo", color: "#fb7185", priority: 65, aliases: ["baixo", "bass"] },
  { test: /guitarra|guitar|violao|violão/i, name: "Guitarra", color: "#eab308", priority: 68, aliases: ["guitarra", "guitar", "violao", "violão"] },
  { test: /instrument/i, name: "Instrumentos", color: "#a78bfa", priority: 50, aliases: ["instrumentos"] },
  { test: /music|musica|m[úu]sica|playback|trilha|bgm/i, name: "Música", color: "#14b8a6", priority: 40, aliases: ["musica", "música", "music", "playback"] },
];

export const DEFAULT_HERMES_RULES: HermesRule[] = [
  {
    id: "pastor-low",
    name: "Pastor abaixo do alvo",
    enabled: true,
    priority: 100,
    channelMatch: ["pastor", "microfone", "mic", "voz"],
    operator: "lt",
    thresholdDb: -30,
    action: "increase",
    amountPercent: 6,
    minVolumePercent: 55,
    maxVolumePercent: 100,
    reason: "Mic Pastor abaixo de -30 dB, sobe o ganho para recuperar inteligibilidade.",
  },
  {
    id: "music-high",
    name: "Música muito alta",
    enabled: true,
    priority: 80,
    channelMatch: ["musica", "música", "music", "playback", "trilha", "instrumentos"],
    operator: "gt",
    thresholdDb: -5,
    action: "decrease",
    amountPercent: 7,
    minVolumePercent: 0,
    maxVolumePercent: 75,
    reason: "Música acima de -5 dB, reduz para evitar clipping e mascaramento da fala.",
  },
  {
    id: "anti-clipping",
    name: "Anti clipping geral",
    enabled: true,
    priority: 120,
    channelMatch: ["*"],
    operator: "gt",
    thresholdDb: -1,
    action: "decrease",
    amountPercent: 10,
    minVolumePercent: 0,
    maxVolumePercent: 90,
    reason: "Pico perto de 0 dB, segura o canal para evitar clipping.",
  },
];

export const DEFAULT_CULTO_STEPS: HermesCultoStep[] = [
  { id: "aguardando", label: "Aguardando", sceneRole: "aguardando", offsetMinutes: 0, description: "Tela de espera inicial." },
  { id: "louvor", label: "Louvor", sceneRole: "louvor", offsetMinutes: 5, description: "Entrada do louvor com letras capturadas no OBS." },
  { id: "oferta", label: "Oferta", sceneRole: "oferta", offsetMinutes: 30, description: "Momento de oferta e avisos." },
  { id: "pregacao", label: "Pregação", sceneRole: "pregacao", offsetMinutes: 40, description: "Câmera principal com banner de mensagem." },
  { id: "encerramento", label: "Encerramento", sceneRole: "encerramento", offsetMinutes: 60, description: "Tela final do culto." },
];

export function createDefaultHermesChannel(input: ObsAudioInput, index: number): HermesChannel {
  const preset = KEYWORD_PRESETS.find((item) => item.test.test(input.inputName));
  const fallbackColor = CHANNEL_COLORS[index % CHANNEL_COLORS.length];
  const estimatedDb = typeof input.volumeDb === "number" ? input.volumeDb : volumePercentToDb(input.volumePercent);

  return {
    id: `hermes-${slugify(input.inputName)}`,
    inputName: input.inputName,
    name: preset?.name || input.inputName,
    color: preset?.color || fallbackColor,
    aliases: preset?.aliases || [],
    priority: preset?.priority || 30,
    currentVolumePercent: input.volumePercent,
    currentDb: typeof input.volumeDb === "number" ? input.volumeDb : estimatedDb,
    estimatedDb,
    rms: 0,
    peak: 0,
    muted: input.muted,
    inputKind: input.inputKind,
    monitorDeviceId: "",
    monitorLabel: "",
    monitorSource: "estimated",
    clipping: false,
    updatedAt: new Date().toISOString(),
  };
}

export function syncHermesChannels(storedChannels: HermesChannel[], inputs: ObsAudioInput[]) {
  return inputs.map((input, index) => {
    const existing = storedChannels.find((channel) => channel.inputName === input.inputName);
    const fallback = createDefaultHermesChannel(input, index);
    const currentDb = typeof input.volumeDb === "number" ? input.volumeDb : existing?.currentDb ?? fallback.currentDb;
    const estimatedDb = typeof input.volumeDb === "number" ? input.volumeDb : volumePercentToDb(input.volumePercent);

    return {
      ...fallback,
      ...existing,
      inputName: input.inputName,
      inputKind: input.inputKind,
      currentVolumePercent: input.volumePercent,
      currentDb,
      estimatedDb,
      muted: input.muted,
      updatedAt: new Date().toISOString(),
    } satisfies HermesChannel;
  });
}

export function applyAudioMetrics(channel: HermesChannel, metrics: HermesAudioMetrics): HermesChannel {
  return {
    ...channel,
    rms: metrics.rms,
    peak: metrics.peak,
    currentDb: metrics.db,
    estimatedDb: metrics.db,
    clipping: metrics.clipping,
    monitorSource: metrics.source,
    updatedAt: metrics.updatedAt,
  };
}

export function evaluateHermesRules(channels: HermesChannel[], rules: HermesRule[]) {
  return rules
    .filter((rule) => rule.enabled)
    .sort((left, right) => right.priority - left.priority)
    .flatMap((rule) => {
      const targets = channels.filter((channel) => matchesChannel(channel, rule.channelMatch));
      return targets
        .filter((channel) => {
          const metric = channel.currentDb;
          return rule.operator === "lt" ? metric < rule.thresholdDb : metric > rule.thresholdDb;
        })
        .map((channel) => {
          const delta = rule.action === "increase" ? rule.amountPercent : -rule.amountPercent;
          const nextVolume = clamp(channel.currentVolumePercent + delta, rule.minVolumePercent, rule.maxVolumePercent);
          return {
            channel,
            nextVolume,
            reason: rule.reason,
            priority: rule.priority,
          };
        });
    })
    .sort((left, right) => {
      if (right.channel.priority !== left.channel.priority) return right.channel.priority - left.channel.priority;
      return right.priority - left.priority;
    });
}

export function getCultoStep(elapsedMs: number) {
  const elapsedMinutes = elapsedMs / 60000;
  let active = DEFAULT_CULTO_STEPS[0];

  for (const step of DEFAULT_CULTO_STEPS) {
    if (elapsedMinutes >= step.offsetMinutes) {
      active = step;
    }
  }

  return active;
}

export function resolveSceneForRole(sceneMap: HermesSceneMap, role: keyof HermesSceneMap) {
  return sceneMap[role];
}

export function parseCommand(text: string, scenes: ObsScene[], channels: HermesChannel[]): HermesParsedCommand {
  const normalized = normalize(text);
  if (!normalized) {
    return { type: "unknown", confidence: 0, response: "Digite um comando para o Hermes interpretar." };
  }

  if (normalized.includes("iniciar culto") || normalized.includes("start culto")) {
    return { type: "startCulto", confidence: 0.96, response: "Hermes vai iniciar o roteiro automático do culto." };
  }

  if (normalized.includes("ativar auto") || normalized.includes("modo automatico") || normalized.includes("modo automático")) {
    return { type: "autoMode", enabled: true, confidence: 0.9, response: "Hermes vai ativar o modo automático." };
  }

  if (normalized.includes("desativar auto")) {
    return { type: "autoMode", enabled: false, confidence: 0.9, response: "Hermes vai desativar o modo automático." };
  }

  const sceneMatch = findBestScene(normalized, scenes);
  if (sceneMatch && /(trocar|mudar|ir|abrir)/.test(normalized)) {
    return {
      type: "scene",
      sceneName: sceneMatch.name,
      confidence: sceneMatch.score,
      response: `Hermes vai trocar para a cena ${sceneMatch.name}.`,
    };
  }

  const channelMatch = findBestChannel(normalized, channels);
  if (channelMatch && /(aumentar|subir)/.test(normalized)) {
    return {
      type: "volume",
      inputName: channelMatch.inputName,
      deltaPercent: 8,
      confidence: channelMatch.score,
      response: `Hermes vai aumentar ${channelMatch.name}.`,
    };
  }

  if (channelMatch && /(baixar|reduzir|diminuir)/.test(normalized)) {
    return {
      type: "volume",
      inputName: channelMatch.inputName,
      deltaPercent: -8,
      confidence: channelMatch.score,
      response: `Hermes vai reduzir ${channelMatch.name}.`,
    };
  }

  if (channelMatch && /(mutar|silenciar)/.test(normalized)) {
    return {
      type: "mute",
      inputName: channelMatch.inputName,
      state: true,
      confidence: channelMatch.score,
      response: `Hermes vai mutar ${channelMatch.name}.`,
    };
  }

  if (channelMatch && /(desmutar|ativar audio|ativar áudio)/.test(normalized)) {
    return {
      type: "mute",
      inputName: channelMatch.inputName,
      state: false,
      confidence: channelMatch.score,
      response: `Hermes vai abrir o áudio de ${channelMatch.name}.`,
    };
  }

  return { type: "unknown", confidence: 0.2, response: "Hermes não encontrou uma ação confiável para esse comando." };
}

export function getHermesScenesSummary(sceneMap: HermesSceneMap) {
  return [
    `Louvor -> ${sceneMap.louvor || "Louvor"}`,
    `Biblia -> ${sceneMap.biblia || "Biblia"}`,
    `Pregacao -> ${sceneMap.pregacao || "Pregacao"}`,
  ];
}

export function volumePercentToDb(volumePercent: number) {
  if (volumePercent <= 0) return -60;
  const normalized = volumePercent / 100;
  return Math.max(-60, 20 * Math.log10(normalized));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function slugify(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function matchesChannel(channel: HermesChannel, filters: string[]) {
  if (filters.includes("*")) return true;
  const haystack = normalize([channel.name, channel.inputName, ...channel.aliases].join(" "));
  return filters.some((filter) => haystack.includes(normalize(filter)));
}

function findBestScene(text: string, scenes: ObsScene[]) {
  const candidates = scenes
    .map((scene) => ({
      name: scene.name,
      score: scoreMatch(text, scene.name),
    }))
    .filter((item) => item.score > 0.45)
    .sort((left, right) => right.score - left.score);

  return candidates[0];
}

function findBestChannel(text: string, channels: HermesChannel[]) {
  const candidates = channels
    .map((channel) => {
      const terms = [channel.name, channel.inputName, ...channel.aliases].join(" ");
      return {
        ...channel,
        score: scoreMatch(text, terms),
      };
    })
    .filter((item) => item.score > 0.35)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.priority - left.priority;
    });

  return candidates[0];
}

function scoreMatch(text: string, candidate: string) {
  const normalizedText = normalize(text);
  const normalizedCandidate = normalize(candidate);
  if (normalizedText.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedText)) {
    return 0.95;
  }

  const tokens = normalizedCandidate.split(/\s+/).filter(Boolean);
  const hits = tokens.filter((token) => normalizedText.includes(token)).length;
  return hits / Math.max(tokens.length, 1);
}
