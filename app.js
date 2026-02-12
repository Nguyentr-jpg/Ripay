const STORAGE_KEY = "renpay-data-v1";

const SESSION_KEY = "renpay-session";

const state = {
  user: null, // { id, email, name, role }
  subscribed: false,
  orders: [],
  payments: [],
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
      id: "PAY-5001",
      date: "2026-02-04",
      status: "Paid",
      customerId: "CUS-84921",
      orderName: "20260204 - Villa 78 - Photos",
      orderId: "ORD-1002",
      amount: 8,
    },
  ],
});

const loadState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const data = seedData();
    state.orders = data.orders;
    state.payments = data.payments;
    state.subscribed = false;
    return;
  }
  try {
    const data = JSON.parse(raw);
    state.orders = data.orders || [];
    state.payments = data.payments || [];
    state.subscribed = Boolean(data.subscribed);
  } catch (err) {
    console.error(err);
  }
};

const saveState = () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      orders: state.orders,
      payments: state.payments,
      subscribed: state.subscribed,
    })
  );
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
    list.innerHTML = `<div class="payment-row"><div>No payments yet.</div><div></div><div></div><div></div><div></div></div>`;
    return;
  }

  state.payments
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((payment) => {
      const row = document.createElement("div");
      row.className = "payment-row";
      row.innerHTML = `
        <div>${payment.date}</div>
        <div>${payment.status}</div>
        <div>${payment.customerId}</div>
        <div>$${Number(payment.amount || 0).toFixed(2)}</div>
        <div>${payment.orderId}</div>
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

const renderOrderDetail = (order) => {
  const detail = el("orderDetail");
  const amount = getOrderAmount(order);
  const itemsSummary = order.items
    ? order.items.map((i) => `${i.type} (x${i.count})`).join(", ")
    : `${order.totalCount} items`;

  detail.innerHTML = `
    <div class="order-detail-item">
      <div class="detail-label">Order ID</div>
      <div class="detail-value">${order.id}</div>
    </div>
    <div class="order-detail-item">
      <div class="detail-label">Client</div>
      <div class="detail-value">${order.clientName || order.clientId || "—"}</div>
    </div>
    <div class="order-detail-item">
      <div class="detail-label">Items</div>
      <div class="detail-value">${itemsSummary}</div>
    </div>
    <div class="order-detail-item">
      <div class="detail-label">Amount</div>
      <div class="detail-value">$${amount.toFixed(2)}</div>
    </div>
    <div class="order-detail-item">
      <div class="detail-label">Status</div>
      <div class="detail-value">${formatStatus(order.status)}</div>
    </div>
    <div class="order-detail-item">
      <div class="detail-label">Created</div>
      <div class="detail-value">${order.createdAt}</div>
    </div>
  `;
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
      const src = file.previewUrl || file.downloadUrl || file.url || file.thumbnailUrl;
      const name = file.name || getFileNameFromUrl(src);

      if (src) {
        const thumb = file.thumbnailUrl || src;
        item.style.backgroundImage = `url('${thumb}')`;
        item.dataset.src = src;
        item.dataset.fileName = name;
        item.dataset.index = String(lightboxItems.length);
        lightboxItems.push({ src, name });
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

const openGallery = async (orderId) => {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;

  state.activeOrderId = orderId;
  el("galleryTitle").textContent = order.name;
  renderOrderDetail(order);
  el("galleryModal").classList.remove("hidden");

  const links = order.items
    ? order.items
        .map((item) => item.link || item.sourceLink || item.source_link)
        .filter(Boolean)
    : [];
  const needsRefresh =
    Array.isArray(order.mediaFiles) &&
    order.mediaFiles.length > 0 &&
    order.mediaFiles.every((file) => {
      const src = file.previewUrl || file.downloadUrl || file.url || "";
      return !src || src.startsWith("data:image/");
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

const setLightboxIndex = (index) => {
  const items = state.lightbox.items;
  if (!items.length) return;
  const count = items.length;
  const nextIndex = ((index % count) + count) % count;
  state.lightbox.index = nextIndex;

  const current = items[nextIndex];
  el("lightboxImg").src = current.src;
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
  const total = orderIds.reduce((sum, id) => {
    const order = state.orders.find((o) => o.id === id);
    return sum + (order ? getOrderAmount(order) : 0);
  }, 0);
  const count = orderIds.length;
  el("payTotal").textContent = `Total: $${total.toFixed(2)} for ${count} order${count > 1 ? "s" : ""}`;
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
  el("payName").value = "";
  el("payCard").value = "";
  el("payExp").value = "";
  el("payCvc").value = "";
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

const markPaid = async (orderIds) => {
  const today = new Date().toISOString().slice(0, 10);

  for (const id of orderIds) {
    const order = state.orders.find((o) => o.id === id);
    if (!order || order.status === "paid") continue;
    order.status = "paid";
    const amount = Number(getOrderAmount(order).toFixed(2));

    state.payments.push({
      id: `PAY-${Math.floor(Math.random() * 90000 + 10000)}`,
      date: today,
      status: "Paid",
      customerId: `CUS-${Math.floor(Math.random() * 90000 + 10000)}`,
      orderId: order.id,
      amount,
    });

    // Sync status to database
    if (order.dbId) {
      try {
        await fetch("/api/orders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber: order.id,
            status: "PAID",
            paidAt: new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.error("Failed to sync payment status to database:", err);
      }
    }
  }

  saveState();
  renderOrders();
  renderPayments();
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
        localStorage.removeItem(STORAGE_KEY);

        state.user = data.user;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
        showApp(data.user);

        // Fetch current user's orders from database
        await fetchOrdersFromDB();
      } else {
        alert(data.error || "Sign in failed. Please try again.");
      }
    } catch (err) {
      console.error("Login error:", err);
      // Fallback: allow offline login with email only
      // Clear previous user's data
      state.orders = [];
      state.payments = [];
      localStorage.removeItem(STORAGE_KEY);

      const fallbackUser = { id: null, email, name: email.split("@")[0], role: "CLIENT" };
      state.user = fallbackUser;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fallbackUser));
      showApp(fallbackUser);
    }

    btn.disabled = false;
    btn.textContent = "Sign in";
  });

  el("btnLogout").addEventListener("click", () => {
    state.user = null;
    state.orders = [];
    state.payments = [];
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

  el("btnClosePay").addEventListener("click", closePayModal);
  el("btnConfirmPay").addEventListener("click", () => {
    if (!state.payQueue.length) return;
    markPaid(state.payQueue);
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

  el("btnStartSub").addEventListener("click", () => {
    state.subscribed = true;
    saveState();
    el("subModal").classList.add("hidden");
    alert("Subscription activated. You can now create orders.");
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
    const rows = [["Payment ID", "Date", "Status", "Customer ID", "Order ID", "Amount"]];
    state.payments.forEach((p) => {
      rows.push([p.id, p.date, p.status, p.customerId, p.orderId, Number(p.amount || 0).toFixed(2)]);
    });
    downloadCSV(rows, "renpay-payments.csv");
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
    const url = email ? `/api/orders?userEmail=${encodeURIComponent(email)}` : "/api/orders";
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
  restoreSession();
  // Fetch latest orders from database in background
  fetchOrdersFromDB();
};

init();
