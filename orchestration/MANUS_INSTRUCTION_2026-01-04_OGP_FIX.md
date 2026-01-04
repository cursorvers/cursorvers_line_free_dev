# Manus 指示書 - Medical AI Article Analyzer OGP修正

発行日: 2026-01-04
対象: Medical AI Article Analyzer (Manus Web App)

---

## 問題

Discord チャンネル `1443611556477665390` に投稿される note リンクのサムネイル画像が表示されたりされなかったりする。

## 原因

Discord Webhook で投稿する際、`embeds` に `image` フィールドを明示的に指定していないため、Discord の自動 OGP 取得に依存している。note.com の応答遅延や Discord のキャッシュにより、サムネイルが表示されないケースが発生。

---

## 修正内容

### 1. OGP メタタグ取得関数を追加

```typescript
/**
 * URL から OGP メタタグを取得
 */
async function fetchOgpMetadata(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
}> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedicalAIAnalyzer/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch OGP: ${response.status}`);
      return {};
    }

    const html = await response.text();

    // OGP メタタグを正規表現で抽出
    const getMetaContent = (property: string): string | undefined => {
      const regex = new RegExp(
        `<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']+)["']`,
        'i'
      );
      const altRegex = new RegExp(
        `<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${property}["']`,
        'i'
      );
      const match = html.match(regex) || html.match(altRegex);
      return match?.[1];
    };

    return {
      title: getMetaContent('title'),
      description: getMetaContent('description'),
      image: getMetaContent('image'),
    };
  } catch (error) {
    console.error('OGP fetch error:', error);
    return {};
  }
}
```

### 2. Discord 投稿時に OGP 画像を明示的に指定

```typescript
// 記事 URL から OGP を取得
const ogp = await fetchOgpMetadata(articleUrl);

// Discord Webhook に送信
const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
const res = await fetch(`${webhookUrl}?wait=true`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "Medical AI Analyzer",
    avatar_url: "https://...", // 任意
    embeds: [{
      title: ogp.title || "記事タイトル",
      url: articleUrl,
      description: ogp.description || "記事要約...",
      color: 0x00b894, // 緑系の色
      image: ogp.image ? { url: ogp.image } : undefined,
      footer: {
        text: "Medical AI Article Analyzer",
      },
      timestamp: new Date().toISOString(),
    }],
  }),
});
```

---

## 修正箇所

| ファイル | 修正内容 |
|----------|----------|
| Discord 投稿処理 | `fetchOgpMetadata()` 関数を追加 |
| Discord 投稿処理 | embed に `image.url` を明示的に設定 |

---

## テスト手順

1. note.com の記事 URL を入力
2. Discord に投稿
3. サムネイル画像が表示されることを確認
4. 複数回投稿して、毎回サムネイルが表示されることを確認

---

## 期待される結果

- 全ての note リンク投稿でサムネイル画像が表示される
- OGP 画像が取得できない場合は、画像なしで投稿（エラーにならない）

---

## 補足

### note.com の OGP 画像 URL パターン

```
https://assets.st-note.com/production/uploads/images/XXXXXXX/rectangle_large_type_2_XXXXXXX.png
```

### Discord embed の image フィールド仕様

```typescript
image: {
  url: string;      // 画像 URL（必須）
  height?: number;  // 高さ（オプション）
  width?: number;   // 幅（オプション）
}
```

---

作成者: Claude Code
