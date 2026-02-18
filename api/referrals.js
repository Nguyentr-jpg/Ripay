const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { sendReferralInviteEmail } = require("./_mail");

let prisma;

function getPrisma() {
  if (!prisma) {
    const dbUrl = process.env.DATABASE_URL || "";
    if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
      throw new Error(
        "DATABASE_URL is not configured. Please set it in your Vercel environment variables."
      );
    }
    prisma = new PrismaClient();
  }
  return prisma;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAppUrl() {
  return String(process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app")
    .trim()
    .replace(/\/+$/, "");
}

function getErrorHint(error) {
  if (error.code === "P2021") {
    return "Referral table missing. Run 'npx prisma db push' and redeploy.";
  }
  if (error.code === "P2022") {
    return "Referral schema outdated. Run 'npx prisma db push' and redeploy.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL.";
  }
  return error.message || "Referral service error.";
}

function createReferralCode() {
  return crypto.randomBytes(12).toString("hex");
}

async function getOrCreateUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Missing email");

  let user = await getPrisma().user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    user = await getPrisma().user.create({
      data: {
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0],
      },
    });
  }
  return user;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    getPrisma();

    if (req.method === "GET") {
      return await handleGet(req, res);
    }
    if (req.method === "POST") {
      return await handlePost(req, res);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Referral API Error:", error);
    return res.status(500).json({
      error: "Referral service error",
      hint: getErrorHint(error),
      code: error.code || null,
    });
  }
};

async function handleGet(req, res) {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: "Missing email parameter" });
  }

  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    return res.status(200).json({
      success: true,
      stats: { total: 0, pending: 0, rewarded: 0 },
      invites: [],
      referralLink: getAppUrl(),
    });
  }

  const invites = await getPrisma().referralInvite.findMany({
    where: { referrerUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const pending = invites.filter((item) => item.status !== "REWARDED").length;
  const rewarded = invites.filter((item) => item.status === "REWARDED").length;

  return res.status(200).json({
    success: true,
    stats: {
      total: invites.length,
      pending,
      rewarded,
    },
    invites: invites.map((item) => ({
      id: item.id,
      inviteeEmail: item.inviteeEmail,
      status: item.status,
      createdAt: item.createdAt,
      rewardedAt: item.rewardedAt,
      referralCode: item.referralCode,
    })),
    referralLink: getAppUrl(),
  });
}

async function handlePost(req, res) {
  const { action } = req.body || {};
  if (action === "invite") {
    return await handleInvite(req, res);
  }

  return res.status(400).json({ error: "Invalid action. Use 'invite'." });
}

async function handleInvite(req, res) {
  const { referrerEmail, inviteeEmail } = req.body || {};
  const normalizedReferrer = normalizeEmail(referrerEmail);
  const normalizedInvitee = normalizeEmail(inviteeEmail);

  if (!normalizedReferrer || !normalizedInvitee) {
    return res.status(400).json({ error: "Missing required fields: referrerEmail, inviteeEmail" });
  }
  if (!isValidEmail(normalizedInvitee)) {
    return res.status(400).json({ error: "Invitee email is invalid." });
  }
  if (normalizedReferrer === normalizedInvitee) {
    return res.status(400).json({ error: "You cannot invite your own email." });
  }

  const referrer = await getOrCreateUserByEmail(normalizedReferrer);
  const existing = await getPrisma().referralInvite.findUnique({
    where: {
      referrerUserId_inviteeEmail: {
        referrerUserId: referrer.id,
        inviteeEmail: normalizedInvitee,
      },
    },
  });

  let invite = existing;
  if (!invite) {
    invite = await getPrisma().referralInvite.create({
      data: {
        referrerUserId: referrer.id,
        inviteeEmail: normalizedInvitee,
        referralCode: createReferralCode(),
        status: "PENDING",
      },
    });
  }

  const inviteUrl = `${getAppUrl()}/?ref=${encodeURIComponent(invite.referralCode)}`;
  const emailResult = await sendReferralInviteEmail({
    toEmail: normalizedInvitee,
    toName: normalizedInvitee.split("@")[0],
    referrerName: referrer.name || referrer.email,
    inviteUrl,
  });

  return res.status(200).json({
    success: true,
    invite: {
      id: invite.id,
      inviteeEmail: invite.inviteeEmail,
      status: invite.status,
      createdAt: invite.createdAt,
      referralCode: invite.referralCode,
    },
    email: emailResult,
  });
}
