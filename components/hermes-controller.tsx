"use client";

import type { HermesChannel, HermesChatMessage, HermesCultoStep, HermesSettings, ObsScene } from "@/lib/types";

type HermesControllerProps = {
  obsConnected: boolean;
  currentScene: string;
  connectionMessage: string;
  scenes: ObsScene[];
  channels: HermesChannel[];
  hermesSettings: HermesSettings;
  cultoStep: HermesCultoStep;
  commandText: string;
  commandFeedback: string;
  chatMessages: HermesChatMessage[];
  chatBusy: boolean;
  availableAudioDevices: MediaDeviceInfo[];
  runningCulto: boolean;
  onCommandTextChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleAuto: () => void;
  onStartCulto: () => void;
  onChangeScene: (sceneName: string) => void;
  onRunCommand: () => void;
  onSaveSceneMap: (role: keyof HermesSettings["sceneMap"], sceneName: string) => void;
  onSaveMonitorDevice: (channelId: string, deviceId: string) => void;
  onToggleMonitor: (channelId: string) => void;
  onSaveAiProvider: (provider: HermesSettings["aiProvider"]) => void;
  onSaveAiModel: (model: string) => void;
  onSaveSystemPrompt: (prompt: string) => void;
  onToggleSpeakResponses: () => void;
};

const sceneLabels: Array<{ key: keyof HermesSettings["sceneMap"]; label: string; hint: string }> = [
  { key: "aguardando", label: "Aguardando", hint: "Tela de espera" },
  { key: "louvor", label: "Louvor", hint: "Cena com letras via OBS/Holyrics" },
  { key: "oferta", label: "Oferta", hint: "Momento de oferta" },
  { key: "biblia", label: "Biblia", hint: "Versículos capturados no OBS" },
  { key: "pregacao", label: "Pregacao", hint: "Câmera principal + banner" },
  { key: "encerramento", label: "Encerramento", hint: "Cena final do culto" },
];

export function HermesController(props: HermesControllerProps) {
  const {
    obsConnected,
    currentScene,
    connectionMessage,
    scenes,
    channels,
    hermesSettings,
    cultoStep,
    commandText,
    commandFeedback,
    chatMessages,
    chatBusy,
    availableAudioDevices,
    runningCulto,
    onCommandTextChange,
    onConnect,
    onDisconnect,
    onToggleAuto,
    onStartCulto,
    onChangeScene,
    onRunCommand,
    onSaveSceneMap,
    onSaveMonitorDevice,
    onToggleMonitor,
    onSaveAiProvider,
    onSaveAiModel,
    onSaveSystemPrompt,
    onToggleSpeakResponses,
  } = props;

  return (
    <section className="mt-6 grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <HermesPanel title="Hermes AI Controller" subtitle="Modo automático para culto, cenas, áudio e comandos naturais.">
          <div className="grid gap-4 md:grid-cols-2">
            <StatusPill label="OBS" value={obsConnected ? "Conectado" : "Desconectado"} tone={obsConnected ? "emerald" : "slate"} />
            <StatusPill label="Cena atual" value={currentScene} tone="sky" />
            <StatusPill label="Auto" value={hermesSettings.autoMode ? "Ativo" : "Manual"} tone={hermesSettings.autoMode ? "amber" : "slate"} />
            <StatusPill label="Culto" value={runningCulto ? cultoStep.label : "Parado"} tone={runningCulto ? "rose" : "slate"} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-full bg-accent px-5 py-3 text-sm font-black text-slate-950" onClick={onConnect}>
              Conectar
            </button>
            <button className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white" onClick={onDisconnect}>
              Desconectar
            </button>
            <button
              className={`rounded-full px-5 py-3 text-sm font-black ${hermesSettings.autoMode ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"}`}
              onClick={onToggleAuto}
            >
              {hermesSettings.autoMode ? "Auto ligado" : "Ativar Auto"}
            </button>
            <button className="rounded-full bg-rose-400 px-5 py-3 text-sm font-black text-slate-950" onClick={onStartCulto}>
              Iniciar Culto
            </button>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
            <p>{connectionMessage}</p>
            <p className="mt-2">Roteiro ativo: {cultoStep.label}. Hermes assume Holyrics apenas como fonte já capturada nas cenas do OBS.</p>
          </div>
        </HermesPanel>

        <HermesPanel title="Chat Hermes" subtitle="Converse com o agente e deixe ele operar o OBS quando fizer sentido.">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-300">
                <span>Provedor</span>
                <select className={inputClass} value={hermesSettings.aiProvider} onChange={(event) => onSaveAiProvider(event.target.value as HermesSettings["aiProvider"])}>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-300">
                <span>Modelo</span>
                <input className={inputClass} value={hermesSettings.aiModel} onChange={(event) => onSaveAiModel(event.target.value)} />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-300">
              <span>Prompt do Hermes</span>
              <textarea className={inputClass} rows={3} value={hermesSettings.systemPrompt} onChange={(event) => onSaveSystemPrompt(event.target.value)} />
            </label>
            <button className={`rounded-full px-5 py-3 text-sm font-black ${hermesSettings.speakResponses ? "bg-sky-300 text-slate-950" : "bg-white/10 text-white"}`} onClick={onToggleSpeakResponses}>
              {hermesSettings.speakResponses ? "Voz ligada" : "Ativar voz"}
            </button>
            <div className="max-h-[280px] space-y-3 overflow-y-auto rounded-[22px] border border-white/10 bg-black/20 p-4">
              {chatMessages.length ? (
                chatMessages.map((message) => (
                  <div key={message.id} className={`rounded-[18px] px-4 py-3 text-sm ${message.role === "user" ? "bg-accent text-slate-950" : "bg-white/10 text-slate-100"}`}>
                    <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em]">{message.role === "user" ? "Você" : "Hermes"}</div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">Nenhuma conversa ainda. Peça uma cena, ajuste de áudio ou orientação operacional.</div>
              )}
            </div>
            <textarea
              className={inputClass}
              rows={4}
              value={commandText}
              onChange={(event) => onCommandTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  if (!chatBusy) onRunCommand();
                }
              }}
              placeholder="Ex.: Hermes, troca para louvor e baixa a música"
            />
            <button
              className={`rounded-full px-5 py-3 text-sm font-black transition ${chatBusy ? "cursor-not-allowed bg-slate-500 text-slate-200" : "bg-accent text-slate-950"}`}
              disabled={chatBusy}
              onClick={onRunCommand}
            >
              {chatBusy ? "Hermes pensando..." : "Enviar para Hermes"}
            </button>
            <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">{commandFeedback}</div>
          </div>
        </HermesPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <HermesPanel title="Roteiro de culto" subtitle="Trocas automáticas de cena por tempo.">
          <div className="space-y-3">
            {[
              "0 min -> Aguardando",
              "5 min -> Louvor",
              "30 min -> Oferta",
              "40 min -> Pregacao",
              "60 min -> Encerramento",
            ].map((item) => (
              <div key={item} className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm font-semibold text-white">
                {item}
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3">
            {sceneLabels.map((sceneRole) => (
              <label key={sceneRole.key} className="grid gap-2 text-sm font-semibold text-slate-300">
                <span>
                  {sceneRole.label} <span className="font-normal text-slate-500">• {sceneRole.hint}</span>
                </span>
                <select className={inputClass} value={hermesSettings.sceneMap[sceneRole.key]} onChange={(event) => onSaveSceneMap(sceneRole.key, event.target.value)}>
                  <option value="">Selecione uma cena</option>
                  {scenes.map((scene) => (
                    <option key={scene.name} value={scene.name}>
                      {scene.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </HermesPanel>

        <HermesPanel title="Troca rápida de cena" subtitle="Atalhos para cenas usadas com Holyrics via OBS.">
          <div className="grid gap-3 sm:grid-cols-2">
            {scenes.length ? (
              scenes.map((scene) => (
                <button
                  key={scene.name}
                  className={`rounded-[22px] border px-4 py-4 text-left ${scene.isCurrent ? "border-accent bg-accentSoft text-accent" : "border-white/10 bg-white/5 text-white"}`}
                  onClick={() => onChangeScene(scene.name)}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em]">{scene.isCurrent ? "No ar" : "Cena"}</div>
                  <div className="mt-2 text-lg font-black">{scene.name}</div>
                </button>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">Conecte ao OBS para listar as cenas.</div>
            )}
          </div>
        </HermesPanel>
      </div>

      <HermesPanel title="Canais dinâmicos" subtitle="Volume, dB estimado, RMS e pico em tempo real.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.length ? (
            channels.map((channel) => {
              const meterPercent = clamp(Math.round(((channel.currentDb + 60) / 60) * 100), 0, 100);
              const peakPercent = clamp(Math.round(channel.peak * 100), 0, 100);
              return (
                <div key={channel.id} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-950" style={{ background: channel.color }}>
                        {channel.name}
                      </div>
                      <h3 className="truncate text-lg font-black text-white">{channel.inputName}</h3>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{channel.inputKind || "Entrada"} • prioridade {channel.priority}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${channel.muted ? "bg-rose-500 text-white" : "bg-white/10 text-white"}`}>
                      {channel.muted ? "Mute" : "Live"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-slate-300">
                    <MetricRow label="Volume" value={`${channel.currentVolumePercent}%`} />
                    <MetricRow label="dB" value={`${channel.currentDb.toFixed(1)} dB`} />
                    <MetricRow label="RMS" value={channel.rms.toFixed(3)} />
                    <MetricRow label="Pico" value={channel.peak.toFixed(2)} />
                  </div>

                  <div className="mt-4 space-y-3">
                    <MeterBar label="Nível" percent={meterPercent} color={channel.color} />
                    <MeterBar label="Pico" percent={peakPercent} color={channel.clipping ? "#ef4444" : "#f8fafc"} />
                  </div>

                  <div className="mt-4 grid gap-3">
                    <select className={inputClass} value={channel.monitorDeviceId || ""} onChange={(event) => onSaveMonitorDevice(channel.id, event.target.value)}>
                      <option value="">Monitor padrão do navegador</option>
                      {availableAudioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Dispositivo ${device.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-full bg-white/10 px-4 py-3 text-sm font-bold text-white" onClick={() => onToggleMonitor(channel.id)}>
                      {channel.monitorSource === "webAudio" ? "Parar monitor" : "Ativar monitor"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">Conecte ao OBS para carregar os canais do mixer.</div>
          )}
        </div>
      </HermesPanel>
    </section>
  );
}

function HermesPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "emerald" | "sky" | "amber" | "rose" | "slate" }) {
  const className =
    tone === "emerald"
      ? "bg-emerald-400/15 text-emerald-200"
      : tone === "sky"
        ? "bg-sky-400/15 text-sky-200"
        : tone === "amber"
          ? "bg-amber-300/15 text-amber-100"
          : tone === "rose"
            ? "bg-rose-400/15 text-rose-100"
            : "bg-white/10 text-slate-200";

  return (
    <div className={`rounded-[22px] border border-white/10 p-4 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}

function MeterBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const inputClass =
  "w-full rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent";
