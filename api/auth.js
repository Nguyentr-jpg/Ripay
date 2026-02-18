const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { sendMagicLinkEmail } = require("./_mail");
const { getPlanFeatures, getTierFromPlan, getTierRank } = require("./_plans");

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

function getErrorHint(error) {
  if (!error) return "Unknown authentication error.";
  if (error.code === "EAUTH") {
    return "SMTP authentication failed. Check SMTP_USER and SMTP_PASS (Google App Password, no spaces).";
  }
  if (error.code === "ETIMEDOUT" || error.code === "ESOCKET") {
    return "Cannot connect to SMTP server. Check SMTP_HOST/SMTP_PORT/SMTP_SECURE.";
  }
  if (error.code === "P2021") {
    return "Subscriptions table is missing. Run 'npx prisma db push' against production database.";
  }
  if (error.code === "P2022") {
    return "Subscription columns are missing. Run 'npx prisma db push' then redeploy.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL in Vercel.";
  }
  if (error.code === "P1000") {
    return "Database authentication failed. Check DATABASE_URL credentials.";
  }
  return "Database query failed. Check database schema and environment variables.";
}

function envFlag(value) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function getAllowedEmails() {
  const raw = String(process.env.AUTH_ALLOWED_EMAILS || "").trim();
  if (!raw) return new Set();

  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getMagicLinkSecret() {
  return (
    String(process.env.AUTH_MAGIC_LINK_SECRET || "").trim() ||
    String(process.env.NEXTAUTH_SECRET || "").trim()
  );
}

function getMagicLinkTTLMinutes() {
  const value = Number(process.env.AUTH_MAGIC_LINK_EXPIRES_MINUTES || 10);
  if (!Number.isFinite(value) || value <= 0) return 10;
  return Math.min(60, Math.max(5, Math.round(value)));
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signMagicToken(payloadObj, secret) {
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyMagicToken(token, secret) {
  if (!token || typeof token !== "string") return { valid: false, reason: "Missing token" };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "Invalid token format" };

  const [payloadPart, signaturePart] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadPart)
    .digest("base64url");

  const givenBuf = Buffer.from(signaturePart);
  const expectedBuf = Buffer.from(expectedSignature);
  if (givenBuf.length !== expectedBuf.length) {
    return { valid: false, reason: "Invalid token signature" };
  }
  if (!crypto.timingSafeEqual(givenBuf, expectedBuf)) {
    return { valid: false, reason: "Invalid token signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch (error) {
    return { valid: false, reason: "Invalid token payload" };
  }

  const now = Date.now();
  if (!payload || typeof payload !== "object" || !payload.email || !payload.exp) {
    return { valid: false, reason: "Incomplete token payload" };
  }
  if (Number(payload.exp) < now) {
    return { valid: false, reason: "Token expired" };
  }

  return { valid: true, payload };
}

async function getActiveSubscriptionOrNull(db, userId) {
  let subscriptions = [];
  let warning = null;

  try {
    subscriptions = await db.subscription.findMany({
      where: {
        userId,
        status: "active",
        startedAt: { lte: new Date() },
        OR: [{ expiresAt: { gt: new Date() } }, { gateway: "PAYPAL" }],
      },
      orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
    });
  } catch (subscriptionError) {
    if (subscriptionError.code === "P2021" || subscriptionError.code === "P2022") {
      console.warn("Auth subscription lookup skipped due to schema mismatch:", subscriptionError.code);
      warning = getErrorHint(subscriptionError);
    } else {
      throw subscriptionError;
    }
  }

  let tier = "free";
  let selected = null;
  for (const subscription of subscriptions) {
    const nextTier = getTierFromPlan(subscription.plan);
    if (!selected) {
      selected = subscription;
      tier = nextTier;
      continue;
    }
    if (getTierRank(nextTier) > getTierRank(tier)) {
      tier = nextTier;
      selected = subscription;
      continue;
    }
    if (
      getTierRank(nextTier) === getTierRank(tier) &&
      new Date(subscription.expiresAt).getTime() > new Date(selected.expiresAt).getTime()
    ) {
      selected = subscription;
    }
  }

  return {
    subscription: selected,
    tier,
    planFeatures: getPlanFeatures(tier),
    warning,
  };
}

async function findOrCreateUserByEmailWithFlag(db, normalizedEmail, allowCreate) {
  let user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    if (!allowCreate && !envFlag(process.env.AUTH_AUTO_SIGNUP)) return null;
    user = await db.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0],
        role: "CLIENT",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  return user;
}

async function isInvitedEmail(db, normalizedEmail) {
  try {
    const invite = await db.referralInvite.findFirst({
      where: {
        inviteeEmail: normalizedEmail,
        status: { in: ["PENDING", "REGISTERED"] },
      },
      select: { id: true },
    });
    return Boolean(invite);
  } catch (error) {
    if (error.code === "P2021" || error.code === "P2022") {
      return false;
    }
    throw error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { action, email, token } = req.body || {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const db = getPrisma();

    if (action === "send_magic_link") {
      if (!normalizedEmail) {
        return res.status(400).json({ error: "Missing required field: email" });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const allowedEmails = getAllowedEmails();
      if (allowedEmails.size > 0 && !allowedEmails.has(normalizedEmail)) {
        return res.status(403).json({
          error: "This email is not allowed to sign in.",
          code: "EMAIL_NOT_ALLOWED",
        });
      }

      const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
      const invited = await isInvitedEmail(db, normalizedEmail);
      if (!existing && !invited && !envFlag(process.env.AUTH_AUTO_SIGNUP)) {
        return res.status(401).json({
          error: "Account not found. Please contact admin to create your account.",
          code: "ACCOUNT_NOT_FOUND",
        });
      }

      const secret = getMagicLinkSecret();
      if (!secret) {
        return res.status(500).json({
          error: "Auth secret is not configured.",
          code: "AUTH_SECRET_MISSING",
        });
      }

      const ttlMinutes = getMagicLinkTTLMinutes();
      const payload = {
        email: normalizedEmail,
        iat: Date.now(),
        exp: Date.now() + ttlMinutes * 60 * 1000,
        nonce: crypto.randomBytes(16).toString("hex"),
      };
      const authToken = signMagicToken(payload, secret);
      const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app")
        .trim()
        .replace(/\/+$/, "");
      const loginUrl = `${appUrl}/?auth_token=${encodeURIComponent(authToken)}`;

      const emailResult = await sendMagicLinkEmail({
        toEmail: normalizedEmail,
        toName: existing && existing.name ? existing.name : normalizedEmail.split("@")[0],
        loginUrl,
        expiresMinutes: ttlMinutes,
      });

      if (!emailResult || !emailResult.sent) {
        return res.status(500).json({
          error: "Could not send sign-in email.",
          detail: emailResult && emailResult.reason ? emailResult.reason : "MAIL_SEND_FAILED",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Sign-in link sent. Please check your email inbox.",
      });
    }

    if (action === "verify_magic_link") {
      const secret = getMagicLinkSecret();
      if (!secret) {
        return res.status(500).json({
          error: "Auth secret is not configured.",
          code: "AUTH_SECRET_MISSING",
        });
      }

      const verifyResult = verifyMagicToken(token, secret);
      if (!verifyResult.valid) {
        return res.status(401).json({
          error: verifyResult.reason || "Invalid or expired sign-in link.",
          code: "INVALID_MAGIC_LINK",
        });
      }

      const verifiedEmail = String(verifyResult.payload.email || "")
        .trim()
        .toLowerCase();
      if (!verifiedEmail) {
        return res.status(401).json({ error: "Invalid sign-in link.", code: "INVALID_MAGIC_LINK" });
      }

      const allowedEmails = getAllowedEmails();
      if (allowedEmails.size > 0 && !allowedEmails.has(verifiedEmail)) {
        return res.status(403).json({
          error: "This email is not allowed to sign in.",
          code: "EMAIL_NOT_ALLOWED",
        });
      }

      const invited = await isInvitedEmail(db, verifiedEmail);
      const user = await findOrCreateUserByEmailWithFlag(db, verifiedEmail, invited);
      if (!user) {
        return res.status(401).json({
          error: "Account not found. Please contact admin to create your account.",
          code: "ACCOUNT_NOT_FOUND",
        });
      }

      if (!user.emailVerifiedAt) {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
        user.emailVerifiedAt = new Date();
      }

      const { subscription, tier, planFeatures, warning } = await getActiveSubscriptionOrNull(db, user.id);
      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
        },
        subscription: subscription
          ? {
              plan: subscription.plan,
              status: subscription.status,
              expiresAt: subscription.expiresAt,
            }
          : null,
        tier,
        planFeatures,
        warning,
      });
    }

    return res.status(400).json({
      error: "Invalid auth action. Use 'send_magic_link' or 'verify_magic_link'.",
    });
  } catch (error) {
    console.error("Auth API Error:", error);
    return res.status(500).json({
      error: "Authentication failed",
      hint: getErrorHint(error),
      code: error.code || null,
    });
  }
};
