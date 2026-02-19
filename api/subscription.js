const { PrismaClient } = require("@prisma/client");
const {
  getPlanFeatures,
  getTierRank,
  resolveTierFromSubscriptions,
  getTierFromPlan,
  getUtcDayStart,
  getUtcWeekStart,
} = require("./_plans");
const { sendSubscriptionStatusEmail } = require("./_mail");

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

function getPayPalPlanId(tier, billingCycle) {
  const safeTier = String(tier || "personal").trim().toLowerCase();
  const safeCycle = String(billingCycle || "monthly").trim().toLowerCase();

  if (safeTier === "business") {
    if (safeCycle === "annual") {
      return normalizePlanId(process.env.PAYPAL_PLAN_ID_BUSINESS_ANNUAL);
    }
    return normalizePlanId(process.env.PAYPAL_PLAN_ID_BUSINESS_MONTHLY);
  }

  if (safeCycle === "annual") {
    return normalizePlanId(process.env.PAYPAL_PLAN_ID_PERSONAL_ANNUAL || process.env.PAYPAL_PLAN_ID_ANNUAL);
  }

  return normalizePlanId(process.env.PAYPAL_PLAN_ID_PERSONAL_MONTHLY || process.env.PAYPAL_PLAN_ID_MONTHLY);
}

function addMonths(dateInput, months) {
  const date = new Date(dateInput);
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addPlanInterval(date, billingCycle) {
  if (String(billingCycle).toLowerCase() === "annual") {
    return addMonths(date, 12);
  }
  return addMonths(date, 1);
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
    return "Subscriptions/referrals table schema is outdated. Run 'npx prisma db push' then redeploy.";
  }
  if (error.code === "P2022") {
    return "Subscription/referral columns are missing. Run 'npx prisma db push' then redeploy.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL.";
  }
  return error.message || "Subscription service error.";
}

function normalizeBillingCycle(input) {
  const value = String(input || "monthly").trim().toLowerCase();
  return value === "annual" ? "annual" : "monthly";
}

function normalizeTier(input) {
  const value = String(input || "personal").trim().toLowerCase();
  if (value === "business") return "business";
  if (value === "free") return "free";
  return "personal";
}

function parsePlanInput(planRaw, tierRaw, billingCycleRaw) {
  const explicitTier = normalizeTier(tierRaw);
  const explicitBilling = normalizeBillingCycle(billingCycleRaw);
  const plan = String(planRaw || "").trim().toLowerCase();

  if (plan === "monthly" || plan === "annual") {
    return { tier: explicitTier === "free" ? "personal" : explicitTier, billingCycle: plan };
  }

  if (plan.includes("_")) {
    const [tierPart, cyclePart] = plan.split("_");
    return {
      tier: normalizeTier(tierPart),
      billingCycle: normalizeBillingCycle(cyclePart),
    };
  }

  if (["free", "personal", "business"].includes(plan)) {
    return {
      tier: normalizeTier(plan),
      billingCycle: explicitBilling,
    };
  }

  return {
    tier: explicitTier,
    billingCycle: explicitBilling,
  };
}

function parsePlanForEmail(planValue) {
  const raw = String(planValue || "").trim().toLowerCase();
  const [tierPart, cyclePart] = raw.split("_");
  const tier = normalizeTier(tierPart || raw);
  const billingCycle = normalizeBillingCycle(cyclePart || "monthly");
  return { tier, billingCycle };
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

async function getCurrentActiveSubscriptions(userId) {
  const now = new Date();
  return getPrisma().subscription.findMany({
    where: {
      userId,
      status: "active",
      startedAt: { lte: now },
      OR: [{ expiresAt: { gt: now } }, { gateway: "PAYPAL" }],
    },
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
  });
}

async function countOrderUsage(userId) {
  const now = new Date();
  const dayStart = getUtcDayStart(now);
  const weekStart = getUtcWeekStart(now);

  const [ordersToday, ordersThisWeek] = await Promise.all([
    getPrisma().order.count({
      where: {
        userId,
        createdAt: {
          gte: dayStart,
        },
      },
    }),
    getPrisma().order.count({
      where: {
        userId,
        createdAt: {
          gte: weekStart,
        },
      },
    }),
  ]);

  return { ordersToday, ordersThisWeek };
}

async function buildPlanStateForUser(userId) {
  let subscriptions = await getCurrentActiveSubscriptions(userId);

  const paypalSubs = subscriptions.filter(
    (subscription) => subscription.gateway === "PAYPAL" && subscription.gatewaySubscriptionId
  );

  if (paypalSubs.length > 0) {
    for (const subscription of paypalSubs) {
      try {
        await syncPayPalSubscription(subscription);
      } catch (error) {
        console.error("Could not sync PayPal subscription status:", error);
      }
    }
    subscriptions = await getCurrentActiveSubscriptions(userId);
  }

  const resolved = resolveTierFromSubscriptions(subscriptions);
  const planFeatures = getPlanFeatures(resolved.tier);

  let selectedSubscription = null;
  for (const subscription of subscriptions) {
    if (!selectedSubscription) {
      selectedSubscription = subscription;
      continue;
    }

    const currentTier = getTierFromPlan(selectedSubscription.plan);
    const nextTier = getTierFromPlan(subscription.plan);

    if (getTierRank(nextTier) > getTierRank(currentTier)) {
      selectedSubscription = subscription;
      continue;
    }

    if (
      getTierRank(nextTier) === getTierRank(currentTier) &&
      new Date(subscription.expiresAt).getTime() > new Date(selectedSubscription.expiresAt).getTime()
    ) {
      selectedSubscription = subscription;
    }
  }

  const usage = await countOrderUsage(userId);

  return {
    tier: resolved.tier,
    subscription: selectedSubscription,
    planFeatures,
    usage,
  };
}

async function getUserAccessEnd(tx, userId, now) {
  const existing = await tx.subscription.findFirst({
    where: {
      userId,
      status: "active",
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
  });

  if (!existing) return now;
  return new Date(existing.expiresAt) > now ? new Date(existing.expiresAt) : now;
}

async function createReferralBonusSubscription(tx, userId, now) {
  const startsAt = await getUserAccessEnd(tx, userId, now);
  const expiresAt = addMonths(startsAt, 1);

  return tx.subscription.create({
    data: {
      userId,
      plan: "personal_referral_bonus",
      status: "active",
      gateway: "REFERRAL",
      startedAt: startsAt,
      expiresAt,
      nextBillingAt: expiresAt,
    },
  });
}

async function applyReferralReward(tx, inviteeUser, now) {
  const invite = await tx.referralInvite.findFirst({
    where: {
      inviteeEmail: inviteeUser.email,
      status: { in: ["PENDING", "REGISTERED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!invite) {
    return null;
  }

  await createReferralBonusSubscription(tx, invite.referrerUserId, now);
  await createReferralBonusSubscription(tx, inviteeUser.id, now);

  const updatedInvite = await tx.referralInvite.update({
    where: { id: invite.id },
    data: {
      inviteeUserId: inviteeUser.id,
      status: "REWARDED",
      rewardedAt: now,
    },
  });

  return {
    inviteId: updatedInvite.id,
    referrerUserId: updatedInvite.referrerUserId,
    inviteeUserId: updatedInvite.inviteeUserId,
    rewardedAt: updatedInvite.rewardedAt,
  };
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

async function handleGet(req, res) {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: "Missing email parameter" });
  }

  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    const freeFeatures = getPlanFeatures("free");
    return res.status(200).json({
      success: true,
      subscription: null,
      tier: "free",
      planFeatures: freeFeatures,
      usage: { ordersToday: 0, ordersThisWeek: 0 },
    });
  }

  const planState = await buildPlanStateForUser(user.id);

  return res.status(200).json({
    success: true,
    subscription: planState.subscription,
    tier: planState.tier,
    planFeatures: planState.planFeatures,
    usage: planState.usage,
  });
}

async function handlePost(req, res) {
  const { action } = req.body || {};
  if (action === "activate_paypal") {
    return await handleActivatePayPal(req, res);
  }
  if (action === "cancel_subscription") {
    return await handleCancelSubscription(req, res);
  }
  return await handleCreateInternal(req, res);
}

async function handleCancelSubscription(req, res) {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: "Missing required field: email" });
  }

  const user = await getPrisma().user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const current = await getPrisma().subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      startedAt: { lte: new Date() },
      OR: [{ expiresAt: { gt: new Date() } }, { gateway: "PAYPAL" }],
    },
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
  });

  if (!current) {
    return res.status(200).json({ success: true, canceled: null, message: "No active subscription." });
  }

  const canceled = await getPrisma().subscription.update({
    where: { id: current.id },
    data: {
      status: "canceled",
      expiresAt: new Date(),
      nextBillingAt: null,
    },
  });

  try {
    const plan = parsePlanForEmail(canceled.plan);
    await sendSubscriptionStatusEmail({
      toEmail: user.email,
      toName: user.name,
      eventType: "canceled",
      planName: canceled.plan,
      billingCycle: plan.billingCycle,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
    });
  } catch (error) {
    console.error("Subscription cancel email failed:", error);
  }

  return res.status(200).json({ success: true, canceled });
}

async function handleActivatePayPal(req, res) {
  const { email, plan, paypalSubscriptionId, tier, billingCycle } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !paypalSubscriptionId) {
    return res.status(400).json({
      error: "Missing required fields: email, paypalSubscriptionId",
    });
  }

  const parsed = parsePlanInput(plan, tier, billingCycle);
  if (!["personal", "business"].includes(parsed.tier)) {
    return res.status(400).json({ error: "Invalid tier for PayPal activation." });
  }

  const configuredPlanId = getPayPalPlanId(parsed.tier, parsed.billingCycle);
  if (!configuredPlanId) {
    return res.status(400).json({
      error: `PayPal plan ID missing for ${parsed.tier} ${parsed.billingCycle}.`,
      hint: `Set PAYPAL_PLAN_ID_${parsed.tier.toUpperCase()}_${parsed.billingCycle.toUpperCase()} (or legacy PERSONAL fallback).`,
    });
  }

  const user = await getOrCreateUserByEmail(normalizedEmail);
  const details = await fetchPayPalSubscription(paypalSubscriptionId);
  const localStatus = mapPayPalStatusToLocal(details.status);

  if (details.plan_id && configuredPlanId !== details.plan_id) {
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
    addPlanInterval(now, parsed.billingCycle)
  );

  const planName = `${parsed.tier}_${parsed.billingCycle}`;

  const result = await getPrisma().$transaction(async (tx) => {
    const previousActive = await tx.subscription.findMany({
      where: {
        userId: user.id,
        status: "active",
        gatewaySubscriptionId: { not: paypalSubscriptionId },
      },
      orderBy: { createdAt: "desc" },
    });

    await tx.subscription.updateMany({
      where: {
        userId: user.id,
        status: "active",
        gatewaySubscriptionId: { not: paypalSubscriptionId },
      },
      data: {
        status: "canceled",
      },
    });

    const subscription = await tx.subscription.upsert({
      where: { gatewaySubscriptionId: paypalSubscriptionId },
      update: {
        plan: planName,
        status: localStatus === "pending" ? "active" : localStatus,
        gateway: "PAYPAL",
        startedAt,
        nextBillingAt,
        expiresAt: nextBillingAt,
      },
      create: {
        userId: user.id,
        plan: planName,
        status: localStatus === "pending" ? "active" : localStatus,
        gateway: "PAYPAL",
        gatewaySubscriptionId: paypalSubscriptionId,
        startedAt,
        nextBillingAt,
        expiresAt: nextBillingAt,
      },
    });

    let referralReward = null;
    if (subscription.status === "active") {
      try {
        referralReward = await applyReferralReward(tx, user, now);
      } catch (error) {
        if (error.code === "P2021" || error.code === "P2022") {
          referralReward = null;
        } else {
          throw error;
        }
      }
    }

    return { subscription, referralReward, previousActive };
  });

  try {
    await sendSubscriptionStatusEmail({
      toEmail: user.email,
      toName: user.name,
      eventType: "activated",
      planName: result.subscription.plan,
      billingCycle: parsed.billingCycle,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
    });
  } catch (error) {
    console.error("Subscription activation email failed:", error);
  }

  for (const canceled of result.previousActive || []) {
    try {
      const canceledPlan = parsePlanForEmail(canceled.plan);
      await sendSubscriptionStatusEmail({
        toEmail: user.email,
        toName: user.name,
        eventType: "canceled",
        planName: canceled.plan,
        billingCycle: canceledPlan.billingCycle,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
      });
    } catch (error) {
      console.error("Subscription cancellation email failed:", error);
    }
  }

  return res.status(200).json({
    success: true,
    subscription: result.subscription,
    referralReward: result.referralReward,
    paypalStatus: details.status || null,
  });
}

async function handleCreateInternal(req, res) {
  const { email, plan, tier, billingCycle } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return res.status(400).json({ error: "Missing required field: email" });
  }

  const parsed = parsePlanInput(plan, tier, billingCycle);
  if (!["personal", "business"].includes(parsed.tier)) {
    return res.status(400).json({
      error: "Invalid plan. Allowed internal plans: personal/business with monthly/annual cycle.",
    });
  }

  const user = await getOrCreateUserByEmail(normalizedEmail);

  const existing = await getPrisma().subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      startedAt: { lte: new Date() },
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
  const expiresAt = addPlanInterval(now, parsed.billingCycle);

  const subscription = await getPrisma().subscription.create({
    data: {
      userId: user.id,
      plan: `${parsed.tier}_${parsed.billingCycle}`,
      status: "active",
      gateway: "INTERNAL",
      startedAt: now,
      expiresAt,
      nextBillingAt: expiresAt,
    },
  });

  try {
    await sendSubscriptionStatusEmail({
      toEmail: user.email,
      toName: user.name,
      eventType: "activated",
      planName: subscription.plan,
      billingCycle: parsed.billingCycle,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
    });
  } catch (error) {
    console.error("Internal subscription activation email failed:", error);
  }

  return res.status(201).json({ success: true, subscription });
}
