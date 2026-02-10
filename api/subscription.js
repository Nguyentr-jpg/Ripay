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
    return res.status(500).json({ error: "Server error", hint: error.message });
  }
};

// GET /api/subscription?email=user@example.com
async function handleGet(req, res) {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: "Missing email parameter" });
  }

  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    return res.status(200).json({ success: true, subscription: null });
  }

  const subscription = await getPrisma().subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
  });

  return res.status(200).json({ success: true, subscription });
}

// POST /api/subscription { email, plan }
async function handlePost(req, res) {
  const { email, plan } = req.body;

  if (!email || !plan) {
    return res.status(400).json({ error: "Missing required fields: email, plan" });
  }

  if (!["monthly", "annual"].includes(plan)) {
    return res.status(400).json({ error: "Invalid plan. Must be 'monthly' or 'annual'" });
  }

  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Check if user already has an active subscription
  const existing = await getPrisma().subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      expiresAt: { gt: new Date() },
    },
  });

  if (existing) {
    return res.status(200).json({ success: true, subscription: existing, message: "Already subscribed" });
  }

  // Calculate expiry
  const now = new Date();
  const expiresAt = new Date(now);
  if (plan === "monthly") {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  const subscription = await getPrisma().subscription.create({
    data: {
      userId: user.id,
      plan,
      status: "active",
      startedAt: now,
      expiresAt,
    },
  });

  return res.status(201).json({ success: true, subscription });
}
