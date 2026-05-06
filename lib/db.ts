import Dexie, { Table } from "dexie";
import type { AppSettings, HermesChannel, MediaItem, StoredAudioPreset, StoredButton, StoredMacro } from "@/lib/types";

export class StreamControlDb extends Dexie {
  settings!: Table<AppSettings, string>;
  media!: Table<MediaItem, number>;
  buttons!: Table<StoredButton, number>;
  macros!: Table<StoredMacro, number>;
  audioPresets!: Table<StoredAudioPreset, number>;
  hermesChannels!: Table<HermesChannel, string>;

  constructor() {
    super("stream-control-lite-pro-db");
    this.version(1).stores({
      settings: "&id",
      media: "++id, name, kind, createdAt",
      buttons: "++id, name, type, createdAt",
      macros: "++id, name, createdAt",
    });
    this.version(2).stores({
      settings: "&id",
      media: "++id, name, kind, createdAt",
      buttons: "++id, name, type, createdAt",
      macros: "++id, name, createdAt",
      audioPresets: "++id, name, system, createdAt",
    });
    this.version(3).stores({
      settings: "&id",
      media: "++id, name, kind, createdAt",
      buttons: "++id, name, type, createdAt",
      macros: "++id, name, createdAt",
      audioPresets: "++id, name, system, createdAt",
      hermesChannels: "&id, inputName, priority, updatedAt",
    });
  }
}

export const db = new StreamControlDb();

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app-settings",
  obs: {
    host: "127.0.0.1",
    port: 4455,
    password: "",
  },
  hermes: {
    autoMode: false,
    defaultMonitorDeviceId: "",
    commandHistory: [],
    cultoRun: null,
    sceneMap: {
      aguardando: "Aguardando",
      louvor: "Louvor",
      oferta: "Oferta",
      biblia: "Biblia",
      pregacao: "Pregacao",
      encerramento: "Encerramento",
    },
  },
};
