const STORAGE_KEY = "ripay-data-v1";

const state = {
  user: null,
  subscribed: false,
  orders: [],
  payments: [],
  selectedOrders: new Set(),
  activeOrderId: null,
  payQueue: [],
};

const el = (id) => document.getElementById(id);

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

const formatStatus = (status) => {
  const isPaid = status === "paid";
  return `<span class="badge ${isPaid ? "paid" : "unpaid"}">${
    isPaid ? "Paid" : "Unpaid"
  }</span>`;
};

const renderOrders = () => {
  const list = el("orderList");
  list.innerHTML = "";

  if (!state.orders.length) {
    list.innerHTML = `<div class="order-row"><div></div><div>No orders yet.</div><div></div><div></div><div></div></div>`;
    return;
  }

  state.orders.forEach((order) => {
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

const openGallery = (orderId) => {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;

  state.activeOrderId = orderId;
  el("galleryTitle").textContent = order.name;

  const grid = el("galleryGrid");
  grid.innerHTML = "";
  const previewCount = Math.min(order.totalCount, 16);

  for (let i = 0; i < previewCount; i += 1) {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.addEventListener("click", () => openLightbox());
    grid.appendChild(item);
  }

  el("galleryModal").classList.remove("hidden");
};

const closeGallery = () => {
  el("galleryModal").classList.add("hidden");
  state.activeOrderId = null;
};

const openLightbox = () => {
  el("lightboxImg").src =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%23f7e8dc'/><stop offset='1' stop-color='%23f1d6bf'/></linearGradient></defs><rect width='1600' height='1000' fill='url(%23g)'/><text x='50%25' y='50%25' font-size='64' font-family='Arial' fill='rgba(0,0,0,0.45)' text-anchor='middle' dominant-baseline='middle'>RIPAY PREVIEW</text></svg>";
  el("lightbox").classList.remove("hidden");
};

const closeLightbox = () => {
  el("lightbox").classList.add("hidden");
  el("lightboxImg").src = "";
};

const openPayModal = (orderIds) => {
  state.payQueue = orderIds;
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

const markPaid = (orderIds) => {
  const today = new Date().toISOString().slice(0, 10);
  orderIds.forEach((id) => {
    const order = state.orders.find((o) => o.id === id);
    if (!order || order.status === "paid") return;
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
  });

  saveState();
  renderOrders();
  renderPayments();
};

const createOrder = () => {
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
  const newOrders = [];

  items.forEach((item) => {
    if (!item.type) return;
    if (!item.count) return;
    const displayName = ensureDatePrefix(item.type, createdAt);
    const amount = Number((item.count * (item.unitPrice || 0)).toFixed(2));
    newOrders.push({
      id: `ORD-${Math.floor(Math.random() * 9000 + 1000)}`,
      name: displayName,
      items: [item],
      totalCount: item.count,
      totalAmount: amount,
      status: "unpaid",
      createdAt,
      clientId: `CLI-${Math.floor(Math.random() * 90000 + 10000)}`,
      clientName: state.user || "client@email.com",
    });
  });

  if (!newOrders.length) {
    alert("Please enter at least one order name and quantity.");
    return;
  }

  state.orders = [...newOrders, ...state.orders];
  saveState();
  renderOrders();

  renderLineItems();
  switchTab("overview");
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
  el("btnLogin").addEventListener("click", () => {
    const name = el("loginEmail").value.trim();
    if (!name) {
      alert("Please enter your email.");
      return;
    }
    state.user = name;
    el("sellerName").textContent = name;
    el("userBadge").textContent = name;
    el("userBadge").classList.remove("hidden");
    el("loginScreen").classList.add("hidden");
    el("appScreen").classList.remove("hidden");
  });

  el("btnLogout").addEventListener("click", () => {
    state.user = null;
    el("loginScreen").classList.remove("hidden");
    el("appScreen").classList.add("hidden");
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
};

const init = () => {
  loadState();
  renderOrders();
  renderPayments();
  renderLineItems();
  setupEvents();
};

init();
