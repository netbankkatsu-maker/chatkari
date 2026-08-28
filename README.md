# Chatkari

架空の成人女性AIキャラクター12人からランダムにマッチし、xAI Grokと1対1で会話できるスマートフォン向けPWAです。写真を求める会話ではGrok Imagineが同じキャラクターの外見を参照しながら画像を生成します。

## 主な機能

- 直前の相手を除外したランダムマッチング
- 固定設定を維持する短文チャットと簡易好感度
- 直近30件に制限した会話コンテキスト
- 文脈を考慮した写真要求判定、曖昧な依頼への聞き返し、テキスト返信＋画像生成
- xAI／ModelsLabの画像生成切り替え、リアル／アニメ切り替え、1〜4枚生成
- 直前10件の会話から場面を再構成し、会話内の最新画像を優先参照する画像生成・画像変更
- JPEG・PNG・WebPの画像添付と、画像を見たキャラクター別リアクション
- 性格に応じた画像要求（お願い・命令・要求しない）の出し分け
- 年齢・性格・関係性・成人同士の好みから最大10人の候補を生成
- 固定12人の事前生成済みプロフィール画像と、1K Low設定による高速画像生成
- 画像生成の追加スタイル設定とLINE風チャットUI
- 画像要求を構図・照明・衣装・画質へ整理する安全な内部プロンプト最適化
- 日本語ボイスメッセージの録音・文字起こしと、性格別の声質・速度・抑揚による音声返信
- プロフィール画像の初回生成とブラウザ内再利用
- iPhone Safe Area、Android、PC対応
- manifest、standalone表示、Service Workerを含むPWA
- APIキーをサーバー側だけで使うRoute Handler
- アクセスコードで保護されたxAIプリペイドクレジット残高表示

チャット履歴、好感度、生成済みプロフィール画像はブラウザの `localStorage`、ボイスメッセージ本体は `IndexedDB` に保存します。API処理と表示処理は分離してあるため、将来Supabaseの `users`、`characters`、`matches`、`messages`、`generated_images` へ移行できます。

## ローカル起動

1. [xAI Console](https://console.x.ai/)でアカウントを作成し、APIキーを取得します。
2. このプロジェクトをダウンロードします。
3. `npm install` を実行します。
4. `.env.example` を `.env.local` としてコピーします。
5. `.env.local` の `XAI_API_KEY` に取得したキーを設定します。
6. `npm run dev` を実行し、表示されたURLを開きます。

```env
XAI_API_KEY=xai-your-api-key
MODELSLAB_API_KEY=your-modelslab-api-key
XAI_MANAGEMENT_API_KEY=xai-your-management-api-key
SETTINGS_ACCESS_CODE=choose-a-long-private-code
```

APIキーを `NEXT_PUBLIC_` で始まる変数へ入れないでください。`.env.local` は `.gitignore` の対象です。

残高表示には通常の推論キーとは別に、xAI Consoleの **Settings → Management Keys** で発行したManagement API keyが必要です。Billingの読み取り権限を付与し、`XAI_MANAGEMENT_API_KEY` に設定してください。`SETTINGS_ACCESS_CODE` は公開サイトで残高を保護するための任意の長いアクセスコードです。

## Vercelへデプロイ

1. プロジェクトをGitHubへPushします。
2. Vercelで **Add New → Project** からリポジトリをImportします。
3. Project SettingsのEnvironment Variablesへ `XAI_API_KEY` と `MODELSLAB_API_KEY` を登録します。
4. Deployを実行します。

追加のビルド設定は不要です。`npm run build` がそのまま使えます。

## iPhoneでホーム画面へ追加

デプロイURLをSafariで開き、共有ボタン → **ホーム画面に追加** を選択します。standaloneモードで通常のアプリに近い表示になります。

## モデル設定

モデル名は `lib/xai.ts` と `lib/modelslab.ts` に集約しています。現在の既定値は次のとおりです。

- Chat: `grok-4.20-non-reasoning`
- Image: `grok-imagine-image-2.0`
- ModelsLab realistic: `realistic-vision-51`
- ModelsLab anime: `anything-v3`

モデル提供状況が変わった場合はこの2定数だけを更新してください。画像生成にはxAIの利用料金が発生します。
