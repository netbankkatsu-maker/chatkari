# Chatkari

架空の成人AIキャラクターとランダムにマッチし、Venice AIで会話・画像生成ができるスマートフォン向けPWAです。画像生成はVenice AIに統一しています。ボイス機能は別途xAIの設定が必要です。

## 主な機能

- 直前の相手を除外したランダムマッチング
- 固定設定を維持する短文チャットと簡易好感度
- 直近30件に制限した会話コンテキスト
- 文脈を考慮した写真要求判定、曖昧な依頼への聞き返し、テキスト返信＋画像生成
- Venice AIによる画像生成、リアル／アニメ切り替え、1〜4枚生成
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
- アクセスコードで保護されたVeniceのUSD・DIEM・付属／獲得クレジット残高表示

チャット履歴、好感度、生成済みプロフィール画像はブラウザの `localStorage`、ボイスメッセージ本体は `IndexedDB` に保存します。API処理と表示処理は分離してあるため、将来Supabaseの `users`、`characters`、`matches`、`messages`、`generated_images` へ移行できます。

## ローカル起動

1. [Venice AI](https://venice.ai/settings/api)でAPIキーを取得します。
2. `npm install` を実行します。
3. `.env.example` を `.env.local` としてコピーします。
4. `VENICE_API_KEY` にキー、`SETTINGS_ACCESS_CODE` に残高確認用の長いアクセスコードを設定します。
5. `npm run dev` を実行し、表示されたURLを開きます。

画像の既定モデルは `krea-v2-medium` です。変更する場合は `VENICE_IMAGE_MODEL` を設定してください。モデルごとに参照画像の対応状況が異なり、参照を使わず生成した場合はAPIの `referenceUsed` が `false` になります。

キーを `NEXT_PUBLIC_` 変数に入れないでください。`.env.local` はGitの対象外です。キーを変更したら開発サーバーを再起動してください。ボイス機能のみ `XAI_API_KEY` が必要です。

## Vercelへデプロイ

1. プロジェクトをGitHubへPushします。
2. Vercelで **Add New → Project** からリポジトリをImportします。
3. Project SettingsのEnvironment Variablesへ `.env.example` のVenice用変数とアクセスコードを登録します。APIキーはSecretとして保存します。
4. Deployを実行します。

追加のビルド設定は不要です。`npm run build` がそのまま使えます。

## iPhoneでホーム画面へ追加

デプロイURLをSafariで開き、共有ボタン → **ホーム画面に追加** を選択します。standaloneモードで通常のアプリに近い表示になります。

## モデル設定

- チャット: `VENICE_CHAT_MODEL`（既定: `z-ai-glm-5-3-flash`）
- 画像: `VENICE_IMAGE_MODEL`（既定: `krea-v2-medium`）
- 残高確認: `BILLING_PROVIDER=venice`

画像生成にはVeniceのクレジットを使います。USDとDIEMは別々に表示し、合算しません。

会話では最新の訂正を優先し、一対一の連続した吹き出しを一つの発言として履歴に渡します。明らかな外国語混入・反復・内部タグが出た時だけ、同じ会話から一度再生成します。GLM 5.3 Flashは推論専用なので推論を有効にしたまま、思考過程は本文に表示しません。

返答は表示前に会話との整合性も確認します。ユーザーの予定をキャラクターとの約束に取り違えたり、最後の質問に答えていない場合は、キャラクターの口調を保って修正します。固定プロフィール、設定した呼び名、記憶も確認に渡します。

通常の会話写真は写実に統一し、人物のプロフィール写真がある場合はVeniceの画像編集API（`VENICE_IMAGE_EDIT_MODEL`、既定`qwen-image-2-edit`）、ない場合は画像生成API（`VENICE_IMAGE_MODEL`）を使います。会話文は視覚的な場面へ整理し、字幕として渡しません。黒い画像やサービス側でぼかされた画像は成功扱いせず、課金される再試行は自動実行しません。
