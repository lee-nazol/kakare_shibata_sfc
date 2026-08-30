# かかれ柴田！ 鬼柴田戦記 — GitHub開発プロジェクト v2

ローカルの `file://` と GitHub Pages の両方で動くように、**iframe / fetch を使わず通常のHTMLページ遷移だけ**で構成しています。

## まず遊ぶ

### Mac / Windowsでローカル確認

1. ZIPを解凍
2. `play/index.html` をダブルクリック
3. 自動的に `play/title/index.html` が開く
4. タイトル → チュートリアル → コンフィグ → 第一陣 と進む

スマホ幅ではチュートリアル後にコンフィグを飛ばして第一陣へ進みます。

### GitHub Pages

リポジトリ直下にこのプロジェクトの中身をアップロードします。
ルートの `index.html` → `play/index.html` → `play/title/index.html` の順に通常遷移します。

## 開発・単体チェック

`play/dev.html` を開くと各画面・各陣へ直接移動できます。

```text
/
├─ index.html                 # GitHub Pages入口
├─ README.md
└─ play/
   ├─ index.html              # 通しプレイ入口（titleへ通常遷移）
   ├─ dev.html                # 開発・チェックメニュー
   ├─ shared/
   │  ├─ nav.js               # 共通ページ遷移
   │  └─ game-config.js       # キー設定保存
   ├─ title/
   │  ├─ index.html
   │  └─ assets/
   ├─ tutorial/
   │  ├─ index.html
   │  └─ assets/
   ├─ config/
   │  └─ index.html
   └─ stages/
      ├─ stage1/              # 第一陣・完成版
      │  ├─ index.html
      │  ├─ style.css
      │  ├─ script.js
      │  └─ images/
      ├─ stage2/              # 第二陣・開発スロット
      ├─ stage3/              # 第三陣・開発スロット
      └─ final/               # 最終陣・開発スロット
```

## 通しプレイの遷移

PC:

`play/index.html` → タイトル → チュートリアル → コンフィグ → 第一陣 → 第二陣 → 第三陣 → 最終陣

スマホ:

`play/index.html` → タイトル → チュートリアル → 第一陣 → …

## 開発方針

各画面や各陣は独立したフォルダで開発します。たとえば第二陣だけ直したい場合は `play/stages/stage2/index.html` を直接開きます。完成後も同じフォルダのまま通しプレイにつながります。
