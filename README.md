# sazare 清掃管理システム

Googleカレンダー連携の清掃・業務管理アプリです。

---

## Vercelへのデプロイ手順（約15分）

### 1. GitHubにアップロード

1. [github.com](https://github.com) を開いてログイン（アカウントがなければ無料作成）
2. 右上の「+」→「New repository」
3. Repository name: `sazare-cleaning`
4. 「Create repository」をクリック
5. 「uploading an existing file」をクリック
6. このフォルダの中身を全部ドラッグ＆ドロップ
7. 「Commit changes」をクリック

### 2. Vercelにデプロイ

1. [vercel.com](https://vercel.com) を開いてGitHubアカウントでログイン
2. 「New Project」→ 先ほどの `sazare-cleaning` リポジトリを選択
3. 「Deploy」をクリック
4. 数分後に `https://sazare-cleaning.vercel.app` のようなURLが発行される

### 3. Google CloudにリダイレクトURIを追加

デプロイ後、発行されたVercelのURLをGoogle Cloudに登録します。

1. [console.cloud.google.com](https://console.cloud.google.com) を開く
2. 「APIとサービス」→「認証情報」
3. 作成したOAuthクライアントIDを編集
4. 「承認済みのリダイレクト URI」に発行されたVercel URLを追加
   例: `https://sazare-cleaning.vercel.app`
5. 「保存」

---

## 使い方

### 管理者（坂口さん）
1. アプリを開いて「Googleでログイン」
2. Googleカレンダーに **「[予約] ゲスト名」** の形式で予約を入力
   例: `[予約] 佐藤様`
3. 「カレンダー更新」ボタンで予約を読み込み
4. 担当割り当てタブでスタッフを割り当て

### スタッフ
1. アプリのURLをスマホで開く（ログイン不要）
2. 「空き登録」タブで出勤可能日を登録
3. 「完了報告」タブで業務完了を報告

---

## ローカルで試す場合

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く

---

## カレンダーのイベント書き方ルール

| 項目 | 入力方法 | 例 |
|------|---------|-----|
| タイトル | [予約] ゲスト名 | [予約] 佐藤様 |
| 開始日 | チェックイン日 | 3月8日 |
| 終了日 | チェックアウト日 | 3月10日 |

※ タイトルに「[予約]」が含まれていないイベントは読み込まれません。
