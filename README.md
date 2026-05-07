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
- Hermes AI Controller com modo automático para cultos
- roteiro automático de culto por cena e tempo
- comandos em linguagem natural para cena e áudio
- monitoramento de áudio com Web Audio API
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

## Rodando com Docker

```bash
docker compose up --build
```

Abra `http://localhost:3000`.

## Hermes Chat

O chat do Hermes roda na aba `Hermes` e usa a rota `app/api/hermes/chat`.

Para `OpenAI`, configure:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Para `Ollama`, configure:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1
```

O provedor e o modelo tambem podem ser ajustados pela interface do app.

Para `OpenRouter` com `DeepSeek`, configure:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=deepseek/deepseek-chat-v3-0324
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=Hermes AI Controller
```

Se quiser usar esse fluxo pela interface, selecione `OpenRouter` como provedor e deixe o modelo como `deepseek/deepseek-chat-v3-0324` ou outro modelo DeepSeek publicado no OpenRouter.

## Configuração no OBS

1. Ative o `obs-websocket` no OBS Studio.
2. Use a porta `4455` ou a que estiver configurada no plugin.
3. Informe IP, porta e senha na tela `OBS`.
4. Crie as cenas `Aguardando`, `Louvor`, `Oferta`, `Biblia`, `Pregacao` e `Encerramento` para usar o roteiro automático do Hermes.
5. Se quiser medição em tempo real por dispositivo, permita acesso ao microfone no navegador e associe cada canal no painel `Hermes`.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Framework preset: `Next.js`.
3. Root Directory: `./`
4. Install Command: `npm install`
5. Build Command: `npm run build`

Não há variáveis de ambiente obrigatórias neste MVP.
