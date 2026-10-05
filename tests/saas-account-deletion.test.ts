import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

describe("saas account deletion", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes the user and sole-owned organizations", async () => {
    const { app } = createSaasTestApp(prisma);
    const email = `delete-me-${Date.now()}@example.com`;
    const password = "password12345";
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Delete Me",
      email,
      password,
    });

    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      {
        method: "POST",
        cookie,
        body: { name: "Solo Org" },
      },
    );
    expect(org.status).toBe(201);
    const organizationId = org.json.organization.id;

    const deleted = await authedJson<{
      data: { ok: true; orgsDeleted: number; organizationIds: string[] };
    }>(app, "/api/saas/me", {
      method: "DELETE",
      cookie,
      body: { confirm: "DELETE", password },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.json.data.ok).toBe(true);
    expect(deleted.json.data.orgsDeleted).toBe(1);
    expect(deleted.json.data.organizationIds).toContain(organizationId);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
    const remainingOrg = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    expect(remainingOrg).toBeNull();

    const meAfter = await authedJson(app, "/api/saas/me", { cookie });
    expect(meAfter.status).toBe(401);
  });

  it("rejects wrong password and missing confirm", async () => {
    const { app } = createSaasTestApp(prisma);
    const password = "password12345";
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Keep Me",
      email: `keep-${Date.now()}@example.com`,
      password,
    });

    const badPassword = await authedJson<{ error: string; message: string }>(
      app,
      "/api/saas/me",
      {
        method: "DELETE",
        cookie,
        body: { confirm: "DELETE", password: "wrong-password" },
      },
    );
    expect(badPassword.status).toBe(400);
    expect(badPassword.json.error).toBe("invalid_password");

    const noConfirm = await app.request("/api/saas/me", {
      method: "DELETE",
      headers: {
        cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    expect(noConfirm.status).toBe(400);

    const stillThere = await authedJson(app, "/api/saas/me", { cookie });
    expect(stillThere.status).toBe(200);
  });

  it("blocks deletion when user owns an org with other members", async () => {
    const { app } = createSaasTestApp(prisma);
    const ownerPassword = "password12345";
    const owner = await signUpAndGetCookie(app, {
      name: "Owner",
      email: `owner-${Date.now()}@example.com`,
      password: ownerPassword,
    });
    const member = await signUpAndGetCookie(app, {
      name: "Member",
      email: `member-${Date.now()}@example.com`,
      password: "password12345",
    });

    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      {
        method: "POST",
        cookie: owner.cookie,
        body: { name: "Shared Org" },
      },
    );
    expect(org.status).toBe(201);
    const organizationId = org.json.organization.id;

    const memberUser = await prisma.user.findFirst({
      where: { email: { startsWith: "member-" } },
      select: { id: true },
    });
    expect(memberUser).toBeTruthy();
    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: memberUser!.id,
        role: "MEMBER",
      },
    });

    const blocked = await authedJson<{ error: string; message: string }>(
      app,
      "/api/saas/me",
      {
        method: "DELETE",
        cookie: owner.cookie,
        body: { confirm: "DELETE", password: ownerPassword },
      },
    );
    expect(blocked.status).toBe(400);
    expect(blocked.json.error).toBe(
      "cannot_delete_while_owning_org_with_members",
    );

    const orgStill = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    expect(orgStill).toBeTruthy();

    // Member account can still delete itself (not owner of sole-member org).
    const memberDeleted = await authedJson<{ data: { ok: true; orgsDeleted: number } }>(
      app,
      "/api/saas/me",
      {
        method: "DELETE",
        cookie: member.cookie,
        body: { confirm: "DELETE", password: "password12345" },
      },
    );
    expect(memberDeleted.status).toBe(200);
    expect(memberDeleted.json.data.orgsDeleted).toBe(0);
    expect(
      await prisma.organization.findUnique({ where: { id: organizationId } }),
    ).toBeTruthy();
  });
});
