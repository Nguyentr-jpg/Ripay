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

function normalizeClientId(value) {
  return String(value || "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getErrorHint(error) {
  if (error.code === "P2021") {
    return "client_profiles table is missing. Run database migration and redeploy.";
  }
  if (error.code === "P2022") {
    return "client_profiles schema mismatch. Regenerate Prisma client and redeploy.";
  }
  if (error.code === "P1001") {
    return "Cannot reach database. Check DATABASE_URL.";
  }
  if (error.code === "P2002") {
    return "Client ID or client email already exists for this account.";
  }
  return error.message || "Client profile service error.";
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
    console.error("Client profiles API error:", error);
    return res.status(500).json({
      error: "Client profiles service error",
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
  const user = await getOrCreateUserByEmail(email);
  const profiles = await getPrisma().clientProfile.findMany({
    where: { userId: user.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return res.status(200).json({
    success: true,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      clientId: profile.clientId,
      clientEmail: normalizeEmail(profile.clientEmail),
      clientName: profile.clientName || "",
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    })),
  });
}

async function handlePost(req, res) {
  const email = normalizeEmail(req.body && req.body.email);
  const clientId = normalizeClientId(req.body && req.body.clientId);
  const clientEmail = normalizeEmail(req.body && req.body.clientEmail);
  const clientName = String((req.body && req.body.clientName) || "").trim();

  if (!email || !clientId || !clientEmail) {
    return res.status(400).json({
      error: "Missing required fields: email, clientId, clientEmail",
    });
  }
  if (!isValidEmail(clientEmail)) {
    return res.status(400).json({ error: "clientEmail is invalid." });
  }

  const user = await getOrCreateUserByEmail(email);
  const db = getPrisma();
  const profile = await db.$transaction(async (tx) => {
    const existingByEmail = await tx.clientProfile.findFirst({
      where: {
        userId: user.id,
        clientEmail: { equals: clientEmail, mode: "insensitive" },
      },
    });
    if (existingByEmail && existingByEmail.clientId !== clientId) {
      return tx.clientProfile.update({
        where: { id: existingByEmail.id },
        data: {
          clientId,
          clientName: clientName || existingByEmail.clientName || null,
        },
      });
    }
    return tx.clientProfile.upsert({
      where: {
        userId_clientId: {
          userId: user.id,
          clientId,
        },
      },
      create: {
        userId: user.id,
        clientId,
        clientEmail,
        clientName: clientName || null,
      },
      update: {
        clientEmail,
        clientName: clientName || null,
      },
    });
  });

  return res.status(200).json({
    success: true,
    profile: {
      id: profile.id,
      clientId: profile.clientId,
      clientEmail: normalizeEmail(profile.clientEmail),
      clientName: profile.clientName || "",
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  });
}
