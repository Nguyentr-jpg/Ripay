const { PrismaClient } = require("@prisma/client");

let prisma;

function getPrisma() {
  if (!prisma) {
    const dbUrl = process.env.DATABASE_URL || "";
    if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
      throw new Error("DATABASE_URL is not configured.");
    }
    prisma = new PrismaClient();
  }
  return prisma;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function getPayPalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function normalizePlanId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("P-") ? raw : `P-${raw}`;
}

function getPayPalPlanId(plan) {
  if (plan === "monthly") return normalizePlanId(process.env.PAYPAL_PLAN_ID_MONTHLY);
  if (plan === "annual") return normalizePlanId(process.env.PAYPAL_PLAN_ID_ANNUAL);
  return "";
}

function addPlanInterval(date, plan) {
  const result = new Date(date);
  if (plan === "annual") {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

function mapPayPalStatusToLocal(paypalStatus) {
  const status = String(paypalStatus || "").toUpperCase();
  if (status === "ACTIVE") return "active";
  if (status === "APPROVAL_PENDING") return "pending";
  if (status === "SUSPENDED") return "suspended";
  if (status === "CANCELLED" || status === "EXPIRED") return "canceled";
  return status ? status.toLowerCase() : "pending";
}

function parseDate(dateStr, fallbackDate) {
  if (!dateStr) return fallbackDate;
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? fallbackDate : parsed;
}

function getErrorHint(error) {
  if (error.code === "P2021") {
    return "Subscriptions table schema is outdated. Run 'npx prisma db push' then redeploy.";
  }
  if (error.code === "P2022") {
    return "Subscription columns are missing. Run 'npx prisma db push' then redeploy.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL.";
  }
  return error.message || "Subscription service error.";
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are missing.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to get PayPal access token.");
  }
  return data.access_token;
}

async function fetchPayPalSubscription(subscriptionId) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v1/billing/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const detail =
      (Array.isArray(data.details) && data.details[0] && data.details[0].description) || data.message;
    throw new Error(detail || "Failed to fetch PayPal subscription details.");
  }
  return data;
}

async function getOrCreateUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Missing email.");
  }

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

async function syncPayPalSubscription(subscription) {
  if (!subscription.gatewaySubscriptionId) return subscription;

  const details = await fetchPayPalSubscription(subscription.gatewaySubscriptionId);
  const mappedStatus = mapPayPalStatusToLocal(details.status);
  const nextBillingAt = parseDate(
    details.billing_info && details.billing_info.next_billing_time,
    subscription.nextBillingAt || subscription.expiresAt
  );

  const updated = await getPrisma().subscription.update({
    where: { id: subscription.id },
    data: {
      status: mappedStatus,
      nextBillingAt,
      expiresAt: nextBillingAt,
    },
  });

  return updated;
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
    console.error("Subscription API Error:", error);
    return res.status(500).json({
      error: "Server error",
      hint: getErrorHint(error),
      code: error.code || null,
    });
  }
};

// GET /api/subscription?email=user@example.com
async function handleGet(req, res) {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: "Missing email parameter" });
  }

  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    return res.status(200).json({ success: true, subscription: null });
  }

  const now = new Date();
  let subscription = await getPrisma().subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      OR: [{ expiresAt: { gt: now } }, { gateway: "PAYPAL" }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return res.status(200).json({ success: true, subscription: null });
  }

  if (subscription.gateway === "PAYPAL" && subscription.gatewaySubscriptionId) {
    try {
      subscription = await syncPayPalSubscription(subscription);
    } catch (err) {
      console.error("Could not sync PayPal subscription status:", err);
    }
  }

  if (subscription.status !== "active") {
    return res.status(200).json({ success: true, subscription: null });
  }

  return res.status(200).json({ success: true, subscription });
}

// POST /api/subscription
async function handlePost(req, res) {
  const { action } = req.body || {};
  if (action === "activate_paypal") {
    return await handleActivatePayPal(req, res);
  }
  return await handleCreateInternal(req, res);
}

async function handleActivatePayPal(req, res) {
  const { email, plan, paypalSubscriptionId } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !plan || !paypalSubscriptionId) {
    return res.status(400).json({
      error: "Missing required fields: email, plan, paypalSubscriptionId",
    });
  }

  if (!["monthly", "annual"].includes(plan)) {
    return res.status(400).json({ error: "Invalid plan. Must be 'monthly' or 'annual'" });
  }

  const user = await getOrCreateUserByEmail(normalizedEmail);
  const details = await fetchPayPalSubscription(paypalSubscriptionId);
  const localStatus = mapPayPalStatusToLocal(details.status);

  const configuredPlanId = getPayPalPlanId(plan);
  if (configuredPlanId && details.plan_id && configuredPlanId !== details.plan_id) {
    return res.status(400).json({
      error: "PayPal plan mismatch for selected billing cycle.",
      expectedPlanId: configuredPlanId,
      receivedPlanId: details.plan_id,
    });
  }

  if (["canceled", "suspended", "expired"].includes(localStatus)) {
    return res.status(400).json({
      error: `PayPal subscription is ${localStatus}.`,
      status: details.status || null,
    });
  }

  const now = new Date();
  const startedAt = parseDate(details.start_time, now);
  const nextBillingAt = parseDate(
    details.billing_info && details.billing_info.next_billing_time,
    addPlanInterval(now, plan)
  );

  await getPrisma().subscription.updateMany({
    where: {
      userId: user.id,
      status: "active",
      gatewaySubscriptionId: { not: paypalSubscriptionId },
    },
    data: {
      status: "canceled",
    },
  });

  const subscription = await getPrisma().subscription.upsert({
    where: { gatewaySubscriptionId: paypalSubscriptionId },
    update: {
      plan,
      status: localStatus === "pending" ? "active" : localStatus,
      gateway: "PAYPAL",
      startedAt,
      nextBillingAt,
      expiresAt: nextBillingAt,
    },
    create: {
      userId: user.id,
      plan,
      status: localStatus === "pending" ? "active" : localStatus,
      gateway: "PAYPAL",
      gatewaySubscriptionId: paypalSubscriptionId,
      startedAt,
      nextBillingAt,
      expiresAt: nextBillingAt,
    },
  });

  return res.status(200).json({
    success: true,
    subscription,
    paypalStatus: details.status || null,
  });
}

async function handleCreateInternal(req, res) {
  const { email, plan } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !plan) {
    return res.status(400).json({ error: "Missing required fields: email, plan" });
  }

  if (!["monthly", "annual"].includes(plan)) {
    return res.status(400).json({ error: "Invalid plan. Must be 'monthly' or 'annual'" });
  }

  const user = await getOrCreateUserByEmail(normalizedEmail);

  const existing = await getPrisma().subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return res
      .status(200)
      .json({ success: true, subscription: existing, message: "Already subscribed" });
  }

  const now = new Date();
  const expiresAt = addPlanInterval(now, plan);

  const subscription = await getPrisma().subscription.create({
    data: {
      userId: user.id,
      plan,
      status: "active",
      gateway: "INTERNAL",
      startedAt: now,
      expiresAt,
      nextBillingAt: expiresAt,
    },
  });

  return res.status(201).json({ success: true, subscription });
}
