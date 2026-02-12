const { PrismaClient } = require("@prisma/client");

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
  if (error.code === "P2021") {
    return "Wallet tables do not exist yet. Run 'npx prisma db push' and redeploy.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL in Vercel.";
  }
  if (error.code === "P1000") {
    return "Database authentication failed. Check DATABASE_URL credentials.";
  }
  if (error.code === "P1008") {
    return "Database request timeout. Retry and check database load.";
  }
  return error.message || "Wallet service unavailable.";
}

function toMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

async function getOrCreateUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Missing or invalid email");
  }

  const db = getPrisma();
  let user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0],
      },
    });
  }
  return user;
}

async function getOrCreateWallet(tx, userId) {
  return tx.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, currency: "USD", balance: "0.00" },
  });
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
    console.error("Wallet API Error:", error);
    return res.status(500).json({
      error: "Wallet service error",
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

  const user = await getOrCreateUser(email);

  const wallet = await getPrisma().wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, currency: "USD", balance: "0.00" },
  });

  const ledger = await getPrisma().walletLedger.findMany({
    where: { walletId: wallet.id },
    include: {
      order: {
        select: {
          orderNumber: true,
          orderName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return res.status(200).json({
    success: true,
    wallet: {
      id: wallet.id,
      currency: wallet.currency,
      balance: toMoney(wallet.balance),
      leafBalance: toMoney(wallet.balance),
    },
    ledger: ledger.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: toMoney(entry.amount),
      balanceAfter: toMoney(entry.balanceAfter),
      currency: entry.currency,
      description: entry.description,
      reference: entry.reference,
      createdAt: entry.createdAt,
      order: entry.order || null,
    })),
  });
}

async function handlePost(req, res) {
  const { action } = req.body || {};

  if (action === "topup") {
    return await handleTopup(req, res);
  }

  if (action === "pay_orders") {
    return await handlePayOrders(req, res);
  }

  return res.status(400).json({ error: "Invalid action. Use 'topup' or 'pay_orders'." });
}

async function handleTopup(req, res) {
  const { email, amount, reference } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const topupAmount = toMoney(amount);

  if (!normalizedEmail) {
    return res.status(400).json({ error: "Missing required field: email" });
  }
  if (topupAmount <= 0) {
    return res.status(400).json({ error: "Top-up amount must be greater than 0" });
  }

  const user = await getOrCreateUser(normalizedEmail);

  const result = await getPrisma().$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, user.id);
    const currentBalance = toMoney(wallet.balance);
    const balanceAfter = toMoney(currentBalance + topupAmount);

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter.toFixed(2),
      },
    });

    const ledger = await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: "TOPUP",
        amount: topupAmount.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        currency: "USD",
        description: `Leaf top-up (+${topupAmount.toFixed(2)} Leaf)`,
        reference:
          typeof reference === "string" && reference.trim()
            ? reference.trim()
            : `LEAF-TOPUP-${Date.now()}`,
      },
    });

    return { wallet: updatedWallet, ledger };
  });

  return res.status(200).json({
    success: true,
    wallet: {
      id: result.wallet.id,
      currency: result.wallet.currency,
      balance: toMoney(result.wallet.balance),
      leafBalance: toMoney(result.wallet.balance),
    },
    ledgerEntry: {
      id: result.ledger.id,
      type: result.ledger.type,
      amount: toMoney(result.ledger.amount),
      balanceAfter: toMoney(result.ledger.balanceAfter),
      reference: result.ledger.reference,
      createdAt: result.ledger.createdAt,
    },
  });
}

async function handlePayOrders(req, res) {
  const { email, orderNumbers } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const orderList = Array.isArray(orderNumbers)
    ? Array.from(new Set(orderNumbers.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];

  if (!normalizedEmail) {
    return res.status(400).json({ error: "Missing required field: email" });
  }
  if (!orderList.length) {
    return res.status(400).json({ error: "Missing required field: orderNumbers" });
  }

  const user = await getPrisma().user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const now = new Date();

  const result = await getPrisma().$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, user.id);
    const walletBalance = toMoney(wallet.balance);

    const orders = await tx.order.findMany({
      where: {
        userId: user.id,
        orderNumber: { in: orderList },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!orders.length) {
      return { error: "No matching orders found" };
    }

    const unpaidOrders = orders.filter((order) => order.status === "UNPAID");
    if (!unpaidOrders.length) {
      return {
        walletBalance,
        totalAmount: 0,
        paidOrders: [],
        message: "All selected orders are already paid.",
      };
    }

    const totalAmount = unpaidOrders.reduce((sum, order) => sum + toMoney(order.totalAmount), 0);
    if (walletBalance < totalAmount) {
      return {
        error: "INSUFFICIENT_BALANCE",
        walletBalance,
        totalAmount,
      };
    }

    const balanceAfter = toMoney(walletBalance - totalAmount);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter.toFixed(2),
      },
    });

    const paidOrders = [];
    let runningBalance = walletBalance;

    for (const order of unpaidOrders) {
      const amount = toMoney(order.totalAmount);
      runningBalance = toMoney(runningBalance - amount);

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAt: now,
        },
      });

      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          userId: user.id,
          orderId: order.id,
          type: "ORDER_PAYMENT",
          amount: (-amount).toFixed(2),
          balanceAfter: runningBalance.toFixed(2),
          currency: "USD",
          description: `Paid order ${order.orderNumber} with Leaf`,
          reference: `LEAF-ORDER-${order.orderNumber}`,
        },
      });

      paidOrders.push({
        id: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        orderName: updatedOrder.orderName,
        amount,
        paidAt: updatedOrder.paidAt,
      });
    }

    return {
      walletBalance: balanceAfter,
      totalAmount,
      paidOrders,
    };
  });

  if (result.error === "No matching orders found") {
    return res.status(404).json({ error: result.error });
  }

  if (result.error === "INSUFFICIENT_BALANCE") {
    return res.status(400).json({
      error: "Insufficient Leaf balance",
      code: "INSUFFICIENT_BALANCE",
      walletBalance: toMoney(result.walletBalance),
      totalAmount: toMoney(result.totalAmount),
      missingAmount: toMoney(result.totalAmount - result.walletBalance),
    });
  }

  return res.status(200).json({
    success: true,
    totalAmount: toMoney(result.totalAmount),
    paidOrders: result.paidOrders || [],
    wallet: {
      leafBalance: toMoney(result.walletBalance),
    },
    message: result.message || null,
  });
}
