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

function formatPlanLabel(plan) {
  const value = String(plan || "").trim().toLowerCase();
  if (!value) return "Plan";
  const [tier, cycle] = value.split("_");
  const tierLabel = String(tier || "plan").replace(/\b\w/g, (char) => char.toUpperCase());
  const cycleLabel = cycle ? ` (${cycle})` : "";
  return `${tierLabel}${cycleLabel}`;
}

function toDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = normalizeEmail(req.query.email);
    if (!email) {
      return res.status(400).json({ error: "Missing email parameter" });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(200).json({ success: true, notifications: [] });
    }

    const [subscriptions, sellerOrders, buyerOrders, referralsSent, referralsReceived] = await Promise.all([
      db.subscription.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.order.findMany({
        where: {
          clientName: email,
          userId: { not: user.id },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.referralInvite.findMany({
        where: { referrerUserId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.referralInvite.findMany({
        where: { inviteeEmail: email },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    const notifications = [];

    for (const sub of subscriptions) {
      const createdAt = toDate(sub.createdAt) || new Date();
      const status = String(sub.status || "").toLowerCase();
      const isCanceled = ["canceled", "expired", "suspended"].includes(status);
      notifications.push({
        id: `sub-${sub.id}-${status}`,
        type: "subscription",
        title: isCanceled ? "Subscription canceled" : "Subscription updated",
        message: `${formatPlanLabel(sub.plan)} • status: ${status || "unknown"}`,
        createdAt: createdAt.toISOString(),
      });
    }

    for (const order of sellerOrders) {
      const createdAt = toDate(order.createdAt) || new Date();
      notifications.push({
        id: `order-created-${order.id}`,
        type: "order_created",
        title: "Order created",
        message: `${order.orderNumber} • ${order.orderName}`,
        createdAt: createdAt.toISOString(),
      });
      if (String(order.status || "").toUpperCase() === "PAID" && order.paidAt) {
        const paidAt = toDate(order.paidAt) || createdAt;
        notifications.push({
          id: `order-paid-${order.id}`,
          type: "order_paid",
          title: "Order paid",
          message: `${order.orderNumber} • $${Number(order.totalAmount || 0).toFixed(2)}`,
          createdAt: paidAt.toISOString(),
        });
      }
    }

    for (const order of buyerOrders) {
      const createdAt = toDate(order.createdAt) || new Date();
      notifications.push({
        id: `buyer-order-${order.id}`,
        type: "buyer_order",
        title: "New order for you",
        message: `${order.orderNumber} • ${order.orderName}`,
        createdAt: createdAt.toISOString(),
      });
    }

    for (const invite of referralsSent) {
      const createdAt = toDate(invite.createdAt) || new Date();
      notifications.push({
        id: `ref-sent-${invite.id}`,
        type: "referral",
        title: "Referral invite sent",
        message: `${invite.inviteeEmail} • ${String(invite.status || "").toLowerCase()}`,
        createdAt: createdAt.toISOString(),
      });
    }

    for (const invite of referralsReceived) {
      const createdAt = toDate(invite.createdAt) || new Date();
      notifications.push({
        id: `ref-received-${invite.id}`,
        type: "referral",
        title: "You were invited",
        message: `${invite.inviteeEmail} • ${String(invite.status || "").toLowerCase()}`,
        createdAt: createdAt.toISOString(),
      });
    }

    notifications.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return res.status(200).json({
      success: true,
      notifications: notifications.slice(0, 100),
    });
  } catch (error) {
    console.error("Notifications API Error:", error);
    return res.status(500).json({
      error: "Notifications service error",
      hint: error.message || "Unknown server error",
    });
  }
};
