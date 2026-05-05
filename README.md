# Stream Control Lite PRO

MVP PWA para controle remoto de cenas, áudio, mídia e macros no OBS Studio usando `obs-websocket-js`, `Dexie` e `Next.js`.

## Stack

- Next.js App Router
- Tailwind CSS
- Dexie + IndexedDB
- obs-websocket-js
- PWA com Service Worker

## Recursos

- conexão com OBS por IP, porta e senha
- troca de cenas
- start/stop stream
- mixer com até 12+ canais de áudio
- upload e gerenciamento de mídia local
- troca de arquivo em fonte de mídia do OBS
- play/stop de mídia
- mostrar/ocultar fonte
- botões customizáveis
- macros com múltiplas ações
- funcionamento 100% frontend

## Estrutura

```text
stream-control-lite-pro/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    pwa-registration.tsx
  lib/
    db.ts
    obs.ts
    types.ts
  public/
    manifest.json
    sw.js
    icons/
      icon.svg
  next.config.mjs
  package.json
  postcss.config.js
  tailwind.config.ts
  tsconfig.json
```

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Configuração no OBS

1. Ative o `obs-websocket` no OBS Studio.
2. Use a porta `4455` ou a que estiver configurada no plugin.
3. Informe IP, porta e senha na tela `OBS`.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Framework preset: `Next.js`.
3. Root Directory: `./`
4. Install Command: `npm install`
5. Build Command: `npm run build`

Não há variáveis de ambiente obrigatórias neste MVP.
