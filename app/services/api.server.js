import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authenticate } from "../shopify.server";

// Manually load .env variables into process.env to ensure custom variables (like WORKER_INTERNAL_SECRET) are populated
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value.trim();
      }
    });
  } else {
    console.warn(`[api.server.js] .env file not found at resolved path: ${envPath}`);
  }
} catch (err) {
  console.error("Failed to load .env manually:", err);
}

const WORKER_URL =
  process.env.WORKER_URL ||
  "https://artiz-cod-form.digitaneo.workers.dev";

/**
 * Low-level Worker call. Accepts session directly — no authenticate.admin call.
 * Use this when the caller has already authenticated and has the session object.
 */
export async function workerFetch(session, path, options = {}) {
  if (!session || !session.shop) {
    throw new Error("No session found for worker request.");
  }

  const secret = process.env.WORKER_INTERNAL_SECRET || "";
  console.log(`[WorkerFetch] Path: ${path}, Shop: ${session.shop}, Secret length: ${secret.length}, First 3 chars of secret: ${secret.slice(0, 3)}`);

  const response = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Artiz-Internal-Secret": secret,
      "X-Shopify-Shop-Domain": session.shop,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WorkerFetch Error] Path: ${path}, Status: ${response.status}, Response: ${errorText}`);
    throw new Error(
      `Worker Request Failed [${response.status}]: ${errorText}`
    );
  }

  return response.json();
}

/**
 * High-level Worker call for route loaders.
 * Calls authenticate.admin internally, then forwards to workerFetch.
 */
export async function fetchWorker(request, path, options = {}) {
  const { session } = await authenticate.admin(request);
  return workerFetch(session, path, options);
}

/**
 * Registers shop credentials in Worker KV.
 * Called from app.jsx after authenticate.admin has already run.
 * Does NOT call authenticate.admin again.
 */
export async function registerShopWithWorker(session) {
  if (!session || !session.accessToken) return;
  try {
    await workerFetch(session, "/settings/register", {
      method: "POST",
      body: JSON.stringify({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken || undefined,
        clientId: process.env.SHOPIFY_API_KEY || undefined,
        clientSecret: process.env.SHOPIFY_API_SECRET || undefined,
      }),
    });
  } catch (err) {
    console.error("Failed to register shop with worker:", err);
  }
}