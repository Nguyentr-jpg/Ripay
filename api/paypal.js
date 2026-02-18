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

function getPayPalClientId() {
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "";
}

function normalizePlanId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("P-") ? raw : `P-${raw}`;
}

function getPayPalPlanIds() {
  const personalMonthly = normalizePlanId(
    process.env.PAYPAL_PLAN_ID_PERSONAL_MONTHLY || process.env.PAYPAL_PLAN_ID_MONTHLY
  );
  const personalAnnual = normalizePlanId(
    process.env.PAYPAL_PLAN_ID_PERSONAL_ANNUAL || process.env.PAYPAL_PLAN_ID_ANNUAL
  );
  const businessMonthly = normalizePlanId(process.env.PAYPAL_PLAN_ID_BUSINESS_MONTHLY);
  const businessAnnual = normalizePlanId(process.env.PAYPAL_PLAN_ID_BUSINESS_ANNUAL);

  return {
    monthly: personalMonthly,
    annual: personalAnnual,
    personal: {
      monthly: personalMonthly,
      annual: personalAnnual,
    },
    business: {
      monthly: businessMonthly,
      annual: businessAnnual,
    },
  };
}

function getPayPalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function toMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function getErrorHint(error) {
  if (error && error.code === "P2021") {
    return "Wallet tables are missing. Run 'npx prisma db push' and redeploy.";
  }
  if (error && error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL on Vercel.";
  }
  return error && error.message ? error.message : "Unknown server error";
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

async function getOrCreateUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Missing email");
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

async function creditLeafFromCapture({ email, captureId, orderId, amount, currency }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Missing email");
  }

  const topupAmount = toMoney(amount);
  if (topupAmount <= 0) {
    throw new Error("Invalid top-up amount from capture.");
  }

  const reference = `PAYPAL-CAPTURE-${captureId}`;
  const user = await getOrCreateUser(normalizedEmail);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.walletLedger.findFirst({
      where: {
        userId: user.id,
        reference,
      },
    });

    const wallet = await tx.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, currency: currency || "USD", balance: "0.00" },
    });

    if (existing) {
      return {
        alreadyCredited: true,
        leafBalance: toMoney(wallet.balance),
      };
    }

    const currentBalance = toMoney(wallet.balance);
    const balanceAfter = toMoney(currentBalance + topupAmount);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter.toFixed(2),
        currency: currency || wallet.currency || "USD",
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: "TOPUP",
        amount: topupAmount.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        currency: currency || "USD",
        description: `PayPal top-up (+${topupAmount.toFixed(2)} Leaf)`,
        reference,
      },
    });

    return {
      alreadyCredited: false,
      leafBalance: balanceAfter,
      paypalOrderId: orderId,
      captureId,
    };
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
    if (req.method === "GET") {
      const clientId = getPayPalClientId();
      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: "PayPal client ID is not configured.",
        });
      }
      return res.status(200).json({
        success: true,
        clientId,
        env: process.env.PAYPAL_ENV || "sandbox",
        currency: "USD",
        plans: getPayPalPlanIds(),
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const { action } = req.body || {};

    if (action === "create_order") {
      return await handleCreateOrder(req, res);
    }
    if (action === "capture_order") {
      return await handleCaptureOrder(req, res);
    }

    return res.status(400).json({
      success: false,
      error: "Invalid action. Use 'create_order' or 'capture_order'.",
    });
  } catch (error) {
    console.error("PayPal API Error:", error);
    return res.status(500).json({
      success: false,
      error: "PayPal service error",
      hint: getErrorHint(error),
      code: error.code || null,
    });
  }
};

async function handleCreateOrder(req, res) {
  const { amount, email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const topupAmount = toMoney(amount);

  if (!normalizedEmail) {
    return res.status(400).json({ success: false, error: "Missing required field: email" });
  }
  if (topupAmount <= 0) {
    return res.status(400).json({ success: false, error: "Amount must be greater than 0" });
  }

  const accessToken = await getPayPalAccessToken();
  const requestId = `leaf-create-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: normalizedEmail,
          description: `Leaf credit top-up for ${normalizedEmail}`,
          amount: {
            currency_code: "USD",
            value: topupAmount.toFixed(2),
          },
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.id) {
    return res.status(response.status || 500).json({
      success: false,
      error: data.message || "Could not create PayPal order.",
      details: data.details || null,
    });
  }

  return res.status(200).json({
    success: true,
    orderId: data.id,
  });
}

async function handleCaptureOrder(req, res) {
  const { orderId, email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({ success: false, error: "Missing required field: orderId" });
  }
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, error: "Missing required field: email" });
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status || 500).json({
      success: false,
      error: data.message || "Could not capture PayPal order.",
      details: data.details || null,
    });
  }

  const purchaseUnit = Array.isArray(data.purchase_units) ? data.purchase_units[0] : null;
  const captures =
    purchaseUnit &&
    purchaseUnit.payments &&
    Array.isArray(purchaseUnit.payments.captures)
      ? purchaseUnit.payments.captures
      : [];
  const capture = captures[0] || null;

  if (!capture) {
    return res.status(400).json({
      success: false,
      error: "PayPal capture not found in response.",
    });
  }

  if (capture.status !== "COMPLETED") {
    return res.status(400).json({
      success: false,
      error: `Capture status is ${capture.status}.`,
      status: capture.status,
    });
  }

  const creditResult = await creditLeafFromCapture({
    email: normalizedEmail,
    orderId: data.id,
    captureId: capture.id,
    amount: capture.amount && capture.amount.value ? capture.amount.value : 0,
    currency: capture.amount && capture.amount.currency_code ? capture.amount.currency_code : "USD",
  });

  return res.status(200).json({
    success: true,
    captureId: capture.id,
    paypalOrderId: data.id,
    amount: toMoney(capture.amount && capture.amount.value),
    currency: (capture.amount && capture.amount.currency_code) || "USD",
    alreadyCredited: Boolean(creditResult.alreadyCredited),
    leafBalance: toMoney(creditResult.leafBalance),
  });
}
