const STORAGE_KEY = "renpay-data-v1";

const SESSION_KEY = "renpay-session";

const state = {
  user: null, // { id, email, name, role }
  subscribed: false,
  orders: [],
  payments: [],
  leafBalance: 0,
  leafCurrency: "USD",
  paypalClientId: "",
  paypalSdkLoaded: false,
  topupAmount: 20,
  selectedOrders: new Set(),
  activeOrderId: null,
  payQueue: [],
  lightbox: {
    items: [],
    index: 0,
    zoomed: false,
  },
};

const el = (id) => document.getElementById(id);
let paypalSdkPromise = null;

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
    isPaid ? "Paid" : "Unpaid"
  }</span>`;
};

const formatMoney = (amount) => `$${Number(amount || 0).toFixed(2)}`;
const formatLedgerDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
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
      <div class="stat-label">Total orders</div>
      <div class="stat-value">${total}</div>
    </div>
    <div class="stat-card highlight">
      <div class="stat-label">Revenue collected</div>
      <div class="stat-value">$${revenue.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Unpaid orders</div>
      <div class="stat-value">${unpaid.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pending amount</div>
      <div class="stat-value">$${pending.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Leaf balance</div>
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

  renderStats();

  const filtered = getFilteredOrders();

  if (!filtered.length) {
    list.innerHTML = `<div class="order-row"><div></div><div>No orders found.</div><div></div><div></div><div></div><div></div><div></div></div>`;
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
        <button class="btn ghost" data-view="${order.id}">View</button>
      </div>
    `;

    list.appendChild(row);
  });
};

const renderPayments = () => {
  const list = el("paymentList");
  list.innerHTML = "";

  if (!state.payments.length) {
    list.innerHTML = `<div class="payment-row"><div>No wallet activity yet.</div><div></div><div></div><div></div><div></div></div>`;
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

const addLineItem = (item = { type: "", count: 0, link: "", unitPrice: 0 }) => {
  const container = el("lineItems");
  const row = document.createElement("div");
  row.className = "line-item";
  row.dataset.unitPrice = item.unitPrice || 0;
  row.innerHTML = `
    <input data-field="type" type="text" placeholder="Order name (address + service)" value="${item.type}" />
    <div class="quantity-wrap">
      <input data-field="count" type="number" min="1" placeholder="Quantity" value="${item.count || ""}" />
      <button class="price-btn" data-price>...</button>
      <div class="price-hint">Unit price: $<span>${Number(item.unitPrice || 0).toFixed(2)}</span></div>
    </div>
    <input data-field="link" type="text" placeholder="Link" value="${item.link}" />
    <button class="btn ghost" data-remove>–</button>
  `;

  const priceEl = row.querySelector("[data-price]");
  priceEl.addEventListener("click", () => {
    const current = row.dataset.unitPrice || item.unitPrice || 0;
    const next = prompt("Enter unit price (per photo/video)", current);
    if (next === null) return;
    const value = Math.max(0, Number(next));
    row.dataset.unitPrice = value;
    row.querySelector(".price-hint span").textContent = value.toFixed(2);
  });

  row.querySelector("[data-remove]").addEventListener("click", () => {
    row.remove();
  });

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
    if (!data.success) return;
    state.subscribed = Boolean(data.subscription);
    saveState();
  } catch (err) {
    console.error("Could not fetch subscription status:", err);
  }
};

const fetchPayPalConfig = async () => {
  if (state.paypalClientId) {
    return state.paypalClientId;
  }

  const response = await fetch("/api/paypal");
  const data = await response.json();
  if (!response.ok || !data.success || !data.clientId) {
    throw new Error(data.error || data.hint || "PayPal is not configured.");
  }

  state.paypalClientId = data.clientId;
  return state.paypalClientId;
};

const ensurePayPalSdkLoaded = async () => {
  if (window.paypal && typeof window.paypal.Buttons === "function") {
    state.paypalSdkLoaded = true;
    return;
  }

  if (!paypalSdkPromise) {
    paypalSdkPromise = (async () => {
      const clientId = await fetchPayPalConfig();
      const src =
        "https://www.paypal.com/sdk/js" +
        `?client-id=${encodeURIComponent(clientId)}` +
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

const closeTopupModal = () => {
  el("topupModal").classList.add("hidden");
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

    await Promise.all([fetchOrdersFromDB(), fetchWalletFromDB()]);
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
  if (!state.subscribed) {
    el("subModal").classList.remove("hidden");
    return;
  }

  const rows = Array.from(el("lineItems").children);
  const items = rows.map((row) => {
    const typeInput = row.querySelector('[data-field="type"]');
    const countInput = row.querySelector('[data-field="count"]');
    const linkInput = row.querySelector('[data-field="link"]');
    return {
      type: typeInput ? typeInput.value.trim() : "",
      count: Number((countInput && countInput.value) || 0),
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

  // Disable button while saving
  const btnCreate = el("btnCreate");
  btnCreate.disabled = true;
  btnCreate.textContent = "Fetching media...";

  const newOrders = [];

  for (const item of validItems) {
    const displayName = ensureDatePrefix(item.type, createdAt);
    const amount = Number((item.count * (item.unitPrice || 0)).toFixed(2));
    const clientId = `CLI-${Math.floor(Math.random() * 90000 + 10000)}`;

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
          clientName: (state.user && state.user.email) || "client@email.com",
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
          clientName: (state.user && state.user.email) || "client@email.com",
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
        clientName: (state.user && state.user.email) || "client@email.com",
      });
    }
  }

  state.orders = [...newOrders, ...state.orders];
  saveState();
  renderOrders();

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

const setupEvents = () => {
  el("btnLogin").addEventListener("click", async () => {
    const email = el("loginEmail").value.trim();
    if (!email) {
      alert("Please enter your email.");
      return;
    }

    const btn = el("btnLogin");
    btn.disabled = true;
    btn.textContent = "Signing in...";

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        // Clear previous user's data
        state.orders = [];
        state.payments = [];
        state.leafBalance = 0;
        localStorage.removeItem(STORAGE_KEY);

        state.user = data.user;
        state.subscribed = Boolean(data.subscription);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
        showApp(data.user);

        // Fetch current user's orders from database
        await fetchOrdersFromDB();
        await fetchWalletFromDB();
        await fetchSubscriptionStatus();
      } else {
        alert(data.error || "Sign in failed. Please try again.");
      }
    } catch (err) {
      console.error("Login error:", err);
      // Fallback: allow offline login with email only
      // Clear previous user's data
      state.orders = [];
      state.payments = [];
      state.leafBalance = 0;
      localStorage.removeItem(STORAGE_KEY);

      const fallbackUser = { id: null, email, name: email.split("@")[0], role: "CLIENT" };
      state.user = fallbackUser;
      state.subscribed = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fallbackUser));
      showApp(fallbackUser);
      await fetchWalletFromDB();
    }

    btn.disabled = false;
    btn.textContent = "Sign in";
  });

  el("btnLogout").addEventListener("click", () => {
    state.user = null;
    state.orders = [];
    state.payments = [];
    state.leafBalance = 0;
    state.subscribed = false;
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(STORAGE_KEY);
    el("loginScreen").classList.remove("hidden");
    el("appScreen").classList.add("hidden");
    el("userBadge").classList.add("hidden");
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

  document.querySelectorAll(".plan-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".plan-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });

  el("btnCloseSub").addEventListener("click", () => {
    el("subModal").classList.add("hidden");
  });

  el("btnStartSub").addEventListener("click", async () => {
    const activePlan = document.querySelector(".plan-card.active");
    const plan = activePlan ? activePlan.dataset.plan : "monthly";
    const email = state.user && state.user.email;

    if (!email) {
      alert("Please sign in first.");
      return;
    }

    const btn = el("btnStartSub");
    btn.disabled = true;
    btn.textContent = "Starting...";

    try {
      const response = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.error || "Could not start subscription.");
        return;
      }

      state.subscribed = true;
      saveState();
      el("subModal").classList.add("hidden");
      alert("Subscription activated. You can now create orders.");
    } catch (err) {
      console.error("Subscription error:", err);
      alert("Could not connect to subscription service.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Start subscription";
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
  el("sellerRole").textContent = user.role || "Account";
  el("userBadge").textContent = user.email;
  el("userBadge").classList.remove("hidden");
  el("loginScreen").classList.add("hidden");
  el("appScreen").classList.remove("hidden");
};

const restoreSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const user = JSON.parse(raw);
    if (user && user.email) {
      // Clear any stale localStorage data
      localStorage.removeItem(STORAGE_KEY);
      state.orders = [];
      state.payments = [];
      state.leafBalance = 0;

      state.user = user;
      showApp(user);
      return true;
    }
  } catch (err) {
    console.error("Failed to restore session:", err);
    sessionStorage.removeItem(SESSION_KEY);
  }
  return false;
};

const init = () => {
  // Don't load localStorage on init - we'll fetch from database instead
  // This prevents showing the wrong user's data
  renderOrders();
  renderPayments();
  renderLineItems();
  setupEvents();
  // Restore session if user was previously logged in
  const hasSession = restoreSession();
  // Fetch latest data from database in background
  if (hasSession) {
    fetchOrdersFromDB();
    fetchWalletFromDB();
    fetchSubscriptionStatus();
  }
};

init();
