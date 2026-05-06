import { NextRequest, NextResponse } from "next/server";

type RequestMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type RequestBody = {
  provider: "openai" | "openrouter" | "ollama";
  model: string;
  systemPrompt: string;
  messages: RequestMessage[];
  context: {
    currentScene: string;
    autoMode: boolean;
    scenes: string[];
    channels: Array<{ inputName: string; name: string; currentVolumePercent: number; currentDb: number; muted: boolean }>;
  };
};

const instruction = [
  "Voce e Hermes AI Controller, operador de culto e OBS.",
  "Responda sempre em JSON puro, sem markdown.",
  'Formato: {"reply":"texto","actions":[...]}',
  'Acoes permitidas: {"type":"scene","sceneName":"..."}, {"type":"volume","inputName":"...","deltaPercent":8}, {"type":"mute","inputName":"...","state":true}, {"type":"autoMode","enabled":true}, {"type":"startCulto"}, {"type":"status"}',
  "Se o pedido for apenas conversa, use actions vazio.",
  "Se houver ambiguidade, responda de forma curta e nao invente nomes de cena ou canal fora do contexto.",
].join(" ");

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const messages: RequestMessage[] = [
      {
        role: "system",
        content: `${instruction}\n\nPrompt do operador:\n${body.systemPrompt}\n\nContexto atual:\n${JSON.stringify(body.context)}`,
      },
      ...body.messages,
    ];

    const data =
      body.provider === "ollama"
        ? await callOllama(body.model, messages)
        : body.provider === "openrouter"
          ? await callOpenRouter(body.model, messages)
          : await callOpenAI(body.model, messages);
    const parsed = parseModelJson(data);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callOpenAI(model: string, messages: RequestMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || model || "gpt-4.1-mini",
      temperature: 0.2,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI retornou ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content || "";
}

async function callOpenRouter(model: string, messages: RequestMessage[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY nao configurada.");
  }

  const response = await fetch(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Hermes AI Controller",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || model || "deepseek/deepseek-chat-v3-0324",
      temperature: 0.2,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter retornou ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content || "";
}

async function callOllama(model: string, messages: RequestMessage[]) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || model || "llama3.1",
      messages,
      stream: false,
      format: "json",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama retornou ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    message?: { content?: string };
  };
  return json.message?.content || "";
}

function parseModelJson(content: string) {
  const normalized = content.trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("A IA nao retornou JSON valido.");
  }

  const parsed = JSON.parse(normalized.slice(start, end + 1)) as { reply?: string; actions?: unknown[] };
  return {
    reply: parsed.reply || "Hermes respondeu sem texto.",
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}
