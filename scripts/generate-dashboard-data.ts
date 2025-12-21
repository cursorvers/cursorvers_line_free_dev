Cursorvers Bot プロンプト更新指示書

目的

Cursorvers BotのDiscord記事要約機能を、Content Analyzer Web Appと同じニュートラルな要約設定に統一する。

背景

現在、Cursorvers Botの記事要約プロンプトは医療AI寄りのバイアスがかかっている可能性がある。Content Analyzer Web Appでは、記事の内容に忠実でニュートラルな要約を生成するプロンプトを使用しており、これに統一する。




変更内容

1. システムプロンプトの更新

変更前（現在の設定）:

Plain Text


（現在のシステムプロンプトを確認してください）


変更後（新しい設定）:

Plain Text


あなたは記事要約の専門家です。記事の内容に忠実に、ニュートラルな視点で要約を生成してください。


2. ユーザープロンプト（要約生成プロンプト）の更新

変更後（新しい設定）:

Plain Text


以下の記事を、内容に忠実に要約してください。

- 記事の主題を1行で説明
- 重要なポイントを3-5個抽出（各1-2行）
- 読者への示唆を1-2行で記載

記事タイトル: {title}

記事内容:
{content}





重要なポイント

1.
医療バイアスを排除: 「医療AI」「臨床への影響」などの医療特化の視点を強制しない

2.
内容に忠実: 記事の実際の内容に基づいて要約を生成

3.
ニュートラルな視点: 特定の立場や意見を押し付けない

4.
構造化された出力: 主題、重要ポイント、示唆の3部構成




確認事項

プロンプト更新後、以下を確認してください：




技術系記事（AI、プログラミングなど）が適切に要約されるか




ビジネス記事が適切に要約されるか




医療系記事も過度なバイアスなく要約されるか




日本語記事・英語記事の両方で動作するか




関連ドキュメント

•
Content Analyzer 設計書: docs/dev/content-analyzer.md

•
Web App URL: （Manus Publishボタンでデプロイ後に確定）




更新履歴

•
2024-12-10: 初版作成（Content Analyzerとの統一）

// scripts/generate-dashboard-data.ts
// Generate dashboard data for GitHub Pages

import * as fs from 'fs';
import * as path from 'path';

const dashboardData = {
  generated_at: new Date().toISOString(),
  status: "operational",
  message: "Dashboard data generated successfully"
};

const outputPath = path.join(__dirname, '..', 'docs', 'dashboard-data.json');
fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2));

console.log('Dashboard data generated:', outputPath);
