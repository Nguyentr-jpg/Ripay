const { PrismaClient } = require("@prisma/client");
const {
  getPlanFeatures,
  getTierFromPlan,
  getTierRank,
  getUtcDayStart,
  getUtcWeekStart,
} = require("./_plans");
const { sendOrderCreatedEmail } = require("./_mail");

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
  const msg = error.message || "";
  if (msg.includes("Error validating datasource") || msg.includes("DATABASE_URL")) {
    return "DATABASE_URL is missing or invalid. Set it in Vercel → Settings → Environment Variables.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL env var on Vercel.";
  }
  if (error.code === "P2021") {
    return "Table does not exist. Run 'npx prisma db push' against your database.";
  }
  if (error.code === "P1000") {
    return "Authentication failed. Check your DATABASE_URL credentials.";
  }
  return "Database connection failed. Check your Vercel environment variables.";
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function resolveUserPlanState(userId) {
  const now = new Date();
  let subscriptions = [];
  try {
    subscriptions = await getPrisma().subscription.findMany({
      where: {
        userId,
        status: "active",
        startedAt: { lte: now },
        OR: [{ expiresAt: { gt: now } }, { gateway: "PAYPAL" }],
      },
      orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
    });
  } catch (error) {
    if (error.code !== "P2021" && error.code !== "P2022") {
      throw error;
    }
  }

  let tier = "free";
  for (const subscription of subscriptions) {
    const nextTier = getTierFromPlan(subscription.plan);
    if (getTierRank(nextTier) > getTierRank(tier)) {
      tier = nextTier;
    }
  }

  const dayStart = getUtcDayStart(now);
  const weekStart = getUtcWeekStart(now);

  const [ordersToday, ordersThisWeek] = await Promise.all([
    getPrisma().order.count({
      where: {
        userId,
        createdAt: { gte: dayStart },
      },
    }),
    getPrisma().order.count({
      where: {
        userId,
        createdAt: { gte: weekStart },
      },
    }),
  ]);

  return {
    tier,
    planFeatures: getPlanFeatures(tier),
    usage: { ordersToday, ordersThisWeek },
  };
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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
    if (req.method === "PUT") {
      return await handlePut(req, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(req, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API Error:", error);
    const hint = getErrorHint(error);
    return res.status(500).json({
      error: "Database connection error",
      hint,
      code: error.code,
    });
  }
};

async function handleGet(req, res) {
  const userEmail = normalizeEmail(req.query.userEmail);

  const where = {};
  let planState = null;

  if (userEmail) {
    const user = await getPrisma().user.findUnique({ where: { email: userEmail } });
    if (!user) {
      return res.status(200).json({ success: true, orders: [] });
    }
    where.userId = user.id;

    planState = await resolveUserPlanState(user.id);
    const retentionHours = Number(planState.planFeatures && planState.planFeatures.retentionHours);
    if (Number.isFinite(retentionHours) && retentionHours > 0) {
      where.createdAt = {
        gte: new Date(Date.now() - retentionHours * 60 * 60 * 1000),
      };
    }
  }

  const orders = await getPrisma().order.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return res.status(200).json({
    success: true,
    orders,
    tier: planState ? planState.tier : null,
    planFeatures: planState ? planState.planFeatures : null,
  });
}

async function handlePost(req, res) {
  const { orderName, totalCount, totalAmount, clientId, clientName, userEmail, items, clientEmail } = req.body;

  if (!orderName || totalCount == null || totalAmount == null) {
    return res.status(400).json({
      error: "Missing required fields: orderName, totalCount, totalAmount",
    });
  }

  if (!userEmail) {
    return res.status(400).json({ error: "Missing required field: userEmail" });
  }

  // Find or create user by email
  let user = await getPrisma().user.findUnique({ where: { email: userEmail } });
  if (!user) {
    user = await getPrisma().user.create({
      data: {
        email: userEmail,
        name: userEmail.split("@")[0],
      },
    });
  }

  const planState = await resolveUserPlanState(user.id);
  const features = planState.planFeatures;

  if (
    planState.tier === "free" &&
    Number.isFinite(features.dailyOrderLimit) &&
    planState.usage.ordersToday >= features.dailyOrderLimit
  ) {
    return res.status(403).json({
      error: `Free plan limit reached: max ${features.dailyOrderLimit} orders per day.`,
      code: "FREE_PLAN_DAILY_LIMIT",
      tier: planState.tier,
      usage: planState.usage,
      planFeatures: features,
    });
  }

  if (
    planState.tier === "free" &&
    Number.isFinite(features.weeklyOrderLimit) &&
    planState.usage.ordersThisWeek >= features.weeklyOrderLimit
  ) {
    return res.status(403).json({
      error: `Free plan limit reached: max ${features.weeklyOrderLimit} orders per week.`,
      code: "FREE_PLAN_WEEKLY_LIMIT",
      tier: planState.tier,
      usage: planState.usage,
      planFeatures: features,
    });
  }

  // Generate unique order number
  const orderNumber = `ORD-${Date.now()}`;

  // Create order with items in a transaction
  const order = await getPrisma().order.create({
    data: {
      orderNumber,
      orderName,
      totalCount: Number(totalCount),
      totalAmount: String(Number(totalAmount).toFixed(2)),
      status: "UNPAID",
      clientId: clientId || `CLI-${Math.floor(Math.random() * 90000 + 10000)}`,
      clientName: clientName || clientEmail || userEmail,
      userId: user.id,
      items: items && items.length > 0
        ? {
            create: items.map((item) => ({
              type: item.type || "",
              count: Number(item.count || 0),
              unitPrice: String(Number(item.unitPrice || 0).toFixed(2)),
              subtotal: String((Number(item.count || 0) * Number(item.unitPrice || 0)).toFixed(2)),
              sourceLink: item.link || null,
            })),
          }
        : undefined,
    },
    include: { items: true },
  });

  const buyerEmail = normalizeEmail(clientEmail || clientName);
  const canSendBuyerOrderEmail = ["personal", "business"].includes(planState.tier);
  if (canSendBuyerOrderEmail && buyerEmail && isValidEmail(buyerEmail)) {
    try {
      await sendOrderCreatedEmail({
        toEmail: buyerEmail,
        toName: buyerEmail.split("@")[0],
        sellerName: user.name || user.email,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        totalAmount: order.totalAmount,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
      });
    } catch (error) {
      console.error("Order created email send failed:", error);
    }
  }

  return res.status(201).json({ success: true, order });
}

async function handlePut(req, res) {
  const { orderNumber, status, paidAt } = req.body;

  if (!orderNumber) {
    return res.status(400).json({ error: "Missing required field: orderNumber" });
  }

  const order = await getPrisma().order.findUnique({ where: { orderNumber } });
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  const updateData = {};
  if (status) updateData.status = status.toUpperCase();
  if (paidAt) updateData.paidAt = new Date(paidAt);

  const updated = await getPrisma().order.update({
    where: { orderNumber },
    data: updateData,
    include: { items: true },
  });

  return res.status(200).json({ success: true, order: updated });
}

async function handleDelete(req, res) {
  const { orderNumber } = req.body;

  if (!orderNumber) {
    return res.status(400).json({ error: "Missing required field: orderNumber" });
  }

  const order = await getPrisma().order.findUnique({ where: { orderNumber } });
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  await getPrisma().order.delete({ where: { orderNumber } });

  return res.status(200).json({ success: true, deleted: orderNumber });
}
