#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Cursorvers Document Generator
 *
 * 提案書・監査報告書・請求書を自動生成するCLIツール
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/doc-generator/generate.ts <command> [options]
 *
 * Commands:
 *   proposal   - 提案書生成（48h / advisor）
 *   audit      - 監査報告書生成
 *   invoice    - 請求書生成
 *
 * Examples:
 *   deno run --allow-read --allow-write scripts/doc-generator/generate.ts proposal --client="○○クリニック" --type=48h
 *   deno run --allow-read --allow-write scripts/doc-generator/generate.ts audit --client="○○病院"
 *   deno run --allow-read --allow-write scripts/doc-generator/generate.ts invoice --client="○○クリニック" --amount=50000
 */

import { parse } from "https://deno.land/std@0.210.0/flags/mod.ts";
import { join, dirname, fromFileUrl, resolve, relative } from "https://deno.land/std@0.210.0/path/mod.ts";

const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const TEMPLATES_DIR = join(SCRIPT_DIR, "templates");
const OUTPUT_DIR = join(SCRIPT_DIR, "output");

// ============================================================
// Constants
// ============================================================

const VALID_PROPOSAL_TYPES = ["48h", "advisor"] as const;
type ProposalType = typeof VALID_PROPOSAL_TYPES[number];

const VALID_TEMPLATES = ["proposal-48h", "proposal-advisor", "audit-report", "invoice"] as const;
type ValidTemplate = typeof VALID_TEMPLATES[number];

const DEFAULT_PRICES: Record<ProposalType, number> = {
  "48h": 50000,
  "advisor": 80000,
};

const TAX_RATE = 0.1;

// ============================================================
// Type Definitions
// ============================================================

interface ProposalArgs {
  client?: string;
  type?: string;
  price?: number;
  plan?: string;
  period?: string;
  meeting?: string;
  training?: string;
}

interface AuditArgs {
  client?: string;
  scope?: string;
  period?: string;
  governance?: number;
  security?: number;
  operation?: number;
  compliance?: number;
  total?: number;
  critical?: string;
  high?: string;
  medium?: string;
  low?: string;
  immediate?: string;
  short?: string;
  long?: string;
  followup?: string;
  next?: string;
  checklist?: string;
  interview?: string;
}

interface InvoiceArgs {
  client?: string;
  amount?: number;
  item?: string;
  quantity?: number;
  bank?: string;
  branch?: string;
  account_type?: string;
  account_number?: string;
  notes?: string;
}

// ============================================================
// Security Functions
// ============================================================

/**
 * ファイル名に使用できない文字を除去し、安全なファイル名に変換
 * パストラバーサル攻撃を防止
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\./g, "")           // ..を除去（パストラバーサル防止）
    .replace(/[\/\\]/g, "")         // スラッシュを除去
    .replace(/[<>:"|?*]/g, "")      // ファイル名に使えない文字を除去
    .replace(/\s+/g, "_")           // 空白をアンダースコアに
    .slice(0, 100);                 // 長さ制限
}

/**
 * パスがベースディレクトリ内に収まることを検証
 */
function ensurePathWithinBase(basePath: string, targetPath: string): void {
  const resolvedBase = resolve(basePath);
  const resolvedTarget = resolve(targetPath);
  const relativePath = relative(resolvedBase, resolvedTarget);

  if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
    throw new Error(`セキュリティエラー: パスがベースディレクトリ外を指しています`);
  }
}

/**
 * テンプレート名がホワイトリストに含まれるか検証
 */
function isValidTemplate(name: string): name is ValidTemplate {
  return VALID_TEMPLATES.includes(name as ValidTemplate);
}

/**
 * 提案書タイプがホワイトリストに含まれるか検証
 */
function isValidProposalType(type: string): type is ProposalType {
  return VALID_PROPOSAL_TYPES.includes(type as ProposalType);
}

// ============================================================
// Utility Functions
// ============================================================

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatYen(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const time = String(now.getHours()).padStart(2, "0") +
               String(now.getMinutes()).padStart(2, "0") +
               String(now.getSeconds()).padStart(2, "0");
  return `INV-${year}${month}${day}-${time}`;
}

async function loadTemplate(name: string): Promise<string> {
  // ホワイトリストで検証
  if (!isValidTemplate(name)) {
    throw new Error(`無効なテンプレート名: ${name}。有効なテンプレート: ${VALID_TEMPLATES.join(", ")}`);
  }

  const path = join(TEMPLATES_DIR, `${name}.md`);
  ensurePathWithinBase(TEMPLATES_DIR, path);

  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`テンプレートファイルが見つかりません: ${name}.md`);
    }
    throw error;
  }
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  // 正規表現で一括置換（パフォーマンス改善）
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
}

async function saveOutput(filename: string, content: string): Promise<string> {
  // ファイル名をサニタイズ
  const safeFilename = sanitizeFilename(filename);
  if (!safeFilename) {
    throw new Error("無効なファイル名です");
  }

  await Deno.mkdir(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, safeFilename);

  // パスがOUTPUT_DIR内であることを確認
  ensurePathWithinBase(OUTPUT_DIR, path);

  await Deno.writeTextFile(path, content);
  return path;
}

function getGrade(score: number): string {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

// ============================================================
// Command: proposal
// ============================================================

async function generateProposal(args: ProposalArgs): Promise<void> {
  // 必須チェック
  if (!args.client) {
    throw new Error("--client オプションは必須です");
  }

  const client = sanitizeFilename(args.client);
  const type = args.type || "48h";

  // タイプのホワイトリスト検証
  if (!isValidProposalType(type)) {
    throw new Error(`無効なタイプ: ${type}。有効なタイプ: ${VALID_PROPOSAL_TYPES.join(", ")}`);
  }

  const price = args.price ?? DEFAULT_PRICES[type];

  // 価格の範囲チェック
  if (price < 0 || price > 100000000) {
    throw new Error(`無効な価格: ${price}。0〜100,000,000の範囲で指定してください`);
  }

  const today = new Date();
  const day1 = new Date(today);
  day1.setDate(day1.getDate() + 7);
  const day2 = new Date(day1);
  day2.setDate(day2.getDate() + 1);

  const templateName: ValidTemplate = type === "48h" ? "proposal-48h" : "proposal-advisor";
  const template = await loadTemplate(templateName);

  const variables: Record<string, string> = {
    date: formatDate(today),
    client,
    price: formatYen(price),
    schedule_day1: formatDate(day1),
    schedule_day2: formatDate(day2),
    // Advisor-specific
    plan: args.plan || "クリニック",
    monthly_price: formatYen(price),
    contract_period: args.period || "1年（自動更新）",
    meeting_frequency: args.meeting || "月1回",
    training_count: args.training || "2",
  };

  const content = replaceVariables(template, variables);
  const filename = `proposal_${type}_${client}_${formatDate(today)}.md`;
  const path = await saveOutput(filename, content);

  console.log(`✅ 提案書を生成しました: ${path}`);
}

// ============================================================
// Command: audit
// ============================================================

async function generateAuditReport(args: AuditArgs): Promise<void> {
  // 必須チェック
  if (!args.client) {
    throw new Error("--client オプションは必須です");
  }

  const client = sanitizeFilename(args.client);
  const today = new Date();

  // スコアの事前計算
  const governanceScore = args.governance ?? 85;
  const securityScore = args.security ?? 80;
  const operationScore = args.operation ?? 75;
  const complianceScore = args.compliance ?? 90;
  const totalScore = args.total ?? 83;

  const template = await loadTemplate("audit-report");

  const variables: Record<string, string> = {
    audit_date: formatDate(today),
    client,
    audit_scope: args.scope || "医療AI利用全般",
    audit_period: args.period || `${formatDate(today)} 〜 ${formatDate(today)}`,
    // Scores
    score_governance: String(governanceScore),
    score_security: String(securityScore),
    score_operation: String(operationScore),
    score_compliance: String(complianceScore),
    score_total: String(totalScore),
    grade_governance: getGrade(governanceScore),
    grade_security: getGrade(securityScore),
    grade_operation: getGrade(operationScore),
    grade_compliance: getGrade(complianceScore),
    grade_total: getGrade(totalScore),
    // Findings
    critical_findings: args.critical || "なし",
    high_findings: args.high || "なし",
    medium_findings: args.medium || "- AI利用ログの保存期間が未定義",
    low_findings: args.low || "- 研修記録の一部が未整備",
    // Actions
    immediate_actions: args.immediate || "- AI利用ログの保存ポリシー策定",
    short_term_actions: args.short || "- 研修記録の整備\n- 運用マニュアルの更新",
    long_term_actions: args.long || "- 定期監査体制の構築",
    // Next
    followup_date: args.followup || "3ヶ月後",
    next_audit_date: args.next || "1年後",
    checklist_summary: args.checklist || "別紙参照",
    interview_summary: args.interview || "別紙参照",
  };

  const content = replaceVariables(template, variables);
  const filename = `audit_report_${client}_${formatDate(today)}.md`;
  const path = await saveOutput(filename, content);

  console.log(`✅ 監査報告書を生成しました: ${path}`);
}

// ============================================================
// Command: invoice
// ============================================================

async function generateInvoice(args: InvoiceArgs): Promise<void> {
  // 必須チェック
  if (!args.client) {
    throw new Error("--client オプションは必須です");
  }

  const client = sanitizeFilename(args.client);
  const amount = args.amount ?? 50000;
  const itemName = args.item || "顧問契約料（月額）";
  const quantity = args.quantity ?? 1;

  // 金額の範囲チェック
  if (amount < 0 || amount > 100000000) {
    throw new Error(`無効な金額: ${amount}。0〜100,000,000の範囲で指定してください`);
  }

  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setMonth(dueDate.getMonth() + 1);

  const subtotal = amount * quantity;
  const tax = Math.floor(subtotal * TAX_RATE);
  const total = subtotal + tax;

  const template = await loadTemplate("invoice");

  const variables: Record<string, string> = {
    invoice_number: generateInvoiceNumber(),
    issue_date: formatDate(today),
    due_date: formatDate(dueDate),
    client,
    item_name: itemName,
    quantity: String(quantity),
    unit_price: formatYen(amount),
    subtotal: formatYen(subtotal),
    additional_items: "",
    subtotal_all: formatYen(subtotal),
    tax: formatYen(tax),
    total: formatYen(total),
    // Bank info
    bank_name: args.bank || "○○銀行",
    branch_name: args.branch || "○○支店",
    account_type: args.account_type || "普通",
    account_number: args.account_number || "XXXXXXX",
    notes: args.notes || "",
  };

  const content = replaceVariables(template, variables);
  const filename = `invoice_${client}_${formatDate(today)}.md`;
  const path = await saveOutput(filename, content);

  console.log(`✅ 請求書を生成しました: ${path}`);
}

// ============================================================
// Main
// ============================================================

function showHelp(): void {
  console.log(`
Cursorvers Document Generator

Usage:
  deno run --allow-read --allow-write generate.ts <command> [options]

Commands:
  proposal   提案書生成
    --client    顧客名（必須）
    --type      タイプ: 48h | advisor（デフォルト: 48h）
    --price     金額（デフォルト: 50000）

  audit      監査報告書生成
    --client    顧客名（必須）
    --scope     監査範囲
    --governance, --security, --operation, --compliance  各スコア

  invoice    請求書生成
    --client    顧客名（必須）
    --amount    金額（デフォルト: 50000）
    --item      項目名

Examples:
  generate.ts proposal --client="○○クリニック" --type=48h
  generate.ts audit --client="○○病院" --governance=85 --security=80
  generate.ts invoice --client="○○クリニック" --amount=50000
`);
}

async function main(): Promise<void> {
  const args = parse(Deno.args, {
    string: ["client", "type", "scope", "item", "bank", "branch", "notes"],
    default: {},
  });

  const command = args._[0];

  if (!command || args.help || args.h) {
    showHelp();
    Deno.exit(0);
  }

  try {
    switch (command) {
      case "proposal":
        await generateProposal(args as unknown as ProposalArgs);
        break;
      case "audit":
        await generateAuditReport(args as unknown as AuditArgs);
        break;
      case "invoice":
        await generateInvoice(args as unknown as InvoiceArgs);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        Deno.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

main();
