import { timingSafeEqual } from "node:crypto";
import { veniceGet, VeniceApiError } from "@/lib/venice";

type ApiKeyInfo = { team_id?: string };
type BalanceResponse = { total?: { val?: string } };

function isValidAccessCode(value: unknown) {
  const expected = process.env.SETTINGS_ACCESS_CODE;
  if (!expected || typeof value !== "string") return false;
  const receivedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(`Upstream request failed: ${response.status}`);
  return body as T;
}

export async function POST(request: Request) {
  try {
    if (!process.env.SETTINGS_ACCESS_CODE) {
      return Response.json({ configured: false, error: "設定画面のアクセス保護がまだ設定されていません。" }, { status: 503 });
    }

    const body = await request.json() as { accessCode?: string };
    if (!isValidAccessCode(body.accessCode)) {
      return Response.json({ configured: true, error: "アクセスコードが正しくありません。" }, { status: 401 });
    }

    if (process.env.BILLING_PROVIDER === "venice") {
      const data = await veniceGet<{ balances?: { usd?: number; diem?: number; bundledCredits?: number; earnedCredits?: number }; consumptionCurrency?: string; canConsume?: boolean }>("/billing/balance", 15_000);
      const balances = data.balances;
      if (!balances || typeof balances.usd !== "number" || !Number.isFinite(balances.usd)) throw new Error("Venice balance is invalid");
      return Response.json({
        configured: true,
        provider: "venice",
        remainingUsd: balances.usd,
        remainingDiem: balances.diem,
        bundledCredits: balances.bundledCredits,
        earnedCredits: balances.earnedCredits,
        consumptionCurrency: data.consumptionCurrency,
        canConsume: data.canConsume,
        currency: "USD",
        updatedAt: new Date().toISOString(),
      });
    }

    const apiKey = process.env.XAI_API_KEY;
    const managementKey = process.env.XAI_MANAGEMENT_API_KEY;
    if (!apiKey || !managementKey) {
      return Response.json({ configured: false, error: "xAI Management APIがまだ設定されていません。" }, { status: 503 });
    }

    const authHeaders = { Authorization: `Bearer ${apiKey}` };
    const apiKeyResponse = await fetch("https://api.x.ai/v1/api-key", {
      headers: authHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const apiKeyInfo = await readJson<ApiKeyInfo>(apiKeyResponse);
    if (!apiKeyInfo.team_id) throw new Error("xAI team ID is missing");

    const balanceResponse = await fetch(
      `https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(apiKeyInfo.team_id)}/prepaid/balance`,
      {
        headers: { Authorization: `Bearer ${managementKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const balance = await readJson<BalanceResponse>(balanceResponse);
    const ledgerCents = Number(balance.total?.val);
    if (!Number.isFinite(ledgerCents)) throw new Error("xAI balance is invalid");

    // xAI's prepaid ledger represents available credit as a negative USD-cent value.
    const remainingUsd = Math.max(0, -ledgerCents / 100);
    return Response.json({
      configured: true,
      provider: "xai",
      remainingUsd,
      currency: "USD",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof VeniceApiError && [401, 403, 503].includes(error.status)) {
      return Response.json({ configured: false, error: "Venice APIのキー、権限、またはサービス状態を確認してください。" }, { status: 503 });
    }
    return Response.json(
      { configured: true, error: "残高を取得できませんでした。利用中のAIサービスの権限と設定を確認してください。" },
      { status: 502 },
    );
  }
}

