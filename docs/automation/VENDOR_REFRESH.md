# ベンダースクリプト更新手順

GitHub Actions で利用する外部スクリプトは `scripts/vendor/` 以下にベンドルされています。  
リポジトリ内でのみ完結させるため、以下のフローで管理します。

1. `manifest.json` に各スクリプトの取得元 URL と配置先パスを記録する。
2. `manifest.lock.json` に SHA-256 ダイジェストとサイズ、同期時刻を固定化する。
3. CI では `npm run vendor:verify` を実行し、ダイジェストずれやロックファイルとの不一致があれば失敗させる。

## 更新手順

```bash
npm run vendor:sync
```

- 各エントリをダウンロードし直し、`manifest.json` と `manifest.lock.json` を更新します。
- 新しいダイジェストやファイルサイズが書き込まれるため、変更をコミットしてください。

## 検証手順

```bash
npm run vendor:verify
```

- エントリごとにロックファイルと実ファイルを比較し、不整合があれば一覧表示します。
- ロックに存在して manifest に無いエントリ、サイズ/ダイジェストの差異も検知されます。

## 運用メモ

- 追加/更新のレビューでは `manifest.lock.json` の差分も必ず確認してください。
- `tmp/` 配下はテスト用の一時ディレクトリとして自動生成されるため、コミット対象に含めません。
- 定期的なリフレッシュは `.sdd/specs/line-actions-hardening/design.md` の運用計画に従い、月次で実施します。
