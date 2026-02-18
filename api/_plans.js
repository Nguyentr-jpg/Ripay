const PLAN_FEATURES = {
  free: {
    tier: "free",
    label: "Free",
    dailyOrderLimit: 2,
    weeklyOrderLimit: 10,
    retentionHours: 12,
    seatLimit: 1,
    orderEmailNotifications: false,
  },
  personal: {
    tier: "personal",
    label: "Personal",
    dailyOrderLimit: null,
    weeklyOrderLimit: null,
    retentionHours: 24 * 7,
    seatLimit: 1,
    orderEmailNotifications: true,
  },
  business: {
    tier: "business",
    label: "Business",
    dailyOrderLimit: null,
    weeklyOrderLimit: null,
    retentionHours: 24 * 60,
    seatLimit: 3,
    orderEmailNotifications: true,
  },
};

function normalizePlan(plan) {
  return String(plan || "")
    .trim()
    .toLowerCase();
}

function getTierRank(tier) {
  if (tier === "business") return 3;
  if (tier === "personal") return 2;
  return 1;
}

function getTierFromPlan(plan) {
  const normalized = normalizePlan(plan);
  if (!normalized) return "free";
  if (normalized.includes("business")) return "business";
  if (
    normalized.includes("personal") ||
    normalized === "monthly" ||
    normalized === "annual" ||
    normalized.includes("referral")
  ) {
    return "personal";
  }
  return "free";
}

function pickBestTier(currentTier, nextTier) {
  return getTierRank(nextTier) > getTierRank(currentTier) ? nextTier : currentTier;
}

function resolveTierFromSubscriptions(subscriptions) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  let tier = "free";
  let sourcePlan = null;

  for (const subscription of list) {
    const nextTier = getTierFromPlan(subscription && subscription.plan);
    if (getTierRank(nextTier) > getTierRank(tier)) {
      tier = nextTier;
      sourcePlan = subscription && subscription.plan ? subscription.plan : null;
    }
  }

  return { tier, sourcePlan };
}

function getPlanFeatures(tier) {
  return PLAN_FEATURES[tier] || PLAN_FEATURES.free;
}

function getUtcDayStart(dateInput = new Date()) {
  const date = new Date(dateInput);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getUtcWeekStart(dateInput = new Date()) {
  const dayStart = getUtcDayStart(dateInput);
  const day = dayStart.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  return new Date(dayStart.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
}

module.exports = {
  PLAN_FEATURES,
  getPlanFeatures,
  getTierFromPlan,
  getTierRank,
  pickBestTier,
  resolveTierFromSubscriptions,
  getUtcDayStart,
  getUtcWeekStart,
};
