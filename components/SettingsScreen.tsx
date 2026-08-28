"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppTabBar } from "@/components/AppTabBar";
import { DEFAULT_IMAGE_SETTINGS, loadImageSettings, type ImageProvider, type ImageSafetyLevel, type ImageStyle } from "@/lib/image-settings";

type BillingResult = {
  configured?: boolean;
  remainingUsd?: number;
  currency?: string;
  updatedAt?: string;
  error?: string;
};

export function SettingsScreen() {
  const [accessCode, setAccessCode] = useState("");
  const [result, setResult] = useState<BillingResult>();
  const [loading, setLoading] = useState(false);
  const [imageGuidance, setImageGuidance] = useState("");
  const [imageSaved, setImageSaved] = useState(false);
  const [imageProvider, setImageProvider] = useState<ImageProvider>(DEFAULT_IMAGE_SETTINGS.provider);
  const [imageStyle, setImageStyle] = useState<ImageStyle>(DEFAULT_IMAGE_SETTINGS.style);
  const [imageSamples, setImageSamples] = useState(DEFAULT_IMAGE_SETTINGS.samples);
  const [imageSafetyLevel, setImageSafetyLevel] = useState<ImageSafetyLevel>(DEFAULT_IMAGE_SETTINGS.safetyLevel);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setImageGuidance(localStorage.getItem("chatkari:image-guidance") || "");
      const settings = loadImageSettings();
      setImageProvider(settings.provider);
      setImageStyle(settings.style);
      setImageSamples(settings.samples);
      setImageSafetyLevel(settings.safetyLevel);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function saveImageGuidance(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem("chatkari:image-guidance", imageGuidance.trim().slice(0, 500));
    localStorage.setItem("chatkari:image-provider", imageProvider);
    localStorage.setItem("chatkari:image-style", imageStyle);
    localStorage.setItem("chatkari:image-samples", String(imageSamples));
    localStorage.setItem("chatkari:image-safety-level", imageSafetyLevel);
    setImageSaved(true);
    window.setTimeout(() => setImageSaved(false), 1800);
  }

  async function loadBalance(event?: FormEvent) {
    event?.preventDefault();
    if (!accessCode || loading) return;
    setLoading(true);
    setResult(undefined);
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const data = await response.json() as BillingResult;
      setResult(data);
    } catch {
      setResult({ error: "残高の取得に失敗しました。通信状態を確認してください。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell settings-page">
      <header className="compact-header">
        <Link className="text-button settings-back" href="/">‹ 戻る</Link>
        <span>設定</span>
        <span />
      </header>

      <section className="settings-content">
        <div className="settings-section">
          <div className="settings-heading">
            <span className="settings-icon settings-icon--image" aria-hidden="true">▣</span>
            <div><p className="eyebrow">IMAGE STYLE</p><h1>画像生成スタイル</h1></div>
          </div>
          <p className="settings-description">相手から届く画像の生成サービス、画風、枚数、雰囲気を設定できます。変更は次の画像生成から反映されます。</p>
          <p className="image-optimizer-note"><strong>安全レベル：{imageSafetyLevel === "standard" ? "標準" : "厳しめ"}</strong> 要求を被写体・衣装・構図・照明・画質へ内部整理し、安全な表現へ変換します。</p>
          <form className="image-guidance-form" onSubmit={saveImageGuidance}>
            <fieldset className="image-setting-group">
              <legend>画像生成サービス</legend>
              <div className="image-option-grid">
                <label className={imageProvider === "xai" ? "is-selected" : ""}><input type="radio" name="image-provider" value="xai" checked={imageProvider === "xai"} onChange={() => setImageProvider("xai")} /><strong>xAI</strong><small>現在のGrok Imagine</small></label>
                <label className={imageProvider === "modelslab" ? "is-selected" : ""}><input type="radio" name="image-provider" value="modelslab" checked={imageProvider === "modelslab"} onChange={() => setImageProvider("modelslab")} /><strong>ModelsLab</strong><small>会話連動の画像生成</small></label>
              </div>
            </fieldset>
            <fieldset className="image-setting-group">
              <legend>安全レベル</legend>
              <div className="image-option-grid">
                <label className={imageSafetyLevel === "standard" ? "is-selected" : ""}><input type="radio" name="image-safety-level" value="standard" checked={imageSafetyLevel === "standard"} onChange={() => setImageSafetyLevel("standard")} /><strong>標準</strong><small>成人の官能的・非露骨な表現に対応</small></label>
                <label className={imageSafetyLevel === "strict" ? "is-selected" : ""}><input type="radio" name="image-safety-level" value="strict" checked={imageSafetyLevel === "strict"} onChange={() => setImageSafetyLevel("strict")} /><strong>厳しめ</strong><small>日常的で露出を抑えた表現</small></label>
              </div>
            </fieldset>
            <div className="image-settings-row">
              <label>画風<select value={imageStyle} onChange={(event) => setImageStyle(event.target.value as ImageStyle)}><option value="realistic">リアル寄り</option><option value="anime">アニメ寄り</option></select></label>
              <label>生成枚数<select value={imageSamples} onChange={(event) => setImageSamples(Number(event.target.value))}><option value={1}>1枚（推奨）</option><option value={2}>2枚</option><option value={3}>3枚</option><option value={4}>4枚</option></select></label>
            </div>
          <div className="image-preset-row">
            <button type="button" onClick={() => setImageGuidance("mature, sensual, elegant mood, intimate evening lighting, tasteful adult fashion")}>大人っぽい</button>
            <button type="button" onClick={() => setImageGuidance("romantic boudoir-inspired fashion, elegant lingerie-style outfit with tasteful coverage, soft warm lighting")}>ランジェリー風</button>
            <button type="button" onClick={() => setImageGuidance("stylish date-night outfit, flattering pose, beautiful smartphone photo, warm city lights")}>デート服</button>
          </div>
            <label htmlFor="image-guidance">追加プロンプト</label>
            <textarea id="image-guidance" value={imageGuidance} onChange={(event) => setImageGuidance(event.target.value)} maxLength={500} placeholder="例：夜の部屋、落ち着いた照明、大人っぽい服装…" />
            <button type="submit">{imageSaved ? "保存しました" : "画像設定を保存"}</button>
          </form>
          <p className="settings-policy-note">成人のロマンチック・官能的な表現に対応します。安全規制の回避、露骨な性行為、露出した性器、未成年・年齢不明・非同意、実在人物の性的画像は対象外です。</p>
        </div>

        <div className="settings-section">
        <div className="settings-heading">
          <span className="settings-icon" aria-hidden="true">$</span>
          <div><p className="eyebrow">XAI API BILLING</p><h2>APIクレジット</h2></div>
        </div>
        <p className="settings-description">xAIのプリペイドクレジット残高を確認できます。残高情報はアクセスコードで保護されています。</p>

        <form className="settings-form" onSubmit={loadBalance}>
          <label htmlFor="settings-code">設定アクセスコード</label>
          <div className="settings-code-row">
            <input
              id="settings-code"
              type="password"
              autoComplete="current-password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="アクセスコードを入力"
              maxLength={128}
            />
            <button type="submit" disabled={!accessCode || loading}>{loading ? "確認中…" : "確認"}</button>
          </div>
        </form>

        {typeof result?.remainingUsd === "number" && (
          <div className="balance-card" aria-live="polite">
            <span>残りクレジット</span>
            <strong>${result.remainingUsd.toFixed(2)}</strong>
            <small>USD・{result.updatedAt ? new Date(result.updatedAt).toLocaleString("ja-JP") : "現在"} 時点</small>
            <button onClick={() => loadBalance()} disabled={loading}>残高を更新</button>
          </div>
        )}

        {result?.error && <div className="settings-error" role="alert"><strong>残高を表示できません</strong><p>{result.error}</p></div>}

        <div className="settings-note">
          <h2>クレジットについて</h2>
          <p>チャットとボイスはxAI、画像は設定で選んだサービスのクレジットから差し引かれます。生成枚数を増やすと画像料金も枚数に応じて増えます。</p>
          <a href="https://console.x.ai/" target="_blank" rel="noreferrer">xAI Consoleで詳細を見る ↗</a>
        </div>
        </div>
      </section>
      <AppTabBar />
    </main>
  );
}
