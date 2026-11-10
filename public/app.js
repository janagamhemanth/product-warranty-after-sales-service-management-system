const $ = (id) => document.getElementById(id);
const state = { token: localStorage.getItem("warrantiq_token") || "", user: null, products: [], requests: [], authMode: "login", view: "overview" };
$("year").textContent = new Date().getFullYear();
let toastTimer;

function showToast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
async function api(url, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.message || "Something went wrong.");
  }
  return data;
}
function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  $("nameField").classList.toggle("hidden", !isRegister);
  $("authName").required = isRegister;
  $("authPassword").autocomplete = isRegister ? "new-password" : "current-password";
  $("authTitle").textContent = isRegister ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = isRegister ? "Register to start managing your warranties." : "Sign in to manage your registered products.";
  $("authSubmit").innerHTML = isRegister ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  $("authHint").textContent = isRegister ? "Use a valid email and a password of at least 8 characters." : "Admin sign-in uses the credentials configured in your .env file.";
  document.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("selected", b.dataset.auth === mode));
}
function showApp() {
  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("userLabel").textContent = state.user?.name || "";
  $("navLinks").classList.toggle("hidden", state.user?.role === "admin");
  $("adminSummary").classList.toggle("hidden", state.user?.role !== "admin");
  $("customerSummary").classList.toggle("hidden", state.user?.role === "admin");
  $("adminPanel").classList.toggle("hidden", state.user?.role !== "admin");
 if ($("addProductTop")) {
  $("addProductTop").classList.toggle("hidden", state.user?.role === "admin");
}
  $("productsHeading").textContent = state.user?.role === "admin" ? "All registered products" : "Registered products";
}
function logout(notify = true) {
  state.token = ""; state.user = null; state.products = []; state.requests = [];
  localStorage.removeItem("warrantiq_token");
  $("authScreen").classList.remove("hidden"); $("appScreen").classList.add("hidden");
  $("logoutBtn").classList.add("hidden"); $("userLabel").textContent = "";
  if (notify) showToast("You have been logged out.");
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function statusClass(status) { return "status-" + String(status || "").toLowerCase().replace(/\s+/g, "-"); }
function statusPill(status) { return `<span class="status ${statusClass(status)}">${escapeHtml(status)}</span>`; }
function productSymbol(name = "") {
  const n = name.toLowerCase();
  if (n.includes("laptop") || n.includes("computer")) return "▰";
  if (n.includes("phone") || n.includes("mobile")) return "▯";
  if (n.includes("tv") || n.includes("monitor")) return "▱";
  if (n.includes("watch")) return "◷";
  if (n.includes("head")) return "♫";
  return "▣";
}function productCard(p) {
  const status = p.warrantyStatus || "Expired";

  let coverageText;

  if (status === "Expired") {
    coverageText = "Warranty expired";
  } else if (p.daysRemaining === 0) {
    coverageText = "Expires today";
  } else {
    coverageText = `${p.daysRemaining} days remaining`;
  }

  return `<article class="product-card">
    <div class="product-card-top">
      <span class="product-symbol">${productSymbol(p.productName)}</span>
      ${statusPill(status)}
    </div>

    <h3>${escapeHtml(p.productName)}</h3>
    <div class="brand-name">${escapeHtml(p.brand)}</div>

    <div class="product-meta">
      <div>
        <span>Serial number</span>
        <b>${escapeHtml(p.serialNumber)}</b>
      </div>

      <div>
        <span>Purchased</span>
        <b>${formatDate(p.purchaseDate)}</b>
      </div>

      <div>
        <span>Warranty ends</span>
        <b>${formatDate(p.warrantyExpiry)}</b>
      </div>

      <div>
        <span>Coverage remaining</span>
        <b>${coverageText}</b>
      </div>

      ${p.owner ? `<div>
        <span>Owner</span>
        <b>${escapeHtml(p.owner.name)}</b>
      </div>` : ""}
    </div>

    <div class="product-actions">
      <button class="btn btn-outline btn-small"
        data-action="request" data-id="${p._id}">
        Request service
      </button>
      <button class="btn btn-outline btn-small"
        data-action="delete-product" data-id="${p._id}">
        Delete
      </button>
    </div>
  </article>`;
}
function overviewProduct(p) {
  return `<div class="product-row"><span class="product-symbol">${productSymbol(p.productName)}</span><div class="product-info"><b>${escapeHtml(p.productName)} · ${escapeHtml(p.brand)}</b><small>Expires ${formatDate(p.warrantyExpiry)}${p.warrantyStatus === "Active" ? ` · ${p.daysRemaining} days left` : ""}</small></div>${statusPill(p.warrantyStatus)}</div>`;
}
function emptyState(title, detail, buttonText = "", action = "") {
  return `<div class="empty-state"><b>${escapeHtml(title)}</b>${escapeHtml(detail)}${buttonText ? `<div style="margin-top:14px"><button class="btn btn-primary btn-small" data-action="${action}">${escapeHtml(buttonText)}</button></div>` : ""}</div>`;
}
function requestCard(r, admin = false) {
  const p = r.product || {};
  const owner = r.owner || {};
  return `<article class="request-card">
    <div class="request-top"><div><div class="ticket">${escapeHtml(r.ticketNumber)}</div><h3>${escapeHtml(p.productName || "Product")} · ${escapeHtml(p.brand || "")}</h3></div>${statusPill(r.status)}</div>
    ${admin ? `<div class="request-meta"><span>Customer: ${escapeHtml(owner.name || "Unknown")}</span><span>${escapeHtml(owner.email || "")}</span></div>` : ""}
    <p>${escapeHtml(r.issue)}</p>
    <div class="request-meta"><span>Submitted ${formatDate(r.createdAt)}</span><span>Serial: ${escapeHtml(p.serialNumber || "—")}</span>${r.preferredContact ? `<span>Contact: ${escapeHtml(r.preferredContact)}</span>` : ""}</div>
    ${r.adminNote ? `<p><b>Admin update:</b> ${escapeHtml(r.adminNote)}</p>` : ""}
    ${admin ? `<form class="admin-edit" data-request-id="${r._id}"><select name="status" aria-label="Request status"><option ${r.status==="Submitted"?"selected":""}>Submitted</option><option ${r.status==="In Progress"?"selected":""}>In Progress</option><option ${r.status==="Resolved"?"selected":""}>Resolved</option><option ${r.status==="Rejected"?"selected":""}>Rejected</option></select><input name="adminNote" maxlength="1000" placeholder="Note for customer" value="${escapeHtml(r.adminNote || "")}" aria-label="Admin note"><button class="btn btn-primary btn-small" type="submit">Update</button></form>` : ""}
  </article>`;

}
async function loadAdminCustomers() {
  const tbody = $("adminCustomersList");
  const message = $("customersMessage");
  const searchInput = $("customerSearch");

  if (!tbody || state.user?.role !== "admin") return;

  tbody.innerHTML = "";
  message.textContent = "Loading customers...";

  try {
    const data = await api("/api/admin/customers");
    const customers = data.customers || [];

    const searchTerm = searchInput
      ? searchInput.value.trim().toLowerCase()
      : "";

    const filteredCustomers = customers.filter(customer =>
      `${customer.name || ""} ${customer.email || ""}`
        .toLowerCase()
        .includes(searchTerm)
    );

    if (filteredCustomers.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4">No matching customers found.</td></tr>';

      message.textContent = `Total customers: 0`;
      return;
    }

    filteredCustomers.forEach(customer => {
      const tr = document.createElement("tr");

      const values = [
        customer.name,
        customer.email,
        customer.registeredAt
          ? new Date(customer.registeredAt).toLocaleDateString()
          : "—",
        customer.productCount
      ];

      values.forEach(value => {
        const td = document.createElement("td");
        td.textContent = value ?? "—";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    message.textContent =
      `Showing ${filteredCustomers.length} of ${customers.length} customers`;

  } catch (error) {
    message.textContent =
      error.message || "Could not load customers.";

    tbody.innerHTML =
      '<tr><td colspan="4">Unable to load customers.</td></tr>';
  }
}
async function loadData() {
  const [productsResult, requestsResult] = await Promise.all([api("/api/products"), api("/api/requests")]);
  state.products = productsResult.products || [];
  state.requests = requestsResult.requests || [];
  render();
  if (state.user.role === "admin") {
    await loadAdminCustomers();
    const summary = await api("/api/admin/summary");
    $("statCustomers").textContent = summary.customers;
    $("statProducts").textContent = summary.products;
    $("statOpen").textContent = summary.openRequests;
    $("statResolved").textContent = summary.resolvedRequests;
  }
}
const adminProductForm = document.getElementById("adminProductForm");

if (adminProductForm) {
  adminProductForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("adminProductMessage");
    const submitButton = adminProductForm.querySelector(
      'button[type="submit"]'
    );

    message.textContent = "Assigning product...";
    submitButton.disabled = true;

    try {
      const formData = new FormData(adminProductForm);
      const body = Object.fromEntries(formData.entries());
      body.warrantyMonths = Number(body.warrantyMonths);

      const data = await api("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(body)
      });

      message.textContent =
        data.message || "Product assigned successfully.";

      adminProductForm.reset();

      await loadData();
    } catch (error) {
      message.textContent =
        error.message || "Could not assign product.";
    } finally {
      submitButton.disabled = false;
    }
  });
}
function render() {
  const isAdmin = state.user?.role === "admin";
 const active = state.products.filter(
  p => p.warrantyStatus === "Active" ||
       p.warrantyStatus === "Expiring Soon"
).length;

const expired = state.products.filter(
  p => p.warrantyStatus === "Expired"
).length;

$("myProductCount").textContent = state.products.length;
$("activeCount").textContent = active;
$("expiredCount").textContent = expired;
  $("myRequestCount").textContent = state.requests.length;
  $("overviewProducts").innerHTML = state.products.length ? state.products.slice(0, 4).map(overviewProduct).join("") : emptyState("No products registered yet", "Register your first product to start tracking its warranty.", "Register product", "add");
const productSearch = $("productSearch");

const searchTerm = productSearch
  ? productSearch.value.trim().toLowerCase()
  : "";

const filteredProducts = state.products.filter(p =>
  `${p.productName || ""} ${p.brand || ""} ${p.serialNumber || ""}`
    .toLowerCase()
    .includes(searchTerm)
);

if (state.products.length === 0) {
  $("allProducts").innerHTML = emptyState(
    "Your product list is empty",
    "Add a product to calculate its warranty expiry date.",
    "Add a product",
    "add"
  );
} else if (filteredProducts.length === 0) {
  $("allProducts").innerHTML = emptyState(
    "No matching products",
    "Try another product name, brand, or serial number."
  );
} else {
  $("allProducts").innerHTML = filteredProducts
    .map(productCard)
    .join("");
}
  $("myRequests").innerHTML = state.requests.length ? state.requests.map(r => requestCard(r)).join("") : emptyState("No service requests yet", "When you need support, create a service request here.", state.products.length ? "Create request" : "Register a product first", state.products.length ? "new-request" : "add");
const statusFilter = $("adminRequestStatus");
const selectedStatus = statusFilter ? statusFilter.value : "All";

const filteredRequests = state.requests.filter(request =>
  selectedStatus === "All" || request.status === selectedStatus
);

$("adminRequests").innerHTML = filteredRequests.length
  ? filteredRequests.map(request => requestCard(request, true)).join("")
  : emptyState(
      "No matching requests",
      "No service requests found for this status."
    );
  if (isAdmin) $("overviewContent").classList.add("hidden");
  updateView(state.view);
}
function updateView(view) {
  state.view = view;
  const isAdmin = state.user?.role === "admin";
  if (isAdmin) view = "overview";
  $("overviewContent").classList.toggle("hidden", view !== "overview" || isAdmin);
  $("productsView").classList.toggle("hidden", view !== "products");
  $("requestsView").classList.toggle("hidden", view !== "requests");
  const titles = { overview: ["Overview", "Everything you need to keep your products covered."], products: [isAdmin ? "All products" : "My products", "Warranty dates and product details."], requests: ["Service requests", "Track the progress of your service tickets."] };
  $("pageTitle").textContent = titles[view][0];
  $("pageDescription").textContent = titles[view][1];
  document.querySelectorAll("[data-view]").forEach(a => a.classList.toggle("active", a.dataset.view === view));
  if (isAdmin) $("adminPanel").classList.remove("hidden");
}
function openModal(id) {
  if (id === "requestModal") {
    const select = $("requestProduct");
    select.innerHTML = state.products.map(p => `<option value="${p._id}">${escapeHtml(p.productName)} — ${escapeHtml(p.brand)} (${escapeHtml(p.serialNumber)})</option>`).join("");
    if (!state.products.length) { showToast("Register a product before requesting service.", true); return; }
  }
  if (id === "productModal") {
    $("productForm").reset();
    $("purchaseDate").max = new Date().toISOString().slice(0, 10);
    $("purchaseDate").value = new Date().toISOString().slice(0, 10);
  }
  $(id).classList.remove("hidden");
}
function closeModal(id) { $(id).classList.add("hidden"); }

document.querySelectorAll("[data-auth]").forEach(b => b.addEventListener("click", () => setAuthMode(b.dataset.auth)));
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const isRegister = state.authMode === "register";
  const body = { email: $("authEmail").value.trim(), password: $("authPassword").value };
  if (isRegister) body.name = $("authName").value.trim();
  const btn = $("authSubmit"); btn.disabled = true;
  try {
    const data = await api(`/api/auth/${isRegister ? "register" : "login"}`, { method: "POST", body: JSON.stringify(body) });
    state.token = data.token; state.user = data.user;
    localStorage.setItem("warrantiq_token", state.token);
    showApp(); await loadData(); showToast(data.message);
  } catch (err) { showToast(err.message, true); }
  finally { btn.disabled = false; }
});
$("logoutBtn").addEventListener("click", () => logout());
$("brandLink").addEventListener("click", e => { e.preventDefault(); if (state.user) updateView("overview"); });
document.querySelectorAll("[data-view]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); updateView(a.dataset.view); }));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => updateView(b.dataset.go)));
$("customersRefresh")?.addEventListener("click", loadAdminCustomers);
$("quickRequest").addEventListener("click", () => openModal("requestModal"));
$("newRequestBtn").addEventListener("click", () => openModal("requestModal"));
$("adminRefresh").addEventListener("click", async () => { try { await loadData(); showToast("Data refreshed."); } catch (e) { showToast(e.message, true); } });
document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => closeModal(el.dataset.close)));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden")); });

$("productForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = {
    productName: $("productName").value.trim(), brand: $("brand").value.trim(),
    serialNumber: $("serialNumber").value.trim(), purchaseDate: $("purchaseDate").value,
    warrantyMonths: Number($("warrantyMonths").value), notes: $("productNotes").value.trim()
  };
  try {
    const data = await api("/api/products", { method: "POST", body: JSON.stringify(body) });
    closeModal("productModal"); await loadData(); updateView("products"); showToast(data.message);
  } catch (err) { showToast(err.message, true); }
});
$("requestForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = { productId: $("requestProduct").value, issue: $("issue").value.trim(), preferredContact: $("preferredContact").value.trim() };
  try {
    const data = await api("/api/requests", { method: "POST", body: JSON.stringify(body) });
    closeModal("requestModal"); $("requestForm").reset(); await loadData(); updateView("requests"); showToast(`${data.message} Ticket: ${data.request.ticketNumber}`);
  } catch (err) { showToast(err.message, true); }
});
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "add") return openModal("productModal");
  if (action === "new-request") return openModal("requestModal");
  if (action === "request") {
    openModal("requestModal");
    if (!$("requestModal").classList.contains("hidden")) $("requestProduct").value = btn.dataset.id;
    return;
  }
  if (action === "delete-product") {
    const product = state.products.find(p => p._id === btn.dataset.id);
    if (!product || !confirm(`Delete "${product.productName}" and its service requests? This cannot be undone.`)) return;
    try { const data = await api(`/api/products/${btn.dataset.id}`, { method: "DELETE" }); await loadData(); showToast(data.message); }
    catch (err) { showToast(err.message, true); }
  }
});
document.addEventListener("submit", async e => {
  const form = e.target.closest(".admin-edit");
  if (!form) return;
  e.preventDefault();
  const body = { status: form.elements.status.value, adminNote: form.elements.adminNote.value.trim() };
  try { const data = await api(`/api/requests/${form.dataset.requestId}/status`, { method: "PATCH", body: JSON.stringify(body) }); await loadData(); showToast(data.message); }
  catch (err) { showToast(err.message, true); }
});

async function init() {
  if (!state.token) return;
  try {
    const data = await api("/api/auth/me");
    state.user = data.user; showApp(); await loadData();
  } catch { logout(false); }
}
init();
const customerProductForm = document.getElementById("customerProductForm");

if (customerProductForm) {
  customerProductForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("customerProductMessage");
    const submitButton = customerProductForm.querySelector(
      'button[type="submit"]'
    );

    message.textContent = "Registering product...";
    submitButton.disabled = true;

    try {
      const formData = new FormData(customerProductForm);
      const body = Object.fromEntries(formData.entries());

      body.warrantyMonths = Number(body.warrantyMonths);

      const data = await api("/api/products", {
        method: "POST",
        body: JSON.stringify(body)
      });

      message.textContent =
        data.message || "Product registered successfully.";

      customerProductForm.reset();

      await loadData();
    } catch (error) {
      message.textContent =
        error.message || "Could not register product.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

const customerSearch = $("customerSearch");

if (customerSearch) {
  customerSearch.addEventListener("input", () => {
    loadAdminCustomers();
  });
}

const productSearchInput = $("productSearch");

if (productSearchInput) {
  productSearchInput.addEventListener("input", () => {
    render();
  });
}

const adminRequestStatus = $("adminRequestStatus");

if (adminRequestStatus) {
  adminRequestStatus.addEventListener("change", () => {
    render();
  });
}