import dgram from "node:dgram";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RequestBody = {
  ip: string;
  port?: number;
  command:
    | { type: "ping" }
    | { type: "fader"; channel: number; levelPercent: number }
    | { type: "mute"; channel: number; muted: boolean }
    | { type: "mainMute"; muted: boolean }
    | { type: "renameChannel"; channel: number; name: string }
    | { type: "preset"; commands: Array<{ address: string; argType: "f" | "i" | "s"; value: number | string }> };
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const port = body.port || 10024;

    if (body.command.type === "ping") {
      const reply = await sendAndReceive(body.ip, port, encodeOscMessage("/xinfo"));
      return NextResponse.json({ ok: true, reply: decodeOscStrings(reply) });
    }

    if (body.command.type === "fader") {
      await send(body.ip, port, encodeOscMessage(`/ch/${pad2(body.command.channel)}/mix/fader`, "f", clamp(body.command.levelPercent / 100, 0, 1)));
      return NextResponse.json({ ok: true });
    }

    if (body.command.type === "mute") {
      await send(body.ip, port, encodeOscMessage(`/ch/${pad2(body.command.channel)}/mix/on`, "i", body.command.muted ? 0 : 1));
      return NextResponse.json({ ok: true });
    }

    if (body.command.type === "mainMute") {
      await send(body.ip, port, encodeOscMessage("/lr/mix/on", "i", body.command.muted ? 0 : 1));
      return NextResponse.json({ ok: true });
    }

    if (body.command.type === "renameChannel") {
      await send(body.ip, port, encodeOscMessage(`/ch/${pad2(body.command.channel)}/config/name`, "s", body.command.name));
      return NextResponse.json({ ok: true });
    }

    for (const cmd of body.command.commands) {
      await send(body.ip, port, encodeOscMessage(cmd.address, cmd.argType, cmd.value));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao falar com a X18.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function send(ip: string, port: number, payload: Buffer) {
  return new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.send(payload, port, ip, (error) => {
      socket.close();
      if (error) reject(error);
      else resolve();
    });
  });
}

function sendAndReceive(ip: string, port: number, payload: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Timeout ao conectar com a X18."));
    }, 2000);

    socket.on("message", (msg) => {
      clearTimeout(timer);
      socket.close();
      resolve(msg);
    });

    socket.send(payload, port, ip, (error) => {
      if (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
      }
    });
  });
}

function encodeOscMessage(address: string, argType?: "f" | "i" | "s", value?: number | string) {
  const addressBuffer = padOscString(address);
  const tagBuffer = padOscString(argType ? `,${argType}` : ",");
  const parts = [addressBuffer, tagBuffer];

  if (argType === "f" && typeof value === "number") {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatBE(value, 0);
    parts.push(buffer);
  }

  if (argType === "i" && typeof value === "number") {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value, 0);
    parts.push(buffer);
  }

  if (argType === "s" && typeof value === "string") {
    parts.push(padOscString(value));
  }

  return Buffer.concat(parts);
}

function decodeOscStrings(buffer: Buffer) {
  return buffer
    .toString("utf8")
    .split("\u0000")
    .map((item) => item.trim())
    .filter(Boolean);
}

function padOscString(value: string) {
  const raw = Buffer.from(`${value}\0`, "utf8");
  const remainder = raw.length % 4;
  if (remainder === 0) return raw;
  return Buffer.concat([raw, Buffer.alloc(4 - remainder)]);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
