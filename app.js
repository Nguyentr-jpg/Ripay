const STORAGE_KEY = "renpay-data-v1";
const NOTIF_SEEN_AT_PREFIX = "renpay-notif-seen-at:";
const LANG_KEY = "renpay-lang";

const state = {
  user: null, // { id, email, name, role }
  subscribed: false,
  planTier: "free",
  planFeatures: null,
  usage: {
    ordersToday: 0,
    ordersThisWeek: 0,
  },
  orders: [],
  payments: [],
  leafBalance: 0,
  leafCurrency: "USD",
  paypalClientId: "",
  paypalPlans: {
    monthly: "",
    annual: "",
    personal: {
      monthly: "",
      annual: "",
    },
    business: {
      monthly: "",
      annual: "",
    },
  },
  paypalSdkLoaded: false,
  paypalSubSdkLoaded: false,
  topupAmount: 20,
  selectedOrders: new Set(),
  activeOrderId: null,
  payQueue: [],
  referral: {
    stats: { total: 0, pending: 0, rewarded: 0 },
    invites: [],
  },
  lightbox: {
    items: [],
    index: 0,
    zoomed: false,
  },
  customClientIds: [],
  notifications: {
    items: [],
    unread: 0,
    open: false,
  },
  lang: "en",
};

const ADD_NEW_CLIENT_ID_OPTION = "+ Add new client id";
let activeClientIdInput = null;

const el = (id) => document.getElementById(id);
let paypalSdkPromise = null;
let paypalSubSdkPromise = null;

const I18N = {
  en: {
    appTagline: "Payments & downloads for real estate media editing",
    notifHead: "Notifications",
    heroTitle: "Fast payments, safe downloads",
    heroSubtitle:
      "Built for real estate photo, video, and floor plan editing. Manage orders, collect card payments, and deliver watermarked previews in one place.",
    paymentGatewayPill: "Payment gateway: PayPal + Leaf credits",
    previewHead: "Watermarked preview gallery",
    heroStatOrdersLabel: "Orders processed",
    heroStatSuccessLabel: "Successful payments",
    loginTitle: "Sign in",
    loginSubtitle: "Enter your email to continue.",
    loginEmailLabel: "Email",
    loginCodeLabel: "Sign-in code",
    loginCodeHint:
      "Check your email and click the link to sign in automatically, or enter the 6-digit code below.",
    loginPlanHint: "Free plan: 2 orders/day and up to 10 orders/week.",
    btnLogin: "Sign in",
    btnLoginResend: "Resend sign-in link",
    btnLoginCode: "Sign in with code",
    btnSigning: "Signing...",
    btnOpenRefer: "Refer and earn",
    btnOpenUpgrade: "Upgrade",
    feedbackTitle: "Feedback",
    feedbackSubtitle: "Share a quick note or request.",
    btnOpenFeedback: "Open feedback form",
    btnLogout: "Sign out",
    navOverview: "Overview",
    navCreate: "Create Order",
    navPayments: "Payments",
    overviewTitle: "Overview",
    overviewSubtitle: "All orders waiting for payment or already paid.",
    btnTopupLeaf: "Top up Leaf",
    btnExportOrders: "Export CSV",
    btnBulkPay: "Pay selected orders",
    btnExportPayments: "Export CSV",
    orderSearchPlaceholder: "Search orders by name, ID, or client...",
    statusAll: "All statuses",
    statusUnpaid: "Unpaid",
    statusPaid: "Paid",
    orderHeadName: "Order name",
    orderHeadId: "Order ID",
    orderHeadClientId: "Client ID",
    orderHeadQty: "Quantity",
    orderHeadStatus: "Status",
    createOrderTitle: "Create Order",
    createOrderSubtitle: "Create one or multiple orders at once.",
    createOrderNameLabel: "Order name",
    btnAddLine: "+ Add order",
    btnCreateApply: "Apply",
    walletTitle: "Leaf Wallet",
    walletSubtitle: "Top-ups and order payments from your Leaf balance.",
    paymentHeadDate: "Date",
    paymentHeadType: "Type",
    paymentHeadDesc: "Description",
    paymentHeadAmount: "Amount",
    paymentHeadBalance: "Balance",
    languageLabel: "Language",
    statsTotalOrders: "Total orders",
    statsRevenueCollected: "Revenue collected",
    statsUnpaidOrders: "Unpaid orders",
    statsPendingAmount: "Pending amount",
    statsLeafBalance: "Leaf balance",
    paid: "Paid",
    unpaid: "Unpaid",
    view: "View",
    noOrdersFound: "No orders found.",
    noWalletActivity: "No wallet activity yet.",
    lineItemTypePlaceholder: "Order name (address + service)",
    lineItemCountPlaceholder: "Quantity",
    lineItemUnitPrice: "Unit price",
    lineItemUnitPricePrompt: "Enter unit price (per photo/video)",
    lineItemClientIdPlaceholder: "Client ID",
    lineItemClientEmailPlaceholder: "Buyer email (optional)",
    lineItemLinkPlaceholder: "Link",
    notifNone: "No notifications yet.",
    sellerPlan: "{plan} plan",
  },
  vi: {
    appTagline: "Thanh toán & tải xuống cho chỉnh sửa media bất động sản",
    notifHead: "Thông báo",
    heroTitle: "Thanh toán nhanh, tải xuống an toàn",
    heroSubtitle:
      "Dành cho chỉnh sửa ảnh, video và mặt bằng bất động sản. Quản lý đơn hàng, thu tiền và giao bản xem trước có watermark tại một nơi.",
    paymentGatewayPill: "Cổng thanh toán: PayPal + Leaf credits",
    previewHead: "Thư viện xem trước có watermark",
    heroStatOrdersLabel: "Đơn đã xử lý",
    heroStatSuccessLabel: "Thanh toán thành công",
    loginTitle: "Đăng nhập",
    loginSubtitle: "Nhập email để tiếp tục.",
    loginEmailLabel: "Email",
    loginCodeLabel: "Mã đăng nhập",
    loginCodeHint:
      "Kiểm tra email và bấm liên kết để đăng nhập tự động, hoặc nhập mã 6 số bên dưới.",
    loginPlanHint: "Gói miễn phí: 2 đơn/ngày và tối đa 10 đơn/tuần.",
    btnLogin: "Đăng nhập",
    btnLoginResend: "Gửi lại liên kết đăng nhập",
    btnLoginCode: "Đăng nhập bằng mã",
    btnSigning: "Đang đăng nhập...",
    btnOpenRefer: "Giới thiệu nhận thưởng",
    btnOpenUpgrade: "Nâng cấp",
    feedbackTitle: "Phản hồi",
    feedbackSubtitle: "Chia sẻ nhanh yêu cầu của bạn.",
    btnOpenFeedback: "Mở form phản hồi",
    btnLogout: "Đăng xuất",
    navOverview: "Tổng quan",
    navCreate: "Tạo đơn",
    navPayments: "Thanh toán",
    overviewTitle: "Tổng quan",
    overviewSubtitle: "Tất cả đơn đang chờ thanh toán hoặc đã thanh toán.",
    btnTopupLeaf: "Nạp Leaf",
    btnExportOrders: "Xuất CSV",
    btnBulkPay: "Thanh toán đơn đã chọn",
    btnExportPayments: "Xuất CSV",
    orderSearchPlaceholder: "Tìm theo tên đơn, ID hoặc khách hàng...",
    statusAll: "Tất cả trạng thái",
    statusUnpaid: "Chưa thanh toán",
    statusPaid: "Đã thanh toán",
    orderHeadName: "Tên đơn",
    orderHeadId: "Mã đơn",
    orderHeadClientId: "Mã khách",
    orderHeadQty: "Số lượng",
    orderHeadStatus: "Trạng thái",
    createOrderTitle: "Tạo đơn",
    createOrderSubtitle: "Tạo một hoặc nhiều đơn cùng lúc.",
    createOrderNameLabel: "Tên đơn",
    btnAddLine: "+ Thêm đơn",
    btnCreateApply: "Áp dụng",
    walletTitle: "Ví Leaf",
    walletSubtitle: "Nạp tiền và thanh toán đơn bằng số dư Leaf.",
    paymentHeadDate: "Ngày",
    paymentHeadType: "Loại",
    paymentHeadDesc: "Mô tả",
    paymentHeadAmount: "Số tiền",
    paymentHeadBalance: "Số dư",
    languageLabel: "Ngôn ngữ",
    statsTotalOrders: "Tổng đơn",
    statsRevenueCollected: "Doanh thu",
    statsUnpaidOrders: "Đơn chưa thanh toán",
    statsPendingAmount: "Số tiền chờ",
    statsLeafBalance: "Số dư Leaf",
    paid: "Đã thanh toán",
    unpaid: "Chưa thanh toán",
    view: "Xem",
    noOrdersFound: "Không có đơn hàng.",
    noWalletActivity: "Chưa có hoạt động ví.",
    lineItemTypePlaceholder: "Tên đơn (địa chỉ + dịch vụ)",
    lineItemCountPlaceholder: "Số lượng",
    lineItemUnitPrice: "Đơn giá",
    lineItemUnitPricePrompt: "Nhập đơn giá (mỗi ảnh/video)",
    lineItemClientIdPlaceholder: "Mã khách hàng",
    lineItemClientEmailPlaceholder: "Email người mua (không bắt buộc)",
    lineItemLinkPlaceholder: "Liên kết",
    notifNone: "Chưa có thông báo.",
    sellerPlan: "Gói {plan}",
  },
};

const t = (key, params = {}) => {
  const table = I18N[state.lang] || I18N.en;
  const fallback = I18N.en[key] || key;
  let value = table[key] || fallback;
  Object.keys(params).forEach((name) => {
    value = value.replaceAll(`{${name}}`, String(params[name]));
  });
  return value;
};

const loadLanguage = () => {
  const saved = String(localStorage.getItem(LANG_KEY) || "").trim().toLowerCase();
  if (saved === "vi" || saved === "en") {
    state.lang = saved;
    return;
  }
  const browserLang = String(navigator.language || "").toLowerCase();
  state.lang = browserLang.startsWith("vi") ? "vi" : "en";
};

const setLanguage = (lang) => {
  state.lang = lang === "vi" ? "vi" : "en";
  localStorage.setItem(LANG_KEY, state.lang);
  applyLanguage();
};

const applyLanguage = () => {
  document.documentElement.lang = state.lang === "vi" ? "vi" : "en";

  const setText = (id, key, params) => {
    const node = el(id);
    if (node) node.textContent = t(key, params);
  };

  setText("appTagline", "appTagline");
  setText("notifHead", "notifHead");
  setText("heroTitle", "heroTitle");
  setText("heroSubtitle", "heroSubtitle");
  setText("paymentGatewayPill", "paymentGatewayPill");
  setText("previewHead", "previewHead");
  setText("heroStatOrdersLabel", "heroStatOrdersLabel");
  setText("heroStatSuccessLabel", "heroStatSuccessLabel");
  setText("loginTitle", "loginTitle");
  setText("loginSubtitle", "loginSubtitle");
  setText("loginEmailLabel", "loginEmailLabel");
  setText("loginCodeLabel", "loginCodeLabel");
  setText("loginCodeHint", "loginCodeHint");
  setText("loginPlanHint", "loginPlanHint");
  setText("btnLoginCode", "btnLoginCode");
  setText("btnOpenRefer", "btnOpenRefer");
  setText("btnOpenUpgrade", "btnOpenUpgrade");
  setText("feedbackTitle", "feedbackTitle");
  setText("feedbackSubtitle", "feedbackSubtitle");
  setText("btnOpenFeedback", "btnOpenFeedback");
  setText("btnLogout", "btnLogout");
  setText("navOverview", "navOverview");
  setText("navCreate", "navCreate");
  setText("navPayments", "navPayments");
  setText("overviewTitle", "overviewTitle");
  setText("overviewSubtitle", "overviewSubtitle");
  setText("btnTopupLeaf", "btnTopupLeaf");
  setText("btnExportOrders", "btnExportOrders");
  setText("btnBulkPay", "btnBulkPay");
  setText("btnExportPayments", "btnExportPayments");
  setText("createOrderTitle", "createOrderTitle");
  setText("createOrderSubtitle", "createOrderSubtitle");
  setText("createOrderNameLabel", "createOrderNameLabel");
  setText("btnAddLine", "btnAddLine");
  setText("btnCreate", "btnCreateApply");
  setText("walletTitle", "walletTitle");
  setText("walletSubtitle", "walletSubtitle");
  setText("paymentHeadDate", "paymentHeadDate");
  setText("paymentHeadType", "paymentHeadType");
  setText("paymentHeadDesc", "paymentHeadDesc");
  setText("paymentHeadAmount", "paymentHeadAmount");
  setText("paymentHeadBalance", "paymentHeadBalance");
  setText("languageLabel", "languageLabel");

  const loginEmail = el("loginEmail");
  if (loginEmail) loginEmail.placeholder = "name@email.com";
  const orderSearch = el("orderSearch");
  if (orderSearch) orderSearch.placeholder = t("orderSearchPlaceholder");

  const statusFilter = el("orderStatusFilter");
  if (statusFilter && statusFilter.options.length >= 3) {
    statusFilter.options[0].text = t("statusAll");
    statusFilter.options[1].text = t("statusUnpaid");
    statusFilter.options[2].text = t("statusPaid");
  }

  const header = document.querySelector(".order-row.order-header");
  if (header) {
    const cols = header.querySelectorAll("div");
    if (cols.length >= 7) {
      cols[1].textContent = t("orderHeadName");
      cols[2].textContent = t("orderHeadId");
      cols[3].textContent = t("orderHeadClientId");
      cols[4].textContent = t("orderHeadQty");
      cols[5].textContent = t("orderHeadStatus");
    }
  }

  const languageSelect = el("languageSelect");
  if (languageSelect) languageSelect.value = state.lang;

  setLoginChallengeActive(!el("loginCodePanel").classList.contains("hidden"));
  updatePlanBadge();
  renderOrders();
  renderPayments();
  renderNotifications();
};

const getFileNameFromUrl = (url) => {
  if (!url) return "";
  try {
    const clean = url.split("?")[0];
    const parts = clean.split("/");
    return parts[parts.length - 1] || "";
  } catch (err) {
    return "";
  }
};

const seedData = () => ({
  orders: [
    {
      id: "ORD-1001",
      name: "20260205 - Penthouse An Phu - Photos",
      items: [
        { type: "Interior photos", count: 12, link: "drive.google.com/album/1", unitPrice: 1 },
        { type: "Video walkthrough", count: 1, link: "vimeo.com/123", unitPrice: 25 },
      ],
      totalCount: 13,
      totalAmount: 37,
      status: "unpaid",
      createdAt: "2026-02-05 10:14",
      clientId: "CLI-48219",
      clientName: "tranthiennguyen27@gmail.com",
    },
    {
      id: "ORD-1002",
      name: "20260204 - Villa 78 - Photos",
      items: [{ type: "Exterior photos", count: 8, link: "drive.google.com/album/2", unitPrice: 1 }],
      totalCount: 8,
      totalAmount: 8,
      status: "paid",
      createdAt: "2026-02-04 16:42",
      clientId: "CLI-19420",
      clientName: "tranthiennguyen27@gmail.com",
    },
  ],
  payments: [
    {
      id: "LEDGER-5001",
      date: "2026-02-04",
      type: "TOPUP",
      description: "Leaf top-up (+20.00 Leaf)",
      amount: 20,
      balanceAfter: 20,
    },
  ],
  leafBalance: 20,
});

const loadState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const data = seedData();
    state.orders = data.orders;
    state.payments = data.payments;
    state.subscribed = false;
    state.leafBalance = Number(data.leafBalance || 0);
    return;
  }
  try {
    const data = JSON.parse(raw);
    state.orders = data.orders || [];
    state.payments = data.payments || [];
    state.subscribed = Boolean(data.subscribed);
    state.planTier = data.planTier || "free";
    state.leafBalance = Number(data.leafBalance || 0);
  } catch (err) {
    console.error(err);
  }
};

const saveState = () => {
  const stripInlineThumb = (file) => {
    if (!file || typeof file !== "object") return file;
    const thumbnailUrl = typeof file.thumbnailUrl === "string" ? file.thumbnailUrl : "";
    if (thumbnailUrl.startsWith("data:image/")) {
      return { ...file, thumbnailUrl: "" };
    }
    return file;
  };

  const compactOrders = (state.orders || []).map((order) => ({
    ...order,
    mediaFiles: Array.isArray(order.mediaFiles) ? order.mediaFiles.map(stripInlineThumb) : order.mediaFiles,
  }));

  const payload = {
    orders: compactOrders,
    payments: state.payments,
    subscribed: state.subscribed,
    planTier: state.planTier,
    leafBalance: state.leafBalance,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error("Failed to persist state to localStorage:", err);
  }
};

const downloadCSV = (rows, filename) => {
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const formatStatus = (status) => {
  const isPaid = status === "paid";
  return `<span class="badge ${isPaid ? "paid" : "unpaid"}">${
    isPaid ? t("paid") : t("unpaid")
  }</span>`;
};

const formatMoney = (amount) => `$${Number(amount || 0).toFixed(2)}`;
const getPlanLabel = (tier) => {
  if (tier === "business") return "Business";
  if (tier === "personal") return "Personal";
  return "Free";
};

const formatRetention = (hours) => {
  const value = Number(hours || 0);
  if (value <= 0) return "-";
  if (value % (24 * 30) === 0) return `${value / (24 * 30)} month`;
  if (value % 24 === 0) return `${value / 24} day`;
  return `${value} hour`;
};

const updatePlanBadge = () => {
  const roleEl = el("sellerRole");
  if (!roleEl) return;
  const planLabel = getPlanLabel(state.planTier);
  roleEl.textContent = t("sellerPlan", { plan: planLabel });
};

const formatLedgerDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const getNotificationSeenAt = (email) => {
  if (!email) return "";
  return String(localStorage.getItem(`${NOTIF_SEEN_AT_PREFIX}${email}`) || "");
};

const setNotificationSeenAt = (email, value) => {
  if (!email) return;
  localStorage.setItem(`${NOTIF_SEEN_AT_PREFIX}${email}`, String(value || ""));
};

const formatNotifDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").slice(0, 16);
};

const renderNotifications = () => {
  const btn = el("btnNotifications");
  const panel = el("notifPanel");
  const list = el("notifList");
  const count = el("notifCount");
  if (!btn || !panel || !list || !count) return;

  const items = Array.isArray(state.notifications.items) ? state.notifications.items : [];
  const unread = Number(state.notifications.unread || 0);

  btn.classList.toggle("hidden", !state.user);
  panel.classList.toggle("hidden", !state.notifications.open);
  btn.classList.toggle("has-new", unread > 0);
  count.classList.toggle("hidden", unread <= 0);
  count.textContent = unread > 99 ? "99+" : String(unread);

  if (!items.length) {
    list.innerHTML = `<div class="notif-item"><div class="notif-msg">${t("notifNone")}</div></div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
      <div class="notif-item">
        <div class="notif-title">${item.title || "Notification"}</div>
        <div class="notif-msg">${item.message || "-"}</div>
        <div class="notif-time">${formatNotifDateTime(item.createdAt)}</div>
      </div>
    `
    )
    .join("");
};

const markNotificationsRead = () => {
  const email = state.user && state.user.email;
  if (!email) return;
  setNotificationSeenAt(email, new Date().toISOString());
  state.notifications.unread = 0;
  renderNotifications();
};

const toggleNotificationsPanel = () => {
  state.notifications.open = !state.notifications.open;
  if (state.notifications.open) {
    markNotificationsRead();
  }
  renderNotifications();
};

const fetchNotificationsFromDB = async () => {
  const email = state.user && state.user.email;
  if (!email) return;
  try {
    const response = await fetch(`/api/notifications?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      console.error("Notifications API error:", data);
      return;
    }
    state.notifications.items = Array.isArray(data.notifications) ? data.notifications : [];
    const seenAt = getNotificationSeenAt(email);
    const seenDate = seenAt ? new Date(seenAt) : null;
    const seenTime = seenDate && !Number.isNaN(seenDate.getTime()) ? seenDate.getTime() : 0;
    state.notifications.unread = state.notifications.items.filter((item) => {
      const time = new Date(item.createdAt).getTime();
      return Number.isFinite(time) && time > seenTime;
    }).length;
    renderNotifications();
  } catch (err) {
    console.error("Could not fetch notifications:", err);
  }
};

const getClientIdOptions = () => {
  const ids = new Set();
  (state.customClientIds || []).forEach((id) => {
    const value = String(id || "").trim();
    if (value) ids.add(value);
  });
  (state.orders || []).forEach((order) => {
    const value = String((order && order.clientId) || "").trim();
    if (value) ids.add(value);
  });
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
};

const renderClientIdOptions = () => {
  const list = el("clientIdOptions");
  if (!list) return;
  const options = getClientIdOptions();
  const optionHtml = options.map((id) => `<option value="${id}"></option>`).join("");
  list.innerHTML = `${optionHtml}<option value="${ADD_NEW_CLIENT_ID_OPTION}"></option>`;
};

const rememberClientId = (value) => {
  const id = String(value || "").trim();
  if (!id || id === ADD_NEW_CLIENT_ID_OPTION) return;
  if (!Array.isArray(state.customClientIds)) state.customClientIds = [];
  if (!state.customClientIds.includes(id)) {
    state.customClientIds.push(id);
  }
};

const closeClientIdModal = () => {
  el("clientIdModal").classList.add("hidden");
};

const openClientIdModal = (targetInput) => {
  activeClientIdInput = targetInput || null;
  const input = el("newClientIdInput");
  input.value = "";
  el("clientIdModal").classList.remove("hidden");
  input.focus();
};

const saveNewClientId = () => {
  const value = String((el("newClientIdInput").value || "")).trim();
  if (!value) {
    alert("Please enter client ID.");
    return;
  }
  if (value === ADD_NEW_CLIENT_ID_OPTION) {
    alert("Please choose another client ID.");
    return;
  }
  rememberClientId(value);
  renderClientIdOptions();
  if (activeClientIdInput) {
    activeClientIdInput.value = value;
  }
  closeClientIdModal();
};

const renderStats = () => {
  const row = el("statsRow");
  const total = state.orders.length;
  const unpaid = state.orders.filter((o) => o.status === "unpaid");
  const paid = state.orders.filter((o) => o.status === "paid");
  const revenue = paid.reduce((sum, o) => sum + getOrderAmount(o), 0);
  const pending = unpaid.reduce((sum, o) => sum + getOrderAmount(o), 0);

  row.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">${t("statsTotalOrders")}</div>
      <div class="stat-value">${total}</div>
    </div>
    <div class="stat-card highlight">
      <div class="stat-label">${t("statsRevenueCollected")}</div>
      <div class="stat-value">$${revenue.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("statsUnpaidOrders")}</div>
      <div class="stat-value">${unpaid.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("statsPendingAmount")}</div>
      <div class="stat-value">$${pending.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("statsLeafBalance")}</div>
      <div class="stat-value">${formatMoney(state.leafBalance)}</div>
    </div>
  `;
};

const getFilteredOrders = () => {
  const search = (el("orderSearch")?.value || "").toLowerCase().trim();
  const statusFilter = el("orderStatusFilter")?.value || "all";

  return state.orders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    if (search) {
      const haystack = `${order.name} ${order.id} ${order.clientId || ""} ${order.clientName || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
};

const renderOrders = () => {
  const list = el("orderList");
  list.innerHTML = "";
  renderClientIdOptions();

  renderStats();

  const filtered = getFilteredOrders();

  if (!filtered.length) {
    list.innerHTML = `<div class="order-row"><div></div><div>${t("noOrdersFound")}</div><div></div><div></div><div></div><div></div><div></div></div>`;
    return;
  }

  filtered.forEach((order) => {
    const row = document.createElement("div");
    row.className = "order-row";

    const checked = state.selectedOrders.has(order.id) ? "checked" : "";
    row.innerHTML = `
      <div>
        <input type="checkbox" data-id="${order.id}" ${checked} />
      </div>
      <div>
        <div class="order-name">${order.name}</div>
        <div class="hint">${order.createdAt}</div>
      </div>
      <div>${order.id}</div>
      <div>${order.clientId || "CLI-00000"}</div>
      <div>${order.totalCount}</div>
      <div>${formatStatus(order.status)}</div>
      <div>
        <button class="btn ghost" data-view="${order.id}">${t("view")}</button>
      </div>
    `;

    list.appendChild(row);
  });
};

const renderPayments = () => {
  const list = el("paymentList");
  list.innerHTML = "";

  if (!state.payments.length) {
    list.innerHTML = `<div class="payment-row"><div>${t("noWalletActivity")}</div><div></div><div></div><div></div><div></div></div>`;
    return;
  }

  state.payments
    .slice()
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
    .forEach((payment) => {
      const row = document.createElement("div");
      row.className = "payment-row";
      const amount = Number(payment.amount || 0);
      const sign = amount > 0 ? "+" : "";
      row.innerHTML = `
        <div>${formatLedgerDate(payment.createdAt || payment.date)}</div>
        <div>${payment.type || payment.status || "-"}</div>
        <div>${payment.description || payment.reference || payment.orderId || "-"}</div>
        <div>${sign}${formatMoney(amount)}</div>
        <div>${formatMoney(payment.balanceAfter)}</div>
      `;
      list.appendChild(row);
    });
};

const renderLineItems = (items = []) => {
  const container = el("lineItems");
  container.innerHTML = "";

  const data = items.length
    ? items
    : [
        {
          type: "6932 Terra Rye, San Antonio, TX 78240 - Photos",
          count: 10,
          link: "",
          unitPrice: 1,
        },
      ];

  data.forEach((item) => addLineItem(item));
};

const addLineItem = (
  item = { type: "", count: 0, link: "", unitPrice: 0, clientId: "", clientEmail: "" }
) => {
  const container = el("lineItems");
  const row = document.createElement("div");
  row.className = "line-item";
  row.dataset.unitPrice = item.unitPrice || 0;
  row.innerHTML = `
    <input data-field="type" type="text" placeholder="${t("lineItemTypePlaceholder")}" value="${item.type}" />
    <div class="quantity-wrap">
      <input data-field="count" type="number" min="1" placeholder="${t("lineItemCountPlaceholder")}" value="${item.count || ""}" />
      <button class="price-btn" data-price>...</button>
      <div class="price-hint">${t("lineItemUnitPrice")}: $<span>${Number(item.unitPrice || 0).toFixed(2)}</span></div>
    </div>
    <input data-field="clientId" type="text" list="clientIdOptions" placeholder="${t("lineItemClientIdPlaceholder")}" value="${item.clientId || ""}" />
    <input data-field="clientEmail" type="email" placeholder="${t("lineItemClientEmailPlaceholder")}" value="${item.clientEmail || ""}" />
    <input data-field="link" type="text" placeholder="${t("lineItemLinkPlaceholder")}" value="${item.link}" />
    <button class="btn ghost" data-remove>–</button>
  `;

  const priceEl = row.querySelector("[data-price]");
  priceEl.addEventListener("click", () => {
    const current = row.dataset.unitPrice || item.unitPrice || 0;
    const next = prompt(t("lineItemUnitPricePrompt"), current);
    if (next === null) return;
    const value = Math.max(0, Number(next));
    row.dataset.unitPrice = value;
    row.querySelector(".price-hint span").textContent = value.toFixed(2);
  });

  row.querySelector("[data-remove]").addEventListener("click", () => {
    row.remove();
  });

  const clientIdInput = row.querySelector('[data-field="clientId"]');
  const handleClientIdInput = () => {
    const value = String((clientIdInput && clientIdInput.value) || "").trim();
    if (value === ADD_NEW_CLIENT_ID_OPTION) {
      clientIdInput.value = "";
      openClientIdModal(clientIdInput);
    }
  };
  const handleClientIdChange = () => {
    const value = String((clientIdInput && clientIdInput.value) || "").trim();
    if (value) {
      rememberClientId(value);
      renderClientIdOptions();
    }
  };
  clientIdInput.addEventListener("input", handleClientIdInput);
  clientIdInput.addEventListener("change", handleClientIdChange);

  container.appendChild(row);
};

const parseLinks = (raw) => {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const normalizeImageUrl = (url) => {
  if (!url) return "";

  if (url.includes("dropbox.com")) {
    if (url.includes("?raw=1")) return url;
    if (url.includes("?dl=0") || url.includes("?dl=1")) {
      return url.replace(/\?dl=[01]/, "?raw=1");
    }
    return `${url}${url.includes("?") ? "&" : "?"}raw=1`;
  }

  if (url.includes("drive.google.com")) {
    const fileMatch = url.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
    }
    const openMatch = url.match(/[?&]id=([^&]+)/);
    if (openMatch) {
      return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`;
    }
  }

  return url;
};

const isImageUrl = (url) =>
  /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);

const isPreviewHost = (url) =>
  /dropbox\.com|drive\.google\.com|googleusercontent\.com/i.test(url);

const isLikelyLowResUrl = (url) => {
  if (!url) return true;
  if (url.startsWith("data:image/")) return true;
  if (url.includes("/api/dropbox-file")) return true;
  return /(thumbnail|get_thumbnail|=s\d{2,4})(?:[?&]|$)/i.test(url);
};

const sanitizeLightboxSrc = (url) => {
  if (!url) return "";
  return url;
};

const renderGalleryGrid = (order) => {
  const grid = el("galleryGrid");
  grid.innerHTML = "";
  const lightboxItems = [];

  // Use mediaFiles if available (from Dropbox/Drive), otherwise fallback to links
  const mediaFiles = order.mediaFiles || [];

  if (mediaFiles.length > 0) {
    // Display fetched media files
    mediaFiles.forEach((file) => {
      const item = document.createElement("div");
      item.className = "gallery-item";
      const src = sanitizeLightboxSrc(file.downloadUrl || file.previewUrl || file.url || "");
      const name = file.name || getFileNameFromUrl(src);

      const thumb = file.thumbnailUrl || src || file.url || "";
      if (thumb) {
        item.style.backgroundImage = `url('${thumb}')`;
      }

      const lightboxSrc = src || thumb;
      if (lightboxSrc) {
        item.dataset.src = src;
        item.dataset.fileName = name;
        item.dataset.index = String(lightboxItems.length);
        lightboxItems.push({ src: lightboxSrc, fallbackSrc: thumb, name });
      } else {
        item.classList.add("link-only");
      }

      // Add paid/unpaid overlay
      if (order.status === 'unpaid') {
        item.classList.add('watermarked');
      }

      item.addEventListener("click", () => {
        const index = Number(item.dataset.index || -1);
        openLightbox(index);
      });
      grid.appendChild(item);
    });
    state.lightbox.items = lightboxItems;
    return;
  }

  // Fallback to old link parsing method
  const links = order.items
    ? order.items.flatMap((item) => parseLinks(item.link).map(normalizeImageUrl))
    : [];
  const previewCount = links.length
    ? links.length
    : Math.min(order.totalCount, 16);

  for (let i = 0; i < previewCount; i += 1) {
    const item = document.createElement("div");
    item.className = "gallery-item";
    if (links[i] && (isImageUrl(links[i]) || isPreviewHost(links[i]))) {
      item.style.backgroundImage = `url('${links[i]}')`;
      item.dataset.src = links[i];
      item.dataset.index = String(lightboxItems.length);
      lightboxItems.push({ src: links[i], name: getFileNameFromUrl(links[i]) });
    } else if (links[i]) {
      item.dataset.src = "";
      item.classList.add("link-only");
    }
    item.addEventListener("click", () => {
      const index = Number(item.dataset.index || -1);
      openLightbox(index);
    });
    grid.appendChild(item);
  }
  state.lightbox.items = lightboxItems;
};

const getGalleryOrderSequence = () => {
  const filtered = getFilteredOrders();
  if (filtered.some((order) => order.id === state.activeOrderId)) return filtered;
  return state.orders;
};

const updateGalleryOrderNav = () => {
  const prevBtn = el("btnPrevOrder");
  const nextBtn = el("btnNextOrder");
  const orders = getGalleryOrderSequence();
  const index = orders.findIndex((order) => order.id === state.activeOrderId);
  const noActive = index < 0 || orders.length <= 1;
  prevBtn.disabled = noActive || index === 0;
  nextBtn.disabled = noActive || index === orders.length - 1;
};

const stepGalleryOrder = async (delta) => {
  const orders = getGalleryOrderSequence();
  const index = orders.findIndex((order) => order.id === state.activeOrderId);
  if (index < 0) return;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= orders.length) return;
  await openGallery(orders[nextIndex].id);
};

const openGallery = async (orderId) => {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;

  state.activeOrderId = orderId;
  el("galleryTitle").textContent = order.name;
  el("galleryModal").classList.remove("hidden");
  updateGalleryOrderNav();

  const links = order.items
    ? order.items
        .map((item) => item.link || item.sourceLink || item.source_link)
        .filter(Boolean)
    : [];
  const needsRefresh =
    Array.isArray(order.mediaFiles) &&
    order.mediaFiles.length > 0 &&
    order.mediaFiles.some((file) => {
      const src = file.downloadUrl || file.previewUrl || file.url || "";
      return !src || isLikelyLowResUrl(src);
    });
  const shouldFetch = ((!order.mediaFiles || order.mediaFiles.length === 0) || needsRefresh) && links.length > 0;

  if (shouldFetch) {
    const grid = el("galleryGrid");
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 24px;">Loading previews...</div>`;

    const uniqueLinks = Array.from(new Set(links));
    const fetchedFiles = [];

    for (const link of uniqueLinks) {
      const files = await fetchMediaFromLink(link);
      if (Array.isArray(files) && files.length > 0) {
        fetchedFiles.push(...files);
      }
    }

    if (fetchedFiles.length > 0) {
      order.mediaFiles = fetchedFiles;
      saveState();
    }
  }

  renderGalleryGrid(order);
};

const closeGallery = () => {
  el("galleryModal").classList.add("hidden");
  state.activeOrderId = null;
  updateGalleryOrderNav();
};

const updateLightboxNav = () => {
  const count = state.lightbox.items.length;
  const disable = count <= 1;
  el("btnPrevLightbox").disabled = disable;
  el("btnNextLightbox").disabled = disable;
};

const resetLightboxZoom = () => {
  state.lightbox.zoomed = false;
  el("lightboxContent").classList.remove("zoomed");
};

const LIGHTBOX_DEFAULT_LONG_SIDE = 1000;

const applyLightboxDefaultScale = () => {
  const lightboxContent = el("lightboxContent");
  const lightboxImg = el("lightboxImg");
  if (!lightboxContent || !lightboxImg) return;

  const naturalWidth = lightboxImg.naturalWidth || 0;
  const naturalHeight = lightboxImg.naturalHeight || 0;
  if (!naturalWidth || !naturalHeight) return;

  const maxWidth = lightboxContent.clientWidth || window.innerWidth;
  const maxHeight = lightboxContent.clientHeight || window.innerHeight;

  if (naturalWidth >= naturalHeight) {
    const targetWidth = Math.min(LIGHTBOX_DEFAULT_LONG_SIDE, maxWidth);
    lightboxImg.style.width = `${targetWidth}px`;
    lightboxImg.style.height = "auto";
    return;
  }

  const targetHeight = Math.min(LIGHTBOX_DEFAULT_LONG_SIDE, maxHeight);
  lightboxImg.style.height = `${targetHeight}px`;
  lightboxImg.style.width = "auto";
};

const setLightboxIndex = (index) => {
  const items = state.lightbox.items;
  if (!items.length) return;
  const count = items.length;
  const nextIndex = ((index % count) + count) % count;
  state.lightbox.index = nextIndex;

  const current = items[nextIndex];
  const lightboxImg = el("lightboxImg");
  lightboxImg.style.width = "";
  lightboxImg.style.height = "";
  lightboxImg.onload = () => {
    applyLightboxDefaultScale();
  };
  lightboxImg.onerror = () => {
    if (current.fallbackSrc && lightboxImg.src !== current.fallbackSrc) {
      lightboxImg.src = current.fallbackSrc;
      return;
    }
    lightboxImg.onerror = null;
  };
  lightboxImg.src = current.src;
  el("lightboxName").textContent = current.name || "Preview image";
  el("lightboxCount").textContent = `${nextIndex + 1} / ${count}`;
  resetLightboxZoom();
  updateLightboxNav();
};

const openLightbox = (index) => {
  const items = state.lightbox.items;
  if (!items.length || index < 0 || index >= items.length) {
    alert("Link này không hiển thị được. Hãy dùng link ảnh trực tiếp hoặc link file Dropbox/Google Drive.");
    return;
  }

  el("lightbox").classList.remove("hidden");
  el("lightbox").setAttribute("aria-hidden", "false");
  setLightboxIndex(index);
};

const closeLightbox = () => {
  el("lightbox").classList.add("hidden");
  el("lightbox").setAttribute("aria-hidden", "true");
  el("lightboxImg").src = "";
  el("lightboxImg").style.width = "";
  el("lightboxImg").style.height = "";
  resetLightboxZoom();
};

const stepLightbox = (delta) => {
  if (!state.lightbox.items.length) return;
  setLightboxIndex(state.lightbox.index + delta);
};

const toggleLightboxZoom = () => {
  state.lightbox.zoomed = !state.lightbox.zoomed;
  el("lightboxContent").classList.toggle("zoomed", state.lightbox.zoomed);
};

const openPayModal = (orderIds) => {
  state.payQueue = orderIds;
  const total = getPayQueueTotal(orderIds);
  const count = orderIds.length;
  el("payTotal").textContent = `Total: ${formatMoney(total)} for ${count} order${count > 1 ? "s" : ""}`;
  el("payBalance").textContent = `Leaf balance: ${formatMoney(state.leafBalance)}`;
  const needed = Math.max(0, Number((total - state.leafBalance).toFixed(2)));
  el("payNeeded").textContent =
    needed > 0
      ? `Need ${formatMoney(needed)} more Leaf before payment.`
      : "Enough Leaf balance to pay now.";
  el("btnConfirmPay").disabled = needed > 0;
  el("payModal").classList.remove("hidden");
};

const formatDateCompact = (dateStr) => dateStr.slice(0, 10).replaceAll("-", "");
const formatLocalDateTime = (dateObj) => {
  const pad = (num) => String(num).padStart(2, "0");
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(
    dateObj.getDate()
  )} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
};

const ensureDatePrefix = (name, createdAt) => {
  if (/^\d{8}\s*-/.test(name)) return name;
  return `${formatDateCompact(createdAt)} - ${name}`;
};

const closePayModal = () => {
  el("payModal").classList.add("hidden");
  state.payQueue = [];
};

const getOrderAmount = (order) => {
  if (order.totalAmount != null && order.totalAmount !== "") return Number(order.totalAmount);
  if (Array.isArray(order.items)) {
    return order.items.reduce(
      (sum, item) => sum + (Number(item.count) || 0) * (Number(item.unitPrice) || 0),
      0
    );
  }
  return 0;
};

const getPayQueueTotal = (orderIds = state.payQueue) =>
  orderIds.reduce((sum, id) => {
    const order = state.orders.find((o) => o.id === id);
    return sum + (order ? getOrderAmount(order) : 0);
  }, 0);

const mapLedgerToPayments = (ledger = []) =>
  ledger.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    date: formatLedgerDate(entry.createdAt),
    type: entry.type,
    description:
      entry.description ||
      (entry.order && entry.order.orderNumber ? `Order ${entry.order.orderNumber}` : "Wallet activity"),
    amount: Number(entry.amount || 0),
    balanceAfter: Number(entry.balanceAfter || 0),
    reference: entry.reference || "",
  }));

const fetchWalletFromDB = async () => {
  const email = state.user && state.user.email;
  if (!email) return;

  try {
    const response = await fetch(`/api/wallet?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      console.error("Wallet API error:", data);
      return;
    }

    state.leafBalance = Number((data.wallet && data.wallet.leafBalance) || 0);
    state.leafCurrency = (data.wallet && data.wallet.currency) || "USD";
    state.payments = mapLedgerToPayments(data.ledger || []);
    saveState();
    renderStats();
    renderPayments();

    if (!el("payModal").classList.contains("hidden") && state.payQueue.length > 0) {
      openPayModal(state.payQueue);
    }
  } catch (err) {
    console.error("Could not fetch wallet data:", err);
  }
};

const fetchSubscriptionStatus = async () => {
  const email = state.user && state.user.email;
  if (!email) return;

  try {
    const response = await fetch(`/api/subscription?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      console.error("Subscription API error:", data);
      return;
    }
    state.subscribed = Boolean(data.subscription);
    state.planTier = data.tier || (data.subscription ? "personal" : "free");
    state.planFeatures = data.planFeatures || null;
    state.usage = data.usage || { ordersToday: 0, ordersThisWeek: 0 };
    updatePlanBadge();
    saveState();
    renderStats();
  } catch (err) {
    console.error("Could not fetch subscription status:", err);
  }
};

const renderReferralStats = () => {
  const statsEl = el("referStats");
  if (!statsEl) return;
  const stats = state.referral.stats || { total: 0, pending: 0, rewarded: 0 };
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total invites</div>
      <div class="stat-value">${Number(stats.total || 0)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pending</div>
      <div class="stat-value">${Number(stats.pending || 0)}</div>
    </div>
    <div class="stat-card highlight">
      <div class="stat-label">Rewarded</div>
      <div class="stat-value">${Number(stats.rewarded || 0)}</div>
    </div>
  `;
};

const renderReferralList = () => {
  const listEl = el("referList");
  if (!listEl) return;
  const invites = Array.isArray(state.referral.invites) ? state.referral.invites : [];
  if (!invites.length) {
    listEl.innerHTML = `<div class="refer-empty">No invites yet.</div>`;
    return;
  }
  listEl.innerHTML = invites
    .map((invite) => {
      const created = formatLedgerDate(invite.createdAt);
      return `
        <div class="refer-row">
          <div>${invite.inviteeEmail || "-"}</div>
          <div>${invite.status || "-"}</div>
          <div>${created}</div>
        </div>
      `;
    })
    .join("");
};

const fetchReferralData = async () => {
  const email = state.user && state.user.email;
  if (!email) return;
  try {
    const response = await fetch(`/api/referrals?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      console.error("Referral API error:", data);
      return;
    }
    state.referral.stats = data.stats || { total: 0, pending: 0, rewarded: 0 };
    state.referral.invites = Array.isArray(data.invites) ? data.invites : [];
    renderReferralStats();
    renderReferralList();
  } catch (err) {
    console.error("Could not fetch referral data:", err);
  }
};

const fetchPayPalConfig = async () => {
  if (state.paypalClientId) {
    return {
      clientId: state.paypalClientId,
      plans: state.paypalPlans,
    };
  }

  const response = await fetch("/api/paypal");
  const data = await response.json();
  if (!response.ok || !data.success || !data.clientId) {
    throw new Error(data.error || data.hint || "PayPal is not configured.");
  }

  state.paypalClientId = data.clientId;
  const personalPlans = data.plans && data.plans.personal ? data.plans.personal : {};
  const businessPlans = data.plans && data.plans.business ? data.plans.business : {};
  state.paypalPlans = {
    monthly: (data.plans && data.plans.monthly) || personalPlans.monthly || "",
    annual: (data.plans && data.plans.annual) || personalPlans.annual || "",
    personal: {
      monthly: personalPlans.monthly || (data.plans && data.plans.monthly) || "",
      annual: personalPlans.annual || (data.plans && data.plans.annual) || "",
    },
    business: {
      monthly: businessPlans.monthly || "",
      annual: businessPlans.annual || "",
    },
  };
  return {
    clientId: state.paypalClientId,
    plans: state.paypalPlans,
  };
};

const ensurePayPalSdkLoaded = async () => {
  if (window.paypal && typeof window.paypal.Buttons === "function") {
    state.paypalSdkLoaded = true;
    return;
  }

  if (!paypalSdkPromise) {
    paypalSdkPromise = (async () => {
      const config = await fetchPayPalConfig();
      const src =
        "https://www.paypal.com/sdk/js" +
        `?client-id=${encodeURIComponent(config.clientId)}` +
        "&currency=USD&intent=capture&components=buttons";

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load PayPal SDK."));
        document.head.appendChild(script);
      });
    })();
  }

  try {
    await paypalSdkPromise;
  } catch (err) {
    paypalSdkPromise = null;
    throw err;
  }
  state.paypalSdkLoaded = !!(window.paypal && typeof window.paypal.Buttons === "function");
};

const ensurePayPalSubscriptionSdkLoaded = async () => {
  if (window.paypalSub && typeof window.paypalSub.Buttons === "function") {
    state.paypalSubSdkLoaded = true;
    return;
  }

  if (!paypalSubSdkPromise) {
    paypalSubSdkPromise = (async () => {
      const config = await fetchPayPalConfig();
      const src =
        "https://www.paypal.com/sdk/js" +
        `?client-id=${encodeURIComponent(config.clientId)}` +
        "&currency=USD&vault=true&intent=subscription&components=buttons";

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.setAttribute("data-namespace", "paypalSub");
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load PayPal Subscription SDK."));
        document.head.appendChild(script);
      });
    })();
  }

  try {
    await paypalSubSdkPromise;
  } catch (err) {
    paypalSubSdkPromise = null;
    throw err;
  }

  state.paypalSubSdkLoaded = !!(window.paypalSub && typeof window.paypalSub.Buttons === "function");
};

const closeTopupModal = () => {
  el("topupModal").classList.add("hidden");
};

const closeSubscriptionModal = () => {
  el("subModal").classList.add("hidden");
};

const getSelectedUpgradeTier = () => {
  const activePlan = document.querySelector(".upgrade-plan-card.active");
  return activePlan ? activePlan.dataset.tier : "free";
};

const getSelectedBillingCycle = () => {
  const activeCycle = document.querySelector(".cycle-btn.active");
  return activeCycle ? activeCycle.dataset.cycle : "monthly";
};

const updateUpgradePricing = () => {
  const cycle = getSelectedBillingCycle();
  const personal = document.querySelector('.upgrade-plan-card[data-tier="personal"] .plan-price');
  const business = document.querySelector('.upgrade-plan-card[data-tier="business"] .plan-price');
  if (personal) {
    personal.textContent = cycle === "annual" ? "$390 / year" : "$39 / month";
  }
  if (business) {
    business.textContent = cycle === "annual" ? "$990 / year" : "$99 / month";
  }
};

const renderPayPalSubscriptionButton = async () => {
  const container = el("paypalSubContainer");
  const hint = el("paypalSubHint");
  const email = state.user && state.user.email;
  const tier = getSelectedUpgradeTier();
  const billingCycle = getSelectedBillingCycle();
  const planLabel = `${tier}_${billingCycle}`;
  const upgradeHint = el("upgradeHint");
  if (upgradeHint) {
    if (tier === "business") {
      upgradeHint.textContent =
        "Business includes unlimited orders, email notifications, 2-month retention, and 3 seats.";
    } else if (tier === "personal") {
      upgradeHint.textContent =
        "Personal includes unlimited orders, email notifications, 7-day retention, and 1 seat.";
    } else {
      const todayUsed = Number((state.usage && state.usage.ordersToday) || 0);
      const weekUsed = Number((state.usage && state.usage.ordersThisWeek) || 0);
      upgradeHint.textContent = `Free plan: 2 orders/day, 10 orders/week, 12-hour retention. Usage: ${todayUsed}/2 today, ${weekUsed}/10 this week.`;
    }
  }

  if (!container || !hint) return;

  if (!email) {
    container.innerHTML = "";
    hint.textContent = "Please sign in before starting a subscription.";
    return;
  }

  if (tier === "free") {
    container.innerHTML = "";
    hint.textContent = "Free plan is active instantly. Paid checkout is not required.";
    if (upgradeHint) {
      upgradeHint.textContent = `Free plan limits: 2 orders/day, 10 orders/week, storage ${formatRetention(
        12
      )}.`;
    }
    return;
  }

  hint.textContent = "Loading PayPal subscription checkout...";

  try {
    await fetchPayPalConfig();
  } catch (err) {
    container.innerHTML = "";
    hint.textContent = err.message || "PayPal configuration is missing.";
    return;
  }

  const planId =
    (state.paypalPlans[tier] && state.paypalPlans[tier][billingCycle]) ||
    (tier === "personal" ? state.paypalPlans[billingCycle] : "");
  if (!planId) {
    container.innerHTML = "";
    hint.textContent = `PayPal plan ID missing for ${tier} ${billingCycle}.`;
    if (tier === "business") {
      hint.textContent += " Set PAYPAL_PLAN_ID_BUSINESS_MONTHLY/ANNUAL on server.";
    }
    return;
  }

  try {
    await ensurePayPalSubscriptionSdkLoaded();
  } catch (err) {
    container.innerHTML = "";
    hint.textContent = err.message || "Could not load PayPal subscription checkout.";
    return;
  }

  if (!window.paypalSub || typeof window.paypalSub.Buttons !== "function") {
    container.innerHTML = "";
    hint.textContent = "PayPal subscription checkout is unavailable in this browser.";
    return;
  }

  container.innerHTML = "";
  hint.textContent = `Plan: ${planLabel} (${planId}). Complete PayPal approval to activate.`;

  window.paypalSub
    .Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        label: "subscribe",
      },
      createSubscription: (data, actions) =>
        actions.subscription.create({
          plan_id: planId,
        }),
      onApprove: async (data) => {
        const response = await fetch("/api/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "activate_paypal",
            email,
            tier,
            billingCycle,
            paypalSubscriptionId: data.subscriptionID,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || result.hint || "Could not activate subscription.");
        }

        state.subscribed = true;
        state.planTier = tier;
        saveState();
        closeSubscriptionModal();
        await Promise.all([fetchSubscriptionStatus(), fetchReferralData(), fetchNotificationsFromDB()]);
        if (result.referralReward) {
          alert("Subscription activated. Referral bonus applied (+1 month for both users).");
        } else {
          alert("Subscription activated via PayPal.");
        }
      },
      onCancel: () => {
        hint.textContent = "Subscription checkout was cancelled.";
      },
      onError: (err) => {
        console.error("PayPal subscription error:", err);
        alert(err && err.message ? err.message : "Subscription failed.");
      },
    })
    .render("#paypalSubContainer")
    .catch((err) => {
      console.error("PayPal subscription render error:", err);
      hint.textContent = "Could not render PayPal subscription button.";
    });
};

const openSubscriptionModal = async () => {
  document.querySelectorAll(".upgrade-plan-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.tier === state.planTier);
  });
  updateUpgradePricing();
  el("subModal").classList.remove("hidden");
  await renderPayPalSubscriptionButton();
};

const renderPayPalTopupButton = async () => {
  const container = el("paypalTopupContainer");
  const hint = el("paypalTopupHint");
  const email = state.user && state.user.email;
  const amount = Number(el("leafTopupAmount").value || state.topupAmount || 0);
  state.topupAmount = amount;

  el("leafTopupSummary").textContent = `Top-up amount: ${formatMoney(amount)} = ${amount.toFixed(2)} Leaf`;

  if (!email) {
    container.innerHTML = "";
    hint.textContent = "Please sign in before topping up Leaf.";
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    container.innerHTML = "";
    hint.textContent = "Enter an amount greater than 0.";
    return;
  }

  hint.textContent = "Loading PayPal checkout...";

  try {
    await ensurePayPalSdkLoaded();
  } catch (err) {
    container.innerHTML = "";
    hint.textContent = err.message || "Could not load PayPal checkout.";
    return;
  }

  if (!window.paypal || typeof window.paypal.Buttons !== "function") {
    container.innerHTML = "";
    hint.textContent = "PayPal checkout is unavailable in this browser.";
    return;
  }

  container.innerHTML = "";
  hint.textContent = "Use a PayPal Sandbox buyer account (or sandbox card) to complete top-up.";

  window.paypal
    .Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        label: "paypal",
      },
      createOrder: async () => {
        const createResponse = await fetch("/api/paypal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_order",
            amount: Number(amount.toFixed(2)),
            email,
          }),
        });
        const createData = await createResponse.json();
        if (!createResponse.ok || !createData.success || !createData.orderId) {
          throw new Error(createData.error || createData.hint || "Could not create PayPal order.");
        }
        return createData.orderId;
      },
      onApprove: async (data) => {
        const captureResponse = await fetch("/api/paypal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "capture_order",
            orderId: data.orderID,
            email,
          }),
        });
        const captureData = await captureResponse.json();
        if (!captureResponse.ok || !captureData.success) {
          throw new Error(captureData.error || captureData.hint || "Could not capture PayPal payment.");
        }

        await fetchWalletFromDB();
        closeTopupModal();
        alert(`Leaf top-up successful: +${formatMoney(captureData.amount)}.`);
      },
      onCancel: () => {
        hint.textContent = "Payment was cancelled.";
      },
      onError: (err) => {
        console.error("PayPal top-up error:", err);
        alert(err && err.message ? err.message : "PayPal top-up failed.");
      },
    })
    .render("#paypalTopupContainer")
    .catch((err) => {
      console.error("PayPal render error:", err);
      hint.textContent = "Could not render PayPal button.";
    });
};

const openTopupModal = async () => {
  el("topupModal").classList.remove("hidden");
  el("leafTopupAmount").value = String(state.topupAmount || 20);
  await renderPayPalTopupButton();
};

const topupLeaf = async () => {
  const email = state.user && state.user.email;
  if (!email) {
    alert("Please sign in first.");
    return;
  }
  await openTopupModal();
};

const payOrdersWithLeaf = async (orderIds) => {
  const email = state.user && state.user.email;
  if (!email) {
    alert("Please sign in first.");
    return false;
  }

  const selected = orderIds
    .map((id) => state.orders.find((order) => order.id === id))
    .filter(Boolean);
  if (!selected.length) {
    alert("No valid orders selected.");
    return false;
  }
  const unsynced = selected.filter((order) => !order.dbId);
  if (unsynced.length) {
    alert("Some selected orders are not synced to database yet. Please wait and try again.");
    return false;
  }

  try {
    const response = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pay_orders",
        email,
        orderNumbers: selected.map((order) => order.id),
      }),
    });
    const data = await response.json();

    if (!data.success) {
      if (data.code === "INSUFFICIENT_BALANCE") {
        alert(
          `Not enough Leaf. Need ${formatMoney(data.missingAmount || 0)} more.\nTop up and try again.`
        );
      } else {
        alert(data.error || "Leaf payment failed.");
      }
      return false;
    }

    await Promise.all([fetchOrdersFromDB(), fetchWalletFromDB(), fetchNotificationsFromDB()]);
    alert(`Payment successful for ${data.paidOrders.length} order(s).`);
    return true;
  } catch (err) {
    console.error("Leaf payment failed:", err);
    alert("Could not complete Leaf payment.");
    return false;
  }
};

// Helper function to fetch media from Dropbox/Google Drive links
const fetchMediaFromLink = async (link) => {
  if (!link || (!link.includes('dropbox.com') && !link.includes('drive.google.com'))) {
    console.log('Not a Dropbox/Drive link:', link);
    return null;
  }

  console.log('Fetching media from link:', link);

  try {
    const response = await fetch('/api/fetch-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link })
    });

    const data = await response.json();
    console.log('Fetch media response:', data);

    if (data.success && data.files && data.files.length > 0) {
      console.log(`Successfully fetched ${data.files.length} files`);
      return data.files;
    } else {
      console.error('Fetch media failed:', data.error || 'No files returned');
      if (data.error) {
        alert(`Could not fetch media: ${data.error}`);
      }
    }
  } catch (err) {
    console.error('Failed to fetch media:', err);
    alert(`Error fetching media: ${err.message}`);
  }

  return null;
};

const createOrder = async () => {
  const features = state.planFeatures || {};
  const usage = state.usage || { ordersToday: 0, ordersThisWeek: 0 };
  if (
    state.planTier === "free" &&
    Number.isFinite(Number(features.dailyOrderLimit)) &&
    Number(usage.ordersToday || 0) >= Number(features.dailyOrderLimit)
  ) {
    alert("Free plan daily limit reached (2 orders/day). Upgrade to continue.");
    await openSubscriptionModal();
    return;
  }
  if (
    state.planTier === "free" &&
    Number.isFinite(Number(features.weeklyOrderLimit)) &&
    Number(usage.ordersThisWeek || 0) >= Number(features.weeklyOrderLimit)
  ) {
    alert("Free plan weekly limit reached (10 orders/week). Upgrade to continue.");
    await openSubscriptionModal();
    return;
  }

  const rows = Array.from(el("lineItems").children);
  const items = rows.map((row) => {
    const typeInput = row.querySelector('[data-field="type"]');
    const countInput = row.querySelector('[data-field="count"]');
    const clientIdInput = row.querySelector('[data-field="clientId"]');
    const clientEmailInput = row.querySelector('[data-field="clientEmail"]');
    const linkInput = row.querySelector('[data-field="link"]');
    return {
      type: typeInput ? typeInput.value.trim() : "",
      count: Number((countInput && countInput.value) || 0),
      clientId: clientIdInput ? clientIdInput.value.trim() : "",
      clientEmail: clientEmailInput ? clientEmailInput.value.trim() : "",
      link: linkInput ? linkInput.value.trim() : "",
      unitPrice: Number(row.dataset.unitPrice || 0),
    };
  });

  const now = new Date();
  const createdAt = formatLocalDateTime(now);
  const validItems = items.filter((item) => item.type && item.count);

  if (!validItems.length) {
    alert("Please enter at least one order name and quantity.");
    return;
  }

  if (state.planTier === "free") {
    const dailyLimit = Number((features && features.dailyOrderLimit) || 2);
    const weeklyLimit = Number((features && features.weeklyOrderLimit) || 10);
    const availableDaily = Math.max(0, dailyLimit - Number((usage && usage.ordersToday) || 0));
    const availableWeekly = Math.max(0, weeklyLimit - Number((usage && usage.ordersThisWeek) || 0));
    const available = Math.min(availableDaily, availableWeekly);
    if (validItems.length > available) {
      alert(
        `Free plan remaining quota is ${available} order(s) right now. Reduce rows or upgrade plan.`
      );
      await openSubscriptionModal();
      return;
    }
  }

  // Disable button while saving
  const btnCreate = el("btnCreate");
  btnCreate.disabled = true;
  btnCreate.textContent = "Fetching media...";

  const newOrders = [];

  for (const item of validItems) {
    const displayName = ensureDatePrefix(item.type, createdAt);
    const amount = Number((item.count * (item.unitPrice || 0)).toFixed(2));
    const clientId = item.clientId || `CLI-${Math.floor(Math.random() * 90000 + 10000)}`;

    // Fetch media files if link is provided
    let mediaFiles = null;
    if (item.link) {
      btnCreate.textContent = `Fetching media from ${item.link.includes('dropbox') ? 'Dropbox' : 'Google Drive'}...`;
      mediaFiles = await fetchMediaFromLink(item.link);
    }

    btnCreate.textContent = "Saving...";

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderName: displayName,
          totalCount: item.count,
          totalAmount: amount,
          clientId,
          clientName: item.clientEmail || (state.user && state.user.email) || "client@email.com",
          clientEmail: item.clientEmail || "",
          userEmail: (state.user && state.user.email) || "client@email.com",
          items: [{ ...item, sourceLink: item.link }],
        }),
      });

      const data = await response.json();

      if (data.success && data.order) {
        // Map API response back to local format
        newOrders.push({
          id: data.order.orderNumber,
          name: data.order.orderName,
          items: (data.order.items || []).map((i) => ({
            type: i.type,
            count: Number(i.count),
            link: i.sourceLink || i.source_link || i.link || "",
            unitPrice: Number(i.unitPrice),
          })),
          mediaFiles: mediaFiles || [], // Store fetched media files
          totalCount: Number(data.order.totalCount),
          totalAmount: Number(data.order.totalAmount),
          status: data.order.status.toLowerCase(),
          createdAt,
          clientId: data.order.clientId || clientId,
          clientName: data.order.clientName || (state.user && state.user.email),
          dbId: data.order.id,
        });
      } else {
        if (response.status === 403 && data.code && String(data.code).startsWith("FREE_PLAN_")) {
          state.planTier = data.tier || state.planTier;
          state.planFeatures = data.planFeatures || state.planFeatures;
          state.usage = data.usage || state.usage;
          updatePlanBadge();
          await openSubscriptionModal();
          alert(data.error || "Free plan limit reached. Upgrade to continue.");
          btnCreate.disabled = false;
          btnCreate.textContent = "Apply";
          return;
        }
        console.error("API error:", data);
        alert("Could not save to database. Order saved locally and will sync when the connection is restored.");
        // Fallback to local-only order
        newOrders.push({
          id: `ORD-${Math.floor(Math.random() * 9000 + 1000)}`,
          name: displayName,
          items: [item],
          mediaFiles: mediaFiles || [],
          totalCount: item.count,
          totalAmount: amount,
          status: "unpaid",
          createdAt,
          clientId,
          clientName: item.clientEmail || (state.user && state.user.email) || "client@email.com",
        });
      }
    } catch (err) {
      console.error("Failed to save order to database:", err);
      alert("Could not connect to server. Order saved locally and will sync when the connection is restored.");
      // Fallback to local-only order
      newOrders.push({
        id: `ORD-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: displayName,
        items: [item],
        mediaFiles: mediaFiles || [],
        totalCount: item.count,
        totalAmount: amount,
        status: "unpaid",
        createdAt,
        clientId,
        clientName: item.clientEmail || (state.user && state.user.email) || "client@email.com",
      });
    }
  }

  state.orders = [...newOrders, ...state.orders];
  state.usage.ordersToday = Number(state.usage.ordersToday || 0) + newOrders.length;
  state.usage.ordersThisWeek = Number(state.usage.ordersThisWeek || 0) + newOrders.length;
  saveState();
  renderOrders();
  fetchNotificationsFromDB();

  renderLineItems();
  switchTab("overview");

  btnCreate.disabled = false;
  btnCreate.textContent = "Apply";
};

const switchTab = (tab) => {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
};

const applyAuthenticatedSession = async (data) => {
  if (!data || !data.user) return false;

  state.orders = [];
  state.payments = [];
  state.leafBalance = 0;
  state.customClientIds = [];
  state.notifications = { items: [], unread: 0, open: false };
  state.referral = { stats: { total: 0, pending: 0, rewarded: 0 }, invites: [] };
  localStorage.removeItem(STORAGE_KEY);

  state.user = data.user;
  state.subscribed = Boolean(data.subscription);
  state.planTier = data.tier || (data.subscription ? "personal" : "free");
  state.planFeatures = data.planFeatures || null;
  state.usage = data.usage || { ordersToday: 0, ordersThisWeek: 0 };
  showApp(data.user);

  await fetchOrdersFromDB();
  await fetchWalletFromDB();
  await Promise.all([fetchSubscriptionStatus(), fetchReferralData(), fetchNotificationsFromDB()]);

  return true;
};

const clearClientSessionState = () => {
  state.user = null;
  state.orders = [];
  state.payments = [];
  state.leafBalance = 0;
  state.customClientIds = [];
  state.subscribed = false;
  state.planTier = "free";
  state.planFeatures = null;
  state.usage = { ordersToday: 0, ordersThisWeek: 0 };
  state.referral = { stats: { total: 0, pending: 0, rewarded: 0 }, invites: [] };
  localStorage.removeItem(STORAGE_KEY);
  el("loginScreen").classList.remove("hidden");
  el("appScreen").classList.add("hidden");
  el("userBadge").classList.add("hidden");
  if (el("btnNotifications")) {
    el("btnNotifications").classList.add("hidden");
  }
  state.notifications = { items: [], unread: 0, open: false };
  renderNotifications();
  if (el("loginCode")) {
    el("loginCode").value = "";
  }
  setLoginChallengeActive(false);
};

const getAuthTokenFromUrl = () => {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get("auth_token") || "").trim();
  } catch (err) {
    return "";
  }
};

const clearAuthTokenFromUrl = () => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_token");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, next);
  } catch (err) {
    // no-op
  }
};

const verifyMagicLinkToken = async (authToken) => {
  if (!authToken) return false;
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_magic_link", token: authToken }),
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.user) {
      alert(data.error || "Sign-in link is invalid or expired.");
      return false;
    }
    await applyAuthenticatedSession(data);
    return true;
  } catch (err) {
    console.error("Magic link verification error:", err);
    alert("Could not verify sign-in link. Please try again.");
    return false;
  } finally {
    clearAuthTokenFromUrl();
  }
};

const verifyLoginCode = async () => {
  const email = String((el("loginEmail").value || "")).trim();
  const code = String((el("loginCode").value || "")).trim();
  if (!email) {
    alert("Please enter your email.");
    return false;
  }
  if (!code) {
    alert("Please enter the 6-digit sign-in code.");
    return false;
  }

  const btn = el("btnLoginCode");
  btn.disabled = true;
  btn.textContent = t("btnSigning");

  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_login_code", email, code }),
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.user) {
      alert(data.error || "Sign-in code is invalid or expired.");
      return false;
    }
    await applyAuthenticatedSession(data);
    return true;
  } catch (err) {
    console.error("Sign-in code verification error:", err);
    alert("Could not verify sign-in code. Please try again.");
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = t("btnLoginCode");
  }
};

const setLoginChallengeActive = (active) => {
  const panel = el("loginCodePanel");
  const loginBtn = el("btnLogin");
  if (!panel || !loginBtn) return;
  panel.classList.toggle("hidden", !active);
  loginBtn.textContent = active ? t("btnLoginResend") : t("btnLogin");
};

const setLoginControlsDisabled = (disabled, signInLabel) => {
  const btnLogin = el("btnLogin");
  const btnLoginCode = el("btnLoginCode");
  const loginEmail = el("loginEmail");
  const loginCode = el("loginCode");
  if (btnLogin) {
    btnLogin.disabled = Boolean(disabled);
    if (typeof signInLabel === "string" && signInLabel) {
      btnLogin.textContent = signInLabel;
    }
  }
  if (btnLoginCode) btnLoginCode.disabled = Boolean(disabled);
  if (loginEmail) loginEmail.disabled = Boolean(disabled);
  if (loginCode) loginCode.disabled = Boolean(disabled);
};

const setupEvents = () => {
  el("languageSelect").addEventListener("change", (event) => {
    setLanguage(event.target.value);
  });

  el("btnLogin").addEventListener("click", async () => {
    // If session cookie is still valid (14-day remember login), sign in directly.
    const resumed = await restoreSession();
    if (resumed) return;

    const email = el("loginEmail").value.trim();
    if (!email) {
      alert("Please enter your email.");
      return;
    }

    const btn = el("btnLogin");
    btn.disabled = true;
    btn.textContent = t("btnSigning");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_magic_link", email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setLoginChallengeActive(true);
      } else {
        alert(data.hint ? `${data.error || "Sign in failed"}\n${data.hint}` : (data.error || "Sign in failed. Please try again."));
      }
    } catch (err) {
      console.error("Login error:", err);
      alert("Authentication service is unavailable. Please try again.");
    }

    btn.disabled = false;
    btn.textContent = el("loginCodePanel").classList.contains("hidden")
      ? t("btnLogin")
      : t("btnLoginResend");
  });

  el("btnLoginCode").addEventListener("click", verifyLoginCode);
  el("loginCode").addEventListener("input", (event) => {
    const digits = String(event.target.value || "")
      .replace(/\D/g, "")
      .slice(0, 6);
    event.target.value = digits;
  });
  el("loginCode").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      verifyLoginCode();
    }
  });

  el("btnLogout").addEventListener("click", async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch (err) {
      console.error("Logout API error:", err);
    }
    clearClientSessionState();
  });

  el("btnNotifications").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleNotificationsPanel();
  });

  document.addEventListener("click", (event) => {
    const wrap = document.querySelector(".notif-wrap");
    if (!wrap || !state.notifications.open) return;
    if (!wrap.contains(event.target)) {
      state.notifications.open = false;
      renderNotifications();
    }
  });

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  el("btnAddLine").addEventListener("click", () => addLineItem());
  el("btnCreate").addEventListener("click", createOrder);

  el("orderList").addEventListener("change", (event) => {
    if (event.target.type === "checkbox") {
      const id = event.target.dataset.id;
      if (event.target.checked) {
        state.selectedOrders.add(id);
      } else {
        state.selectedOrders.delete(id);
      }
    }
  });

  el("orderList").addEventListener("click", (event) => {
    const viewId = event.target.dataset.view;
    if (viewId) {
      openGallery(viewId);
    }
  });

  el("btnCloseGallery").addEventListener("click", closeGallery);
  el("btnPrevOrder").addEventListener("click", () => stepGalleryOrder(-1));
  el("btnNextOrder").addEventListener("click", () => stepGalleryOrder(1));

  el("btnDeleteOrder").addEventListener("click", async () => {
    if (!state.activeOrderId) return;
    const order = state.orders.find((o) => o.id === state.activeOrderId);
    if (!order) return;
    if (!confirm(`Delete order "${order.name}"?`)) return;

    // Delete from database if synced
    if (order.dbId) {
      try {
        await fetch("/api/orders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNumber: order.id }),
        });
      } catch (err) {
        console.error("Failed to delete order from database:", err);
      }
    }

    state.orders = state.orders.filter((o) => o.id !== state.activeOrderId);
    state.selectedOrders.delete(state.activeOrderId);
    saveState();
    closeGallery();
    renderOrders();
  });

  el("btnPaySingle").addEventListener("click", () => {
    if (!state.activeOrderId) return;
    closeGallery();
    openPayModal([state.activeOrderId]);
  });

  el("btnBulkPay").addEventListener("click", () => {
    const ids = Array.from(state.selectedOrders);
    if (!ids.length) {
      alert("Please select orders to pay.");
      return;
    }
    openPayModal(ids);
  });

  el("btnTopupLeaf").addEventListener("click", topupLeaf);
  el("btnTopupLeafFromPay").addEventListener("click", topupLeaf);
  el("btnCloseTopup").addEventListener("click", closeTopupModal);
  el("leafTopupAmount").addEventListener("change", renderPayPalTopupButton);
  el("btnClosePay").addEventListener("click", closePayModal);
  el("btnConfirmPay").addEventListener("click", async () => {
    if (!state.payQueue.length) return;
    const paid = await payOrdersWithLeaf(state.payQueue);
    if (!paid) return;
    state.selectedOrders.clear();
    closePayModal();
  });

  el("btnCloseLightbox").addEventListener("click", closeLightbox);
  el("btnPrevLightbox").addEventListener("click", () => stepLightbox(-1));
  el("btnNextLightbox").addEventListener("click", () => stepLightbox(1));
  el("lightboxImg").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLightboxZoom();
  });
  el("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (el("lightbox").classList.contains("hidden")) return;
    if (event.key === "Escape") {
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      stepLightbox(-1);
    }
    if (event.key === "ArrowRight") {
      stepLightbox(1);
    }
  });

  el("btnOpenFeedback").addEventListener("click", () => {
    el("feedbackModal").classList.remove("hidden");
  });

  el("btnCloseFeedback").addEventListener("click", () => {
    el("feedbackModal").classList.add("hidden");
  });

  document.querySelectorAll(".upgrade-plan-card").forEach((card) => {
    card.addEventListener("click", async () => {
      document.querySelectorAll(".upgrade-plan-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      if (!el("subModal").classList.contains("hidden")) {
        await renderPayPalSubscriptionButton();
      }
    });
  });

  document.querySelectorAll(".cycle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".cycle-btn").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      updateUpgradePricing();
      if (!el("subModal").classList.contains("hidden")) {
        await renderPayPalSubscriptionButton();
      }
    });
  });

  el("btnCloseSub").addEventListener("click", () => {
    closeSubscriptionModal();
  });

  el("btnOpenUpgrade").addEventListener("click", async () => {
    await openSubscriptionModal();
  });

  el("btnOpenRefer").addEventListener("click", async () => {
    el("referModal").classList.remove("hidden");
    await fetchReferralData();
  });

  el("btnCloseRefer").addEventListener("click", () => {
    el("referModal").classList.add("hidden");
  });

  el("btnCloseClientIdModal").addEventListener("click", closeClientIdModal);
  el("btnSaveClientId").addEventListener("click", saveNewClientId);
  el("clientIdModal").addEventListener("click", (event) => {
    if (event.target.id === "clientIdModal") {
      closeClientIdModal();
    }
  });
  el("newClientIdInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveNewClientId();
    }
    if (event.key === "Escape") {
      closeClientIdModal();
    }
  });

  el("btnSendInvite").addEventListener("click", async () => {
    const inviteeEmail = (el("referInviteEmail").value || "").trim().toLowerCase();
    if (!inviteeEmail) {
      alert("Please enter invitee email.");
      return;
    }
    if (!state.user || !state.user.email) {
      alert("Please sign in first.");
      return;
    }

    const btn = el("btnSendInvite");
    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          referrerEmail: state.user.email,
          inviteeEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.error || data.hint || "Could not send invite.");
      } else {
        el("referInviteEmail").value = "";
        await Promise.all([fetchReferralData(), fetchNotificationsFromDB()]);
        alert("Invite sent.");
      }
    } catch (err) {
      console.error("Referral invite failed:", err);
      alert("Could not send invite.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send invite";
    }
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      el("feedbackMessage").value = chip.dataset.topic + ": ";
    });
  });

  el("btnFeedback").addEventListener("click", () => {
    const email = el("feedbackEmail").value.trim();
    const message = el("feedbackMessage").value.trim();
    if (!email) {
      alert("Please enter your email.");
      return;
    }
    if (!message) {
      alert("Please enter a message.");
      return;
    }
    el("feedbackEmail").value = "";
    el("feedbackMessage").value = "";
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    el("feedbackModal").classList.add("hidden");
    alert("Thanks for your feedback! We'll get back to you soon.");
  });

  el("orderSearch").addEventListener("input", () => renderOrders());
  el("orderStatusFilter").addEventListener("change", () => renderOrders());

  el("btnExportOrders").addEventListener("click", () => {
    const rows = [["Order ID", "Name", "Client ID", "Client Email", "Quantity", "Amount", "Status", "Created"]];
    state.orders.forEach((o) => {
      rows.push([
        o.id,
        `"${o.name}"`,
        o.clientId || "",
        o.clientName || "",
        o.totalCount,
        getOrderAmount(o).toFixed(2),
        o.status,
        o.createdAt,
      ]);
    });
    downloadCSV(rows, "renpay-orders.csv");
  });

  el("btnExportPayments").addEventListener("click", () => {
    const rows = [["Ledger ID", "Date", "Type", "Description", "Amount", "Balance After"]];
    state.payments.forEach((p) => {
      rows.push([
        p.id,
        formatLedgerDate(p.createdAt || p.date),
        p.type || "",
        `"${p.description || ""}"`,
        Number(p.amount || 0).toFixed(2),
        Number(p.balanceAfter || 0).toFixed(2),
      ]);
    });
    downloadCSV(rows, "renpay-wallet-ledger.csv");
  });
};

const syncLocalOrderToDB = async (order) => {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderName: order.name,
        totalCount: order.totalCount,
        totalAmount: getOrderAmount(order),
        clientId: order.clientId,
        clientName: order.clientName || (state.user && state.user.email) || "client@email.com",
        clientEmail: order.clientName || "",
        userEmail: (state.user && state.user.email) || order.clientName || "client@email.com",
        items: order.items || [],
      }),
    });

    const data = await response.json();
    if (data.success && data.order) {
      // Update local order with DB info
      order.id = data.order.orderNumber;
      order.dbId = data.order.id;
      return true;
    }
  } catch (err) {
    console.error("Failed to sync local order to database:", err);
  }
  return false;
};

const fetchOrdersFromDB = async () => {
  try {
    const email = state.user && state.user.email;
    if (!email) {
      state.orders = [];
      renderOrders();
      return;
    }
    const url = `/api/orders?userEmail=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success && Array.isArray(data.orders)) {
      if (data.tier) {
        state.planTier = data.tier;
      }
      if (data.planFeatures) {
        state.planFeatures = data.planFeatures;
      }
      updatePlanBadge();
      const dbOrders = data.orders.map((o) => {
        // Find existing order in state to preserve mediaFiles
        const existingOrder = state.orders.find(existing => existing.id === o.orderNumber);

        return {
          id: o.orderNumber,
          name: o.orderName,
          items: (o.items || []).map((i) => ({
            type: i.type,
            count: Number(i.count),
            link: i.sourceLink || i.source_link || i.link || "",
            unitPrice: Number(i.unitPrice),
          })),
          mediaFiles: existingOrder?.mediaFiles || [], // Preserve mediaFiles if exists
          totalCount: Number(o.totalCount),
          totalAmount: Number(o.totalAmount),
          status: o.status.toLowerCase(),
          createdAt: new Date(o.createdAt).toISOString().replace("T", " ").slice(0, 16),
          clientId: o.clientId || "",
          clientName: o.clientName || "",
          dbId: o.id,
        };
      });

      // Find local-only orders that need to be synced to DB
      const dbIds = new Set(dbOrders.map((o) => o.id));
      const localOnly = state.orders.filter((o) => !dbIds.has(o.id) && !o.dbId);

      // Push local-only orders to database
      for (const localOrder of localOnly) {
        await syncLocalOrderToDB(localOrder);
      }

      // After syncing, re-fetch to get the complete list
      if (localOnly.length > 0) {
        const refreshResponse = await fetch(url);
        const refreshData = await refreshResponse.json();
        if (refreshData.success && Array.isArray(refreshData.orders)) {
          const allDbOrders = refreshData.orders.map((o) => {
            // Find existing order in state to preserve mediaFiles
            const existingOrder = state.orders.find(existing => existing.id === o.orderNumber);

            return {
              id: o.orderNumber,
              name: o.orderName,
              items: (o.items || []).map((i) => ({
                type: i.type,
                count: Number(i.count),
                link: i.sourceLink || i.source_link || i.link || "",
                unitPrice: Number(i.unitPrice),
              })),
              mediaFiles: existingOrder?.mediaFiles || [], // Preserve mediaFiles if exists
              totalCount: Number(o.totalCount),
              totalAmount: Number(o.totalAmount),
              status: o.status.toLowerCase(),
              createdAt: new Date(o.createdAt).toISOString().replace("T", " ").slice(0, 16),
              clientId: o.clientId || "",
              clientName: o.clientName || "",
              dbId: o.id,
            };
          });
          state.orders = allDbOrders;
        }
      } else {
        state.orders = dbOrders;
      }

      saveState();
      renderOrders();
    }
  } catch (err) {
    console.error("Could not fetch orders from database:", err);
  }
};

const showApp = (user) => {
  el("sellerName").textContent = user.name || user.email;
  updatePlanBadge();
  el("userBadge").textContent = user.email;
  el("userBadge").classList.remove("hidden");
  if (el("btnNotifications")) {
    el("btnNotifications").classList.remove("hidden");
  }
  el("loginScreen").classList.add("hidden");
  el("appScreen").classList.remove("hidden");
  renderNotifications();
};

const restoreSession = async () => {
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "session" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.user) return false;
    await applyAuthenticatedSession(data);
    return true;
  } catch (err) {
    console.error("Failed to restore session:", err);
    return false;
  }
};

const init = async () => {
  loadLanguage();
  // Don't load localStorage on init - we'll fetch from database instead
  // This prevents showing the wrong user's data
  renderOrders();
  renderPayments();
  renderLineItems();
  renderNotifications();
  setupEvents();
  setLoginChallengeActive(false);
  setLoginControlsDisabled(true, t("btnSigning"));
  applyLanguage();

  const authToken = getAuthTokenFromUrl();
  if (authToken) {
    const ok = await verifyMagicLinkToken(authToken);
    if (!ok) {
      await restoreSession();
    }
    setLoginControlsDisabled(false);
    return;
  }

  await restoreSession();
  setLoginControlsDisabled(false);
};

init();
