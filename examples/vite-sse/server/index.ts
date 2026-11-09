import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { POST } from "./chat.ts";

const app = new Hono();
app.post("/api/chat", (c) => POST(c.req.raw));

serve({ fetch: app.fetch, port: 8787, hostname: "127.0.0.1" });
