# Cafe Pomodoro

雨の喫茶店で、ひとつずつ。集中した時間に応じて、新しい喫茶店の場面が手に入るWebタイマーです。

**[アプリを開く](https://mildmarshal-gif.github.io/cafe-pomodoro/)** · [感想・不具合](https://github.com/MildMarshal-gif/cafe-pomodoro/issues) · [変更履歴](CHANGELOG.md)

![雨の喫茶店の静止画プレビュー](dist/assets/female-rain.png)

## この試作版でできること

- 集中・休憩・長休憩のタイマー。初期値は25分・5分・15分。
- 一時停止・再開・途中終了。途中まで集中した時間も記録する。
- 3回の集中で長休憩。時間・回数・自動切替は設定で変更できる。
- 男女1場面ずつから開始し、累計3時間・6時間で新しい場面を解放する。
- 今日・累計の集中時間、7日間グラフ、12週間のヒートマップ、連続利用バッジ。
- 合成の雨音・BGM、終了音、対応ブラウザのデスクトップ通知。
- PCとスマホ縦画面に合わせたレイアウトと、画像の全画面表示。

画像はAIで生成した仮素材です。現在は4枚の静止画を使い、集中中と休憩中で同じ画像を表示しています。動画・ログイン・端末間同期は今後の実装対象です。

## 使い方

1. アプリを開き、必要なら「場面帖」で好きな席を選びます。
2. 「集中をはじめる」を押します。音は「雨音」「BGM」から個別に有効にできます。
3. 「記録」で積み重ねた時間を確認します。
4. 時間の変更や通知の許可は「設定」から行えます。

記録は利用中のブラウザに保存されます。PCとスマホ、異なるブラウザ間では共有されません。ブラウザのデータを消すと記録も消えます。設定からJSONバックアップを保存できます（読み込み機能は未実装）。

ブラウザを閉じている間や端末のスリープ中には、通知を保証できません。長時間離れたあとに戻った場合は、進行中だった区間までを記録し、次の区間を開始待ちにします。

## ローカルで動かす

Node.js 22以降を用意してください。依存パッケージのインストールは不要です。

```sh
git clone https://github.com/MildMarshal-gif/cafe-pomodoro.git
cd cafe-pomodoro
npm run dev
```

PCで http://127.0.0.1:4173 を開きます。ローカル起動のURLはそのPC専用です。スマホから試す場合は上の公開URLを使ってください。

## ソースの読み方

| ファイル | 役割 |
| --- | --- |
| [dist/index.html](dist/index.html) | 喫茶室・場面帖・記録・設定の画面構造 |
| [dist/styles.css](dist/styles.css) | 色・レイアウト・スマホ対応 |
| [dist/app.mjs](dist/app.mjs) | 画面操作、ブラウザ内保存、通知 |
| [dist/engine.mjs](dist/engine.mjs) | 時間計算、日別集計、場面の解放条件 |
| [dist/sound.mjs](dist/sound.mjs) | ブラウザ内で作る仮の雨音とBGM |
| [tests/engine.test.mjs](tests/engine.test.mjs) | 時間・記録・復元・解放のテスト |

詳細は[設計メモ](docs/ARCHITECTURE.md)、画像制作は[生成プロンプト](docs/image-prompts.json)を参照してください。

## 検証と公開

```sh
npm test
npm run check
```

`main`への更新時にGitHub Actionsでテスト・ファイル検査を実行し、成功した`dist/`だけをGitHub Pagesへ公開します。Pull Requestでは検査のみを行います。

開発・画像生成にはCodexを使用しています。現時点の確認範囲と未検証項目は[設計メモ](docs/ARCHITECTURE.md#検証範囲)に記載しています。
