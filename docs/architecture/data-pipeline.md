# X → LINE データパイプライン アーキテクチャ

## 概要

X（Twitter）投稿 → Discord → Obsidian → Supabase → LINE という一連のデータフローを自動化したシステム。

## システム全体図

```mermaid
flowchart TB
    subgraph External["外部サービス"]
        X["X (Twitter)"]
        TweetShift["TweetShift Bot"]
        Discord["Discord"]
        Gemini["Gemini API"]
        LINE["LINE Messaging API"]
    end

    subgraph GitHub["GitHub Actions"]
        DiscordSync["discord-sync.yml<br/>毎日 00:00 JST"]
        LineCardsSync["sync-line-cards.yml<br/>毎日 06:00 JST"]
        ManusAudit["manus-audit-daily.yml<br/>毎日 06:00 JST"]
        E2EMonitor["e2e-pipeline-monitor.yml<br/>毎日 08:00 JST"]
    end

    subgraph Obsidian["Obsidian Vault"]
        XClip["04_Journals/X-clip/*.md"]
        CVLine["#cv_line タグ付き行"]
    end

    subgraph Supabase["Supabase"]
        LineCards["line_cards テーブル"]
        LineUsers["line_users テーブル"]
        LineBroadcasts["line_card_broadcasts テーブル"]
        DailyBrief["line-daily-brief<br/>Edge Function"]
        AuditFunc["manus-audit-line-daily-brief<br/>Edge Function"]
    end

    %% データフロー
    X -->|投稿| TweetShift
    TweetShift -->|転送| Discord
    Discord -->|取得| DiscordSync
    DiscordSync -->|分類| Gemini
    DiscordSync -->|保存| XClip
    XClip -->|タグ付け| CVLine

    CVLine -->|抽出| LineCardsSync
    LineCardsSync -->|同期| LineCards

    LineCards -->|配信| DailyBrief
    LineUsers -->|対象| DailyBrief
    DailyBrief -->|記録| LineBroadcasts
    DailyBrief -->|送信| LINE

    %% 監視フロー
    ManusAudit -->|チェック| LineCards
    ManusAudit -->|チェック| LineBroadcasts
    E2EMonitor -->|監視| DiscordSync
    E2EMonitor -->|監視| LineCardsSync
    E2EMonitor -->|監視| DailyBrief

    %% スタイル
    classDef external fill:#f9f,stroke:#333
    classDef github fill:#2ea44f,stroke:#333,color:#fff
    classDef obsidian fill:#7c3aed,stroke:#333,color:#fff
    classDef supabase fill:#3ecf8e,stroke:#333,color:#fff

    class X,TweetShift,Discord,Gemini,LINE external
    class DiscordSync,LineCardsSync,ManusAudit,E2EMonitor github
    class XClip,CVLine obsidian
    class LineCards,LineUsers,LineBroadcasts,DailyBrief,AuditFunc supabase
```

## コンポーネント詳細

### 1. Discord → Obsidian 同期

```mermaid
sequenceDiagram
    participant D as Discord
    participant GH as GitHub Actions
    participant G as Gemini API
    participant O as Obsidian Vault

    Note over GH: 毎日 00:00 JST
    GH->>D: メッセージ取得 (50件)
    D-->>GH: TweetShift投稿

    loop 各メッセージ
        GH->>GH: ツイートURL抽出
        GH->>G: 分類リクエスト
        G-->>GH: category, line_worthy
        GH->>O: Markdownファイル作成
    end

    GH->>O: git push
```

#### 関連ファイル
- `.github/workflows/discord-sync.yml`
- `.scripts/classify_tweet.py`
- `.scripts/extract_tweet.py`

### 2. Obsidian → Supabase 同期

```mermaid
sequenceDiagram
    participant O as Obsidian Vault
    participant GH as GitHub Actions
    participant S as Supabase

    Note over GH: 毎日 06:00 JST
    GH->>O: Vault取得
    GH->>GH: #cv_line タグ抽出
    GH->>GH: ハッシュ計算
    GH->>S: 既存ハッシュ取得
    S-->>GH: 重複チェック

    loop 新規カードのみ
        GH->>S: バッチ挿入 (50件ずつ)
    end
```

#### 関連ファイル
- `.github/workflows/sync-line-cards.yml`
- `scripts/export-line-cards/src/main.ts`
- `scripts/export-line-cards/src/extractor.ts`
- `scripts/export-line-cards/src/supabase-client.ts`

### 3. Supabase → LINE 配信

```mermaid
sequenceDiagram
    participant S as Supabase
    participant F as Edge Function
    participant L as LINE API

    Note over F: 毎日 07:00 JST (n8n trigger)
    F->>S: readyカード取得
    S-->>F: カードリスト
    F->>S: アクティブユーザー取得
    S-->>F: ユーザーリスト

    loop 各ユーザー
        F->>F: カード選択 (ユーザーテーマ優先)
        F->>L: Flex Message送信
        L-->>F: 送信結果
        F->>S: 配信記録
    end
```

#### 関連ファイル
- `supabase/functions/line-daily-brief/index.ts`

### 4. 監視システム

```mermaid
flowchart LR
    subgraph DailyAudit["日次監査 (06:00 JST)"]
        A1[カード在庫チェック]
        A2[配信成功率チェック]
        A3[DBヘルスチェック]
        A4[LINE登録チェック]
    end

    subgraph E2EMonitor["E2E監視 (08:00 JST)"]
        E1[Discord Sync確認]
        E2[Line Cards Sync確認]
        E3[LINE Function確認]
        E4[在庫レベル確認]
    end

    DailyAudit -->|異常検知| Discord
    E2EMonitor -->|異常検知| Discord
```

## スケジュール

| 時刻 (JST) | ワークフロー | 内容 |
|------------|--------------|------|
| 00:00 | discord-sync | X投稿をObsidianに同期 |
| 06:00 | sync-line-cards | ObsidianカードをSupabaseに同期 |
| 06:00 | manus-audit-daily | 日次監査実行 |
| 07:00 | n8n → line-daily-brief | LINE配信実行 |
| 08:00 | e2e-pipeline-monitor | E2Eパイプライン監視 |

## エラー通知フロー

```mermaid
flowchart TD
    Error[エラー発生]

    Error --> Discord[Discord Webhook通知]
    Error --> Manus{自動修復可能?}

    Manus -->|Yes| AutoFix[Manus自動修復タスク]
    Manus -->|No| Manual[手動対応]

    AutoFix --> Verify[修復確認]
    Verify -->|成功| Done[完了]
    Verify -->|失敗| Manual
```

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2024-12-20 | 初版作成 |
