import { timingSafeEqual } from "node:crypto";
import { spicyCredit, SpicyApiError } from "@/lib/spicy";

function isValidAccessCode(value: unknown) {
  const expected = process.env.SETTINGS_ACCESS_CODE;
  if (!expected || typeof value !== "string") return false;
  const receivedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
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

    const credit = await spicyCredit();
    const remainingUsd = Number(credit.available);
    if (!Number.isFinite(remainingUsd)) throw new Error("Spicy balance is invalid");
    return Response.json({
      configured: true,
      provider: "spicy",
      remainingUsd,
      currency: "USD",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof SpicyApiError && [401, 403, 503].includes(error.status)) {
      return Response.json({ configured: false, error: "Spicy APIのキー、権限、またはサービス状態を確認してください。" }, { status: 503 });
    }
    return Response.json(
      { configured: true, error: "残高を取得できませんでした。利用中のAIサービスの権限と設定を確認してください。" },
      { status: 502 },
    );
  }
}
