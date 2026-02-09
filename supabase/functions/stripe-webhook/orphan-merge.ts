/**
 * Orphan Record Merge Logic
 * Identity Resolver (Phase 5-2) based evidence-driven safe merge
 *
 * @see Plans.md Phase 5-2
 */
import { createClient } from "@supabase/supabase-js";
import { notifyDiscord } from "../_shared/alert.ts";
import { createLogger } from "../_shared/logger.ts";
import { maskEmail, maskLineUserId } from "../_shared/masking-utils.ts";
import { createAuditEntry, decideMerge } from "../_shared/identity-resolver.ts";
import type { OrphanCandidate } from "../_shared/identity-resolver.ts";

const log = createLogger("stripe-webhook");

/**
 * 孤児レコード（LINE IDのみで登録された無料会員）のマージ判定
 * Identity Resolver (Phase 5-2) を使用した証拠ベースの安全なマージ
 */
export async function mergeOrphanLineRecord(
  // deno-lint-ignore no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
  paidEmail: string,
  paidMemberId: string,
  metadataLineUserId: string | null = null,
): Promise<{ merged: boolean; orphanLineUserId?: string }> {
  // まず新しい有料レコードにline_user_idがあるか確認
  const { data: paidMember } = await supabase
    .from("members")
    .select("line_user_id")
    .eq("id", paidMemberId)
    .maybeSingle();

  const paidMemberData = paidMember as { line_user_id?: string | null } | null;

  if (paidMemberData?.line_user_id) {
    // すでにline_user_idがあれば、そのline_user_idで別の孤児レコードを探す
    const { data: orphans } = await supabase
      .from("members")
      .select("id, email, line_user_id, tier")
      .eq("line_user_id", paidMemberData.line_user_id)
      .neq("id", paidMemberId);

    type OrphanRow = {
      id: string;
      email: string | null;
      line_user_id: string | null;
      tier: string | null;
    };
    const orphanList = orphans as OrphanRow[] | null;

    if (orphanList && orphanList.length > 0) {
      // 同一line_user_id → 強い証拠、自動マージ
      for (const orphan of orphanList) {
        await supabase.from("members").delete().eq("id", orphan.id);
        log.info("Deleted orphan record (same line_user_id)", {
          orphanId: orphan.id,
          orphanEmail: maskEmail(orphan.email),
          lineUserId: maskLineUserId(orphan.line_user_id),
        });
      }
      return { merged: true, orphanLineUserId: paidMemberData.line_user_id };
    }
  }

  // Identity Resolver で孤児候補を評価
  const { data: emailNullOrphans } = await supabase
    .from("members")
    .select("id, line_user_id, email, tier")
    .is("email", null)
    .not("line_user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(5);

  const candidates: OrphanCandidate[] = (emailNullOrphans ?? []).map(
    (o: {
      id: string;
      line_user_id: string | null;
      email: string | null;
      tier: string | null;
    }) => ({
      id: o.id,
      line_user_id: o.line_user_id,
      email: o.email,
      tier: o.tier,
    }),
  );

  const decision = decideMerge(
    paidMemberId,
    paidEmail,
    metadataLineUserId,
    candidates,
  );

  // Audit log recording
  const auditEntry = createAuditEntry(decision, paidMemberId, paidEmail);
  await supabase.from("identity_merge_audit").insert(auditEntry).then(
    ({ error }: { error: { message: string } | null }) => {
      if (error) {
        log.warn("Failed to record merge audit", { error: error.message });
      }
    },
  );

  switch (decision.action) {
    case "AUTO_MERGE": {
      const candidate = decision.candidate;
      if (candidate) {
        // Merge: transfer line_user_id and delete orphan
        await supabase
          .from("members")
          .update({ line_user_id: candidate.line_user_id })
          .eq("id", paidMemberId);
        await supabase.from("members").delete().eq("id", candidate.id);
        log.info("Auto-merged orphan via Identity Resolver", {
          paidMemberId,
          orphanId: candidate.id,
          evidence: decision.evidence,
        });
        return {
          merged: true,
          orphanLineUserId: candidate.line_user_id ?? undefined,
        };
      }
      return { merged: false };
    }
    case "HOLD_FOR_REVIEW": {
      await notifyDiscord({
        title: "⚠️ 孤児LINEレコード検出（手動確認必要）",
        message:
          `有料会員 ${
            maskEmail(paidEmail)
          } に紐付け可能な孤児LINEレコードが見つかりました。\n` +
          `証拠が弱いため自動マージは保留。管理者が確認してください。\n` +
          `理由: ${decision.reason}`,
        severity: "warning",
        context: {
          paidMemberId,
          candidateId: decision.candidate?.id,
          evidence: decision.evidence,
        },
      });
      return { merged: false };
    }
    default:
      return { merged: false };
  }
}
