import type { Hono } from "hono";
import type { MemberRole, Prisma, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { z } from "zod";
import type { SlackClient } from "../../slack/client.js";
import { PLAN_KEYS, TRIAL_DURATION_MS } from "../plans/catalog.js";
import { getLogStats, getRecentLogs, getRecentRequests, opsLogger } from "./logger.js";
import {
  collectPipelineMetrics,
  pipelineHealthSummary,
} from "./pipeline-metrics.js";
import { collectOpsStats, PAID_PLAN_KEYS } from "./stats.js";
import {
  opsPasswordEnabled,
  opsPasswordWrite,
} from "./ops-password.js";
import {
  generateTempPassword,
  issueOpsEnterLink,
  resolveSaasAppUrl,
  rotateUserCredentialPassword,
} from "./session.js";

const planKeySchema = z.enum(["free", "trial", "basic", "pro"]);

const clampLimit = (raw: string | undefined) =>
  Math.min(Math.max(Number(raw) || 50, 1), 200);

const clampOffset = (raw: string | undefined) =>
  Math.max(Number(raw) || 0, 0);

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
};

const subscriptionView = (
  sub: {
    planKey: string;
    status: string;
    trialEndsAt: Date | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    extraSeats: number;
  } | null,
) => ({
  plan: sub?.planKey ?? "free",
  billingStatus: sub?.status?.toLowerCase() ?? "incomplete",
  trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
  stripeCustomerId: sub?.stripeCustomerId ?? null,
  stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
  stripePriceId: sub?.stripePriceId ?? null,
  seatLimit: null as number | null,
});

const upsertOrgPlan = async (
  prisma: PrismaClient,
  organizationId: string,
  planKey: z.infer<typeof planKeySchema>,
) => {
  const now = new Date();
  const status = planKey === PLAN_KEYS.trial ? ("TRIALING" as const) : ("ACTIVE" as const);
  const trialEndsAt =
    planKey === PLAN_KEYS.trial ? new Date(now.getTime() + TRIAL_DURATION_MS) : null;

  return prisma.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      status,
      planKey,
      trialEndsAt,
      extraSeats: 0,
    },
    update: {
      status,
      planKey,
      trialEndsAt,
      cancelAtPeriodEnd: false,
    },
  });
};

export const registerOpsAdminRoutes = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: Hono<any>,
  deps: { slack: SlackClient },
) => {
  app.get("/admin/ops/stats", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const data = await collectOpsStats(getPrisma());
      return c.json({ data });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/admin/ops/logs", async (c) => {
    const levelRaw = String(c.req.query("level") || "error_warn");
    const level =
      levelRaw === "all"
        ? undefined
        : (levelRaw as "info" | "warn" | "error" | "debug" | "error_warn");
    const limit = Number(c.req.query("limit") || 100);
    const q = c.req.query("q") || undefined;
    return c.json({
      data: getRecentLogs({ level, limit, q }),
      meta: {
        note: "In-memory ring buffer for this API process only (clears on restart).",
        ...getLogStats(),
      },
    });
  });

  app.get("/admin/ops/requests", async (c) => {
    const limit = Number(c.req.query("limit") || 100);
    const errorsOnly = c.req.query("errors") === "1";
    return c.json({
      data: getRecentRequests({
        limit,
        minStatus: errorsOnly ? 400 : undefined,
      }),
      meta: {
        note: "In-memory ring buffer for this API process only (clears on restart).",
        ...getLogStats(),
      },
    });
  });

  app.get("/admin/ops/health", async (c) => {
    let dbOk = false;
    let pipelineSummary: ReturnType<typeof pipelineHealthSummary> | null = null;
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
      try {
        const pipeline = await collectPipelineMetrics(prisma);
        pipelineSummary = pipelineHealthSummary(pipeline);
      } catch {
        pipelineSummary = null;
      }
    } catch {
      dbOk = false;
    }
    const alertErrors = pipelineSummary?.alertLevels.error ?? 0;
    return c.json({
      data: {
        ok: dbOk && alertErrors === 0,
        service: "arc-tenders-api",
        db: dbOk,
        slackConfigured: Boolean(
          String(process.env.SLACK_WEBHOOK_URL || "").trim(),
        ),
        generatedAt: new Date().toISOString(),
        pipeline: pipelineSummary,
        ...getLogStats(),
      },
    });
  });

  /** Full outbox / ingest / email / storage / PDF ops dashboard payload (no PII). */
  app.get("/admin/ops/pipeline", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const data = await collectPipelineMetrics(getPrisma());
      return c.json({ data });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/admin/ops/stats/notify", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const data = await collectOpsStats(prisma);
      const text = [
        `[arc-tenders] users=${data.users} orgs=${data.organizations} paying=${data.payingOrgs}`,
        `seats=${data.payingUsers} errors=${data.logs.errorsInBuffer} warns=${data.logs.warnsInBuffer}`,
      ].join(" · ");
      const sent = await deps.slack.sendText(text);
      opsLogger.info("ops_stats_notify", { sent, ...data });
      return c.json({ data: { ...data, slackSent: sent }, ok: true, slackSent: sent, text });
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.get("/admin/ops/product-events", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const userId = c.req.query("userId") || undefined;
      const organizationId = c.req.query("organizationId") || undefined;
      const type = c.req.query("type") || undefined;
      const from = c.req.query("from") || undefined;
      const to = c.req.query("to") || undefined;
      const limit = Math.min(Math.max(Number(c.req.query("limit") || 100), 1), 500);

      const createdAt: { gte?: Date; lte?: Date } = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) createdAt.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) createdAt.lte = d;
      }

      const rows = await prisma.productEvent.findMany({
        where: {
          ...(userId ? { userId } : {}),
          ...(organizationId ? { organizationId } : {}),
          ...(type ? { type } : {}),
          ...(Object.keys(createdAt).length ? { createdAt } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const userIds = [
        ...new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id))),
      ];
      const orgIds = [
        ...new Set(
          rows.map((r) => r.organizationId).filter((id): id is string => Boolean(id)),
        ),
      ];
      const [users, orgs] = await Promise.all([
        userIds.length
          ? prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, email: true, name: true },
            })
          : Promise.resolve([]),
        orgIds.length
          ? prisma.organization.findMany({
              where: { id: { in: orgIds } },
              select: { id: true, name: true },
            })
          : Promise.resolve([]),
      ]);
      const userById = new Map(users.map((u) => [u.id, u]));
      const orgById = new Map(orgs.map((o) => [o.id, o.name]));

      return c.json({
        data: rows.map((r) => {
          const user = r.userId ? userById.get(r.userId) : undefined;
          return {
            id: r.id,
            type: r.type,
            userId: r.userId,
            userEmail: user?.email ?? null,
            userName: user?.name ?? null,
            organizationId: r.organizationId,
            organizationName: r.organizationId
              ? orgById.get(r.organizationId) ?? null
              : null,
            sessionId: r.sessionId,
            requestId: r.requestId,
            entityType: r.entityType,
            entityId: r.entityId,
            metadata: r.metadata,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/admin/ops/trials/:userId/activity", async (c) => {
    const userId = c.req.param("userId");
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const limit = Math.min(Math.max(Number(c.req.query("limit") || 200), 1), 500);
      const [rows, user, membership] = await Promise.all([
        prisma.productEvent.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          take: limit,
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true },
        }),
        prisma.organizationMember.findFirst({
          where: { userId },
          select: { organization: { select: { id: true, name: true } } },
        }),
      ]);
      const { firstName, lastName } = splitName(user?.name ?? "");
      return c.json({
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              firstName,
              lastName,
              organizationId: membership?.organization.id ?? null,
              organizationName: membership?.organization.name ?? null,
            }
          : {
              id: userId,
              email: null,
              name: null,
              firstName: null,
              lastName: null,
              organizationId: null,
              organizationName: null,
              deleted: true,
            },
        data: rows.map((r) => ({
          timestamp: r.createdAt.toISOString(),
          event: r.type,
          ...(r.entityId ? { entityId: r.entityId } : {}),
          ...(r.entityType ? { entityType: r.entityType } : {}),
          ...(r.sessionId ? { sessionId: r.sessionId } : {}),
          ...(r.requestId ? { requestId: r.requestId } : {}),
        })),
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/admin/ops/users", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const q = String(c.req.query("q") || "").trim();
      const limit = clampLimit(c.req.query("limit"));
      const offset = clampOffset(c.req.query("offset"));

      const where = q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            opsPassword: true,
            opsPasswordAt: true,
            createdAt: true,
            updatedAt: true,
            members: {
              select: {
                role: true,
                organization: {
                  select: {
                    id: true,
                    name: true,
                    subscription: {
                      select: {
                        planKey: true,
                        status: true,
                        trialEndsAt: true,
                        stripeCustomerId: true,
                        stripeSubscriptionId: true,
                        stripePriceId: true,
                        extraSeats: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

      const showOpsPassword = opsPasswordEnabled();
      return c.json({
        data: {
          items: rows.map((u) => {
            const { firstName, lastName } = splitName(u.name);
            return {
              id: u.id,
              email: u.email,
              firstName,
              lastName,
              phone: "",
              accountType: "member",
              contractorName: null,
              mustChangePassword: false,
              opsPassword: showOpsPassword ? u.opsPassword ?? "" : "",
              opsPasswordAt:
                showOpsPassword && u.opsPasswordAt
                  ? u.opsPasswordAt.toISOString()
                  : null,
              createdAt: u.createdAt.toISOString(),
              updatedAt: u.updatedAt.toISOString(),
              memberships: u.members.map((m) => ({
                role: m.role.toLowerCase(),
                organization: {
                  id: m.organization.id,
                  name: m.organization.name,
                  ...subscriptionView(m.organization.subscription),
                },
              })),
            };
          }),
          total,
          limit,
          offset,
          opsPasswordEnabled: showOpsPassword,
        },
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/admin/ops/users/:id", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const id = c.req.param("id");
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          opsPassword: true,
          opsPasswordAt: true,
          createdAt: true,
          updatedAt: true,
          members: {
            select: {
              id: true,
              role: true,
              createdAt: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  createdAt: true,
                  subscription: {
                    select: {
                      planKey: true,
                      status: true,
                      trialEndsAt: true,
                      stripeCustomerId: true,
                      stripeSubscriptionId: true,
                      stripePriceId: true,
                      extraSeats: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!user) return c.json({ error: "Not found" }, 404);

      const showOpsPassword = opsPasswordEnabled();
      const { firstName, lastName } = splitName(user.name);
      return c.json({
        data: {
          id: user.id,
          email: user.email,
          firstName,
          lastName,
          phone: "",
          accountType: "member",
          contractorName: null,
          mustChangePassword: false,
          opsPassword: showOpsPassword ? user.opsPassword ?? "" : "",
          opsPasswordAt:
            showOpsPassword && user.opsPasswordAt
              ? user.opsPasswordAt.toISOString()
              : null,
          opsPasswordEnabled: showOpsPassword,
          avatarStyle: "",
          avatarSeed: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          memberships: user.members.map((m) => ({
            id: m.id,
            role: m.role.toLowerCase(),
            createdAt: m.createdAt.toISOString(),
            organization: {
              id: m.organization.id,
              name: m.organization.name,
              slug: m.organization.slug,
              createdAt: m.organization.createdAt.toISOString(),
              ...subscriptionView(m.organization.subscription),
            },
          })),
        },
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.delete("/admin/ops/users/:id", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { deleteUserAccount } = await import("../services/account-deletion.js");
      const prisma = getPrisma();
      const id = c.req.param("id");
      const body = z.object({ confirm: z.literal("DELETE") }).parse(
        await c.req.json().catch(() => ({})),
      );

      const result = await deleteUserAccount(prisma, {
        userId: id,
        confirm: body.confirm,
        requirePasswordIfCredential: false,
      });

      opsLogger.warn("ops_user_deleted", {
        userId: result.userId,
        email: result.email,
        orgsDeleted: result.orgsDeleted,
      });

      return c.json({
        data: {
          ok: true,
          userId: result.userId,
          email: result.email,
          orgsDeleted: result.orgsDeleted,
        },
      });
    } catch (error) {
      const { SaasError } = await import("../errors.js");
      if (error instanceof SaasError) {
        const message =
          error.code === "cannot_delete_while_owning_org_with_members"
            ? "Cannot delete user while they own an organization with other members. Transfer ownership or remove members first."
            : error.code === "user_not_found"
              ? "User not found"
              : error.message;
        return c.json({ error: message }, error.status as 400 | 404);
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/admin/ops/organizations", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const q = String(c.req.query("q") || "").trim();
      const plan = String(c.req.query("plan") || "").trim();
      const paying = c.req.query("paying") === "1";
      const limit = clampLimit(c.req.query("limit"));
      const offset = clampOffset(c.req.query("offset"));

      const payingStatuses: SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"];
      const where: Prisma.OrganizationWhereInput = paying
        ? {
            subscription: {
              planKey: { in: [...PAID_PLAN_KEYS] },
              status: { in: payingStatuses },
            },
          }
        : plan && ["trial", "basic", "pro"].includes(plan)
          ? { subscription: { planKey: plan } }
          : {};

      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          {
            subscription: {
              stripeCustomerId: { contains: q, mode: "insensitive" },
            },
          },
          {
            subscription: {
              stripeSubscriptionId: { contains: q, mode: "insensitive" },
            },
          },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.organization.count({ where }),
        prisma.organization.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
            subscription: {
              select: {
                planKey: true,
                status: true,
                trialEndsAt: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
                stripePriceId: true,
                extraSeats: true,
              },
            },
            _count: {
              select: {
                members: true,
                organizationTenders: true,
                watchProfiles: true,
              },
            },
            members: {
              take: 8,
              orderBy: { createdAt: "asc" },
              select: {
                role: true,
                user: {
                  select: { id: true, email: true, name: true },
                },
              },
            },
          },
        }),
      ]);

      return c.json({
        data: {
          items: rows.map((o) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            ...subscriptionView(o.subscription),
            createdAt: o.createdAt.toISOString(),
            updatedAt: o.updatedAt.toISOString(),
            _count: {
              memberships: o._count.members,
              tenders: o._count.organizationTenders,
              budgets: 0,
              projects: o._count.watchProfiles,
              contractors: 0,
            },
            memberships: o.members.map((m) => {
              const { firstName, lastName } = splitName(m.user.name);
              return {
                role: m.role.toLowerCase(),
                user: {
                  id: m.user.id,
                  email: m.user.email,
                  firstName,
                  lastName,
                  accountType: "member",
                },
              };
            }),
          })),
          total,
          limit,
          offset,
        },
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/admin/ops/organizations/:id", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const id = c.req.param("id");
      const org = await prisma.organization.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
          subscription: {
            select: {
              planKey: true,
              status: true,
              trialEndsAt: true,
              stripeCustomerId: true,
              stripeSubscriptionId: true,
              stripePriceId: true,
              extraSeats: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
            },
          },
          _count: {
            select: {
              members: true,
              organizationTenders: true,
              watchProfiles: true,
            },
          },
          members: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
      if (!org) return c.json({ error: "Not found" }, 404);

      return c.json({
        data: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          ...subscriptionView(org.subscription),
          currentPeriodEnd: org.subscription?.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: org.subscription?.cancelAtPeriodEnd ?? false,
          extraSeats: org.subscription?.extraSeats ?? 0,
          createdAt: org.createdAt.toISOString(),
          updatedAt: org.updatedAt.toISOString(),
          _count: {
            memberships: org._count.members,
            tenders: org._count.organizationTenders,
            budgets: 0,
            projects: org._count.watchProfiles,
            contractors: 0,
          },
          memberships: org.members.map((m) => {
            const { firstName, lastName } = splitName(m.user.name);
            return {
              id: m.id,
              role: m.role.toLowerCase(),
              createdAt: m.createdAt.toISOString(),
              user: {
                id: m.user.id,
                email: m.user.email,
                firstName,
                lastName,
                phone: "",
                accountType: "member",
                createdAt: m.user.createdAt.toISOString(),
              },
            };
          }),
        },
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.patch("/admin/ops/organizations/:id", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const id = c.req.param("id");
      const body = z
        .object({ planKey: planKeySchema })
        .parse(await c.req.json());

      const org = await prisma.organization.findUnique({ where: { id } });
      if (!org) return c.json({ error: "Organization not found" }, 404);

      const subscription = await upsertOrgPlan(prisma, id, body.planKey);
      opsLogger.warn("ops_org_plan_forced", {
        organizationId: id,
        planKey: body.planKey,
      });

      return c.json({
        data: {
          organizationId: id,
          planKey: subscription.planKey,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 400);
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/admin/ops/impersonate", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const body = z
        .object({
          userId: z.string().min(1).optional(),
          email: z.string().email().optional(),
          /** When true, also rotate credential password (destroys prior password). */
          rotatePassword: z.boolean().optional().default(false),
        })
        .refine((v) => Boolean(v.userId || v.email), {
          message: "userId or email required",
        })
        .parse(await c.req.json());

      const user = body.userId
        ? await prisma.user.findUnique({
            where: { id: body.userId },
            select: { id: true, email: true, opsPassword: true },
          })
        : await prisma.user.findFirst({
            where: {
              email: { equals: body.email!.trim(), mode: "insensitive" },
            },
            select: { id: true, email: true, opsPassword: true },
          });

      if (!user) return c.json({ error: "User not found" }, 404);

      const appUrl = resolveSaasAppUrl();
      const link = await issueOpsEnterLink(prisma, user.id, appUrl);
      if (!link) return c.json({ error: "User not found" }, 404);

      let credentials: { email: string; password: string } | undefined;
      if (body.rotatePassword) {
        const password = generateTempPassword();
        const rotated = await rotateUserCredentialPassword(
          prisma,
          user.id,
          password,
        );
        if (rotated) {
          await prisma.user.update({
            where: { id: user.id },
            data: opsPasswordWrite(rotated.password),
          });
          credentials = rotated;
        }
      } else if (opsPasswordEnabled() && user.opsPassword && user.email) {
        credentials = { email: user.email, password: user.opsPassword };
      }

      opsLogger.warn("ops_impersonate", { userId: user.id, email: user.email });
      return c.json({
        data: {
          openUrl: link.openUrl,
          expiresIn: "8h",
          credentials,
          note: body.rotatePassword
            ? "Opened with session cookie. Credential password was rotated."
            : "Opened with better-auth session cookie. Password unchanged.",
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 400);
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/admin/ops/users/:id/password", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const id = c.req.param("id");
      const body = z
        .object({
          password: z.string().min(8).max(128).optional(),
        })
        .parse(await c.req.json().catch(() => ({})));

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true },
      });
      if (!user) return c.json({ error: "User not found" }, 404);

      const password = body.password?.trim() || generateTempPassword();
      const credentials = await rotateUserCredentialPassword(
        prisma,
        user.id,
        password,
      );
      if (!credentials) return c.json({ error: "Failed to set password" }, 500);

      await prisma.user.update({
        where: { id: user.id },
        data: opsPasswordWrite(credentials.password),
      });

      opsLogger.warn("ops_password_issued", {
        userId: user.id,
        email: user.email,
      });

      return c.json({
        data: {
          credentials,
          opsPasswordEnabled: opsPasswordEnabled(),
          note: opsPasswordEnabled()
            ? "Password set and stored for Ops Desk visibility."
            : "Password set. Ops storage disabled (OPS_PASSWORD_VISIBLE=0).",
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 400);
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/admin/ops/sandbox", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const prisma = getPrisma();
      const body = z
        .object({
          planKey: planKeySchema.default("trial"),
          role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional().default("OWNER"),
          orgName: z.string().min(1).max(120).optional(),
          email: z.string().email().optional(),
        })
        .parse(await c.req.json().catch(() => ({})));

      const stamp = Date.now().toString(36);
      const email =
        body.email?.toLowerCase().trim() ||
        `ops+${body.planKey}-${body.role.toLowerCase()}-${stamp}@tekia.gr`;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return c.json(
          { error: "Email already exists — pick another or impersonate that user" },
          409,
        );
      }

      const password = generateTempPassword();
      const hashed = await import("better-auth/crypto").then((m) =>
        m.hashPassword(password),
      );
      const orgName = body.orgName?.trim() || `Ops ${body.planKey} ${stamp}`;
      const slugBase = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      const slug = `${slugBase || "ops"}-${stamp}`;

      const user = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: orgName, slug },
        });
        const created = await tx.user.create({
          data: {
            email,
            name: `Ops ${body.role}`,
            emailVerified: true,
            ...opsPasswordWrite(password),
          },
        });
        await tx.account.create({
          data: {
            id: `cred_${created.id}`,
            accountId: created.id,
            providerId: "credential",
            userId: created.id,
            password: hashed,
          },
        });
        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: created.id,
            role: body.role as MemberRole,
          },
        });
        await tx.organizationSettings.create({
          data: {
            organizationId: organization.id,
            company: {
              legalName: orgName,
              distinctiveTitle: orgName,
              afm: null,
              gemiNumber: null,
              source: "MANUAL",
              lastSyncedAt: null,
            },
            activities: [],
            notifications: {
              emailEnabled: true,
              recipients: [],
              events: {
                newOpportunity: true,
                relatedActOnFollowed: true,
                postSubmissionUpdate: true,
              },
            },
            onboardingStatus: "NOT_STARTED",
          },
        });
        const now = new Date();
        const status =
          body.planKey === PLAN_KEYS.trial ? ("TRIALING" as const) : ("ACTIVE" as const);
        await tx.subscription.create({
          data: {
            organizationId: organization.id,
            status,
            planKey: body.planKey,
            trialEndsAt:
              body.planKey === PLAN_KEYS.trial
                ? new Date(now.getTime() + TRIAL_DURATION_MS)
                : null,
            extraSeats: 0,
          },
        });
        return created;
      });

      const appUrl = resolveSaasAppUrl();
      const link = await issueOpsEnterLink(prisma, user.id, appUrl);
      if (!link) return c.json({ error: "Failed to issue session" }, 500);

      opsLogger.warn("ops_sandbox_created", {
        userId: user.id,
        email,
        planKey: body.planKey,
        role: body.role,
      });

      return c.json({
        data: {
          openUrl: link.openUrl,
          credentials: { email, password },
          note: "Sandbox for ops feature checks. Prefer impersonate for real customer accounts.",
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 400);
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  // -------------------------------------------------------------------------
  // ARC_PRO_LAUNCH_30 — Promotions admin (Ops Desktop)
  // -------------------------------------------------------------------------

  const promoAdminError = async (c: {
    json: (body: unknown, status?: number) => Response;
  }, error: unknown) => {
    const { SaasError } = await import("../errors.js");
    if (error instanceof z.ZodError) {
      return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 400);
    }
    if (error instanceof SaasError) {
      return c.json(
        { error: error.message, code: error.code },
        error.status as 400 | 401 | 403 | 404 | 409,
      );
    }
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  };

  app.get("/admin/ops/promotions/arc-pro-launch-30/summary", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { getPromotionAdminSummary } = await import(
        "../services/promotion-admin.js"
      );
      const data = await getPromotionAdminSummary(getPrisma());
      return c.json({ data, syncedAt: new Date().toISOString() });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });

  app.get("/admin/ops/promotions/arc-pro-launch-30/redemptions", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { listPromotionRedemptions } = await import(
        "../services/promotion-admin.js"
      );
      const data = await listPromotionRedemptions(getPrisma(), {
        status: c.req.query("status"),
        q: c.req.query("q"),
        limit: clampLimit(c.req.query("limit")),
        offset: clampOffset(c.req.query("offset")),
      });
      return c.json({ data, syncedAt: new Date().toISOString() });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });

  app.get("/admin/ops/promotions/arc-pro-launch-30/audit", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { listPromotionAuditEvents } = await import(
        "../services/promotion-admin.js"
      );
      const data = await listPromotionAuditEvents(getPrisma(), {
        limit: clampLimit(c.req.query("limit")),
        offset: clampOffset(c.req.query("offset")),
      });
      return c.json({ data, syncedAt: new Date().toISOString() });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });

  app.post("/admin/ops/promotions/arc-pro-launch-30/grant", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { adminGrantPromotion, getPromotionAdminSummary } = await import(
        "../services/promotion-admin.js"
      );
      const body = z
        .object({
          organizationId: z.string().min(1),
          reason: z.string().min(3).max(1000),
          forceWhenDisabled: z.boolean().optional().default(false),
          idempotencyKey: z.string().min(8).max(120).optional(),
        })
        .parse(await c.req.json());

      const result = await adminGrantPromotion(getPrisma(), {
        organizationId: body.organizationId,
        performedBy: "ops:admin_token",
        reason: body.reason,
        forceWhenDisabled: body.forceWhenDisabled,
        idempotencyKey: body.idempotencyKey ?? null,
      });

      opsLogger.warn("ops_promo_grant", {
        organizationId: body.organizationId,
        redemptionId: result.redemption.id,
        forceWhenDisabled: body.forceWhenDisabled,
        replayed: result.replayed,
      });

      const summary = await getPromotionAdminSummary(getPrisma());
      return c.json({
        data: {
          ok: true,
          replayed: result.replayed,
          redemption: {
            id: result.redemption.id,
            organizationId: result.redemption.organizationId,
            status: result.redemption.status,
            expiresAt: result.redemption.expiresAt.toISOString(),
            activatedAt: result.redemption.activatedAt.toISOString(),
            source: result.redemption.source,
            slotConsumed: result.redemption.slotConsumed,
          },
          summary,
        },
      });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });

  app.post("/admin/ops/promotions/arc-pro-launch-30/revoke", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { adminRevokePromotion, getPromotionAdminSummary } = await import(
        "../services/promotion-admin.js"
      );
      const body = z
        .object({
          organizationId: z.string().min(1),
          reason: z.string().min(3).max(1000),
          restoreSlot: z.boolean().optional().default(false),
          idempotencyKey: z.string().min(8).max(120).optional(),
        })
        .parse(await c.req.json());

      const result = await adminRevokePromotion(getPrisma(), {
        organizationId: body.organizationId,
        performedBy: "ops:admin_token",
        reason: body.reason,
        restoreSlot: body.restoreSlot,
        idempotencyKey: body.idempotencyKey ?? null,
      });

      opsLogger.warn("ops_promo_revoke", {
        organizationId: body.organizationId,
        restoreSlot: body.restoreSlot,
        replayed: result.replayed,
      });

      const summary = await getPromotionAdminSummary(getPrisma());
      const redemption =
        "redemption" in result && result.redemption
          ? {
              id: result.redemption.id,
              status: result.redemption.status,
              slotConsumed: result.redemption.slotConsumed,
              slotRestoredAt:
                result.redemption.slotRestoredAt?.toISOString() ?? null,
            }
          : null;
      return c.json({
        data: {
          ok: true,
          replayed: result.replayed,
          redemption,
          summary,
        },
      });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });

  app.post("/admin/ops/promotions/arc-pro-launch-30/restore-slot", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { adminRestoreSlot, getPromotionAdminSummary } = await import(
        "../services/promotion-admin.js"
      );
      const body = z
        .object({
          organizationId: z.string().min(1),
          reason: z.string().min(3).max(1000),
          idempotencyKey: z.string().min(8).max(120).optional(),
        })
        .parse(await c.req.json());

      const result = await adminRestoreSlot(getPrisma(), {
        organizationId: body.organizationId,
        performedBy: "ops:admin_token",
        reason: body.reason,
        idempotencyKey: body.idempotencyKey ?? null,
      });

      opsLogger.warn("ops_promo_restore_slot", {
        organizationId: body.organizationId,
        replayed: result.replayed,
      });

      const summary = await getPromotionAdminSummary(getPrisma());
      return c.json({
        data: {
          ok: true,
          replayed: result.replayed,
          summary,
        },
      });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });

  app.patch("/admin/ops/promotions/arc-pro-launch-30/capacity", async (c) => {
    try {
      const { getPrisma } = await import("../../db/prisma.js");
      const { setPromotionCapacity } = await import(
        "../services/promotion-capacity.js"
      );
      const { getPromotionAdminSummary } = await import(
        "../services/promotion-admin.js"
      );
      const body = z
        .object({
          capacity: z.number().int().positive(),
          reason: z.string().min(3).max(1000),
          idempotencyKey: z.string().min(8).max(120).optional(),
        })
        .parse(await c.req.json());

      const result = await setPromotionCapacity(getPrisma(), {
        capacity: body.capacity,
        reason: body.reason,
        performedBy: "ops:admin_token",
        idempotencyKey: body.idempotencyKey ?? null,
      });

      opsLogger.warn("ops_promo_capacity", {
        previousCapacity:
          "previousCapacity" in result ? result.previousCapacity : undefined,
        capacity: result.capacity,
        consumedSlots: result.consumedSlots,
        replayed: result.replayed,
      });

      const summary = await getPromotionAdminSummary(getPrisma());
      return c.json({ data: { ...result, summary } });
    } catch (error) {
      return promoAdminError(c, error);
    }
  });
};
