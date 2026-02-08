const STORAGE_KEY = "renpay-data-v1";
const SUPABASE_URL = "https://fbshrbmmzfpiyjattxop.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZic2hyYm1temZwaXlqYXR0eG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg3NDgwNzIsImV4cCI6MjA1NDMyNDA3Mn0.zmJEFbNR1VLDVofIfPMQdVBVE6Kz2mN-JhsFGnGOrSw";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  user: null,
  session: null,
  subscribed: false,
  orders: [],
  payments: [],
  selectedOrders: new Set(),
  activeOrderId: null,
  payQueue: [],
};

const el = (id) => document.getElementById(id);

const showToast = (message, type = "error", duration = 5000) => {
  const container = el("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fadeOut");
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

const handleAuthUser = (session) => {
  if (session?.user) {
    const user = session.user;
    state.user = user.email;
    state.session = session;
    const displayName = user.user_metadata?.full_name || user.email;
    const avatar = user.user_metadata?.avatar_url;

    el("sellerName").textContent = displayName;
    el("sellerRole").textContent = user.email;
    if (avatar) {
      el("sellerAvatar").innerHTML = `<img src="${avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
    } else {
      el("sellerAvatar").textContent = displayName.charAt(0).toUpperCase();
    }
    el("userBadge").textContent = displayName;
    el("userBadge").classList.remove("hidden");
    el("loginScreen").classList.add("hidden");
    el("appScreen").classList.remove("hidden");

    loadState();
    renderOrders();
    renderPayments();
    renderLineItems();
    fetchOrdersFromDB();
  } else {
    state.user = null;
    state.session = null;
    el("loginScreen").classList.remove("hidden");
    el("appScreen").classList.add("hidden");
    el("userBadge").classList.add("hidden");
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
    <input type="text" placeholder="Order name (address + service)" value="${item.type}" />
    <div class="quantity-wrap">
      <input type="number" min="1" placeholder="Quantity" value="${item.count || ""}" />
      <button class="price-btn" data-price>...</button>
      <div class="price-hint">Unit price: $<span>${Number(item.unitPrice || 0).toFixed(2)}</span></div>
    </div>
    <input type="text" placeholder="Link" value="${item.link}" />
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

const openGallery = (orderId) => {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;

  state.activeOrderId = orderId;
  el("galleryTitle").textContent = order.name;
  renderOrderDetail(order);

  const grid = el("galleryGrid");
  grid.innerHTML = "";
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
    } else if (links[i]) {
      item.dataset.src = "";
      item.classList.add("link-only");
    }
    item.addEventListener("click", () => openLightbox(item.dataset.src));
    grid.appendChild(item);
  }

  el("galleryModal").classList.remove("hidden");
};

const closeGallery = () => {
  el("galleryModal").classList.add("hidden");
  state.activeOrderId = null;
};

const openLightbox = (src) => {
  if (src && (isImageUrl(src) || isPreviewHost(src))) {
    el("lightboxImg").src = src;
    el("lightbox").classList.remove("hidden");
    return;
  }

  alert("Link này không hiển thị được. Hãy dùng link ảnh trực tiếp hoặc link file Dropbox/Google Drive.");
};

const closeLightbox = () => {
  el("lightbox").classList.add("hidden");
  el("lightboxImg").src = "";
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
  if (typeof order.totalAmount === "number") return order.totalAmount;
  if (Array.isArray(order.items)) {
    return order.items.reduce(
      (sum, item) => sum + (item.count || 0) * (item.unitPrice || 0),
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
        const putHeaders = { "Content-Type": "application/json" };
        if (state.session?.access_token) putHeaders["Authorization"] = `Bearer ${state.session.access_token}`;
        await fetch("/api/orders", {
          method: "PUT",
          headers: putHeaders,
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

const createOrder = async () => {
  if (!state.subscribed) {
    el("subModal").classList.remove("hidden");
    return;
  }

  const rows = Array.from(el("lineItems").children);
  const items = rows.map((row) => {
    const inputs = row.querySelectorAll("input");
    return {
      type: inputs[0].value.trim(),
      count: Number(inputs[1].value || 0),
      link: inputs[2].value.trim(),
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
  btnCreate.textContent = "Saving...";

  const newOrders = [];

  for (const item of validItems) {
    const displayName = ensureDatePrefix(item.type, createdAt);
    const amount = Number((item.count * (item.unitPrice || 0)).toFixed(2));
    const clientId = `CLI-${Math.floor(Math.random() * 90000 + 10000)}`;

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          orderName: displayName,
          totalCount: item.count,
          totalAmount: amount,
          clientId,
          clientName: state.user || "client@email.com",
          userEmail: state.user || "client@email.com",
          items: [item],
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
            count: i.count,
            link: i.link || "",
            unitPrice: i.unitPrice,
          })),
          totalCount: data.order.totalCount,
          totalAmount: data.order.totalAmount,
          status: data.order.status.toLowerCase(),
          createdAt,
          clientId: data.order.clientId || clientId,
          clientName: data.order.clientName || state.user,
          dbId: data.order.id,
        });
      } else {
        const errorMsg = data.error || "Lỗi không xác định";
        console.error("API error:", data);
        showToast(`${errorMsg} — Đơn hàng đã lưu tạm trên máy.`, "warning");
        // Fallback to local-only order
        newOrders.push({
          id: `ORD-${Math.floor(Math.random() * 9000 + 1000)}`,
          name: displayName,
          items: [item],
          totalCount: item.count,
          totalAmount: amount,
          status: "unpaid",
          createdAt,
          clientId,
          clientName: state.user || "client@email.com",
        });
      }
    } catch (err) {
      console.error("Failed to save order to database:", err);
      showToast("Không kết nối được server. Đơn hàng đã lưu tạm trên máy.", "warning");
      // Fallback to local-only order
      newOrders.push({
        id: `ORD-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: displayName,
        items: [item],
        totalCount: item.count,
        totalAmount: amount,
        status: "unpaid",
        createdAt,
        clientId,
        clientName: state.user || "client@email.com",
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
  el("btnGoogleLogin").addEventListener("click", async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      showToast("Không thể đăng nhập. Vui lòng thử lại.", "error");
      console.error("Login error:", error);
    }
  });

  el("btnLogout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    state.user = null;
    state.session = null;
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
        const delHeaders = { "Content-Type": "application/json" };
        if (state.session?.access_token) delHeaders["Authorization"] = `Bearer ${state.session.access_token}`;
        await fetch("/api/orders", {
          method: "DELETE",
          headers: delHeaders,
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
  el("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") closeLightbox();
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

const getAuthHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  if (state.session?.access_token) headers["Authorization"] = `Bearer ${state.session.access_token}`;
  return headers;
};

const syncLocalOrderToDB = async (order) => {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        orderName: order.name,
        totalCount: order.totalCount,
        totalAmount: getOrderAmount(order),
        clientId: order.clientId,
        clientName: order.clientName || state.user || "client@email.com",
        userEmail: state.user || order.clientName || "client@email.com",
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
    const response = await fetch("/api/orders", { headers: getAuthHeaders() });
    const data = await response.json();
    if (data.success && Array.isArray(data.orders)) {
      const dbOrders = data.orders.map((o) => ({
        id: o.orderNumber,
        name: o.orderName,
        items: (o.items || []).map((i) => ({
          type: i.type,
          count: i.count,
          link: i.link || "",
          unitPrice: i.unitPrice,
        })),
        totalCount: o.totalCount,
        totalAmount: o.totalAmount,
        status: o.status.toLowerCase(),
        createdAt: new Date(o.createdAt).toISOString().replace("T", " ").slice(0, 16),
        clientId: o.clientId || "",
        clientName: o.clientName || "",
        dbId: o.id,
      }));

      // Find local-only orders that need to be synced to DB
      const dbIds = new Set(dbOrders.map((o) => o.id));
      const localOnly = state.orders.filter((o) => !dbIds.has(o.id) && !o.dbId);

      // Push local-only orders to database
      for (const localOrder of localOnly) {
        await syncLocalOrderToDB(localOrder);
      }

      // After syncing, re-fetch to get the complete list
      if (localOnly.length > 0) {
        const refreshResponse = await fetch("/api/orders", { headers: getAuthHeaders() });
        const refreshData = await refreshResponse.json();
        if (refreshData.success && Array.isArray(refreshData.orders)) {
          const allDbOrders = refreshData.orders.map((o) => ({
            id: o.orderNumber,
            name: o.orderName,
            items: (o.items || []).map((i) => ({
              type: i.type,
              count: i.count,
              link: i.link || "",
              unitPrice: i.unitPrice,
            })),
            totalCount: o.totalCount,
            totalAmount: o.totalAmount,
            status: o.status.toLowerCase(),
            createdAt: new Date(o.createdAt).toISOString().replace("T", " ").slice(0, 16),
            clientId: o.clientId || "",
            clientName: o.clientName || "",
            dbId: o.id,
          }));
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

const init = async () => {
  setupEvents();

  // Listen for auth state changes (login, logout, token refresh)
  supabase.auth.onAuthStateChange((_event, session) => {
    handleAuthUser(session);
  });

  // Check if already logged in
  const { data: { session } } = await supabase.auth.getSession();
  handleAuthUser(session);
};

init();
