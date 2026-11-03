(function () {
  "use strict";

  const fallbackStoreApi = {
    readProducts: async function () {
      return [];
    },
    createProduct: async function () {
      throw new Error("Server unavailable.");
    },
    updateProduct: async function () {
      throw new Error("Server unavailable.");
    },
    deleteProduct: async function () {
      throw new Error("Server unavailable.");
    },
    resetProducts: async function () {
      return [];
    },
    readOrders: async function () {
      return [];
    },
    updateOrderStatus: async function () {
      throw new Error("Server unavailable.");
    },
    login: async function () {
      throw new Error("Server unavailable.");
    },
    logout: async function () {
      return { ok: true };
    },
    getSession: async function () {
      return { ok: true, authenticated: false };
    },
    changePassword: async function () {
      throw new Error("Server unavailable.");
    },
    ORDER_STATUS_OPTIONS: ["new", "in_progress", "ready_to_ship", "completed", "cancelled"]
  };

  const storeApi = window.YYStoreData || fallbackStoreApi;
  const ORDER_STATUS_OPTIONS = Array.isArray(storeApi.ORDER_STATUS_OPTIONS)
    ? storeApi.ORDER_STATUS_OPTIONS
    : ["new", "in_progress", "ready_to_ship", "completed", "cancelled"];

  const ORDER_STATUS_LABELS = {
    new: "New",
    in_progress: "In Progress",
    ready_to_ship: "Ready to Ship",
    completed: "Completed",
    cancelled: "Cancelled"
  };
  const ADMIN_WHATSAPP_PHONE = "201140094137";

  const state = {
    products: [],
    orders: [],
    setupStatus: null,
    orderFilter: "all",
    orderPaymentFilter: "all",
    orderSearchQuery: "",
    editingId: null,
    imageFileData: "",
    toastTimer: null
  };

  const refs = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheRefs();
    bindEvents();
    await hydrateSession();
  }

  function cacheRefs() {
    refs.authCard = document.getElementById("auth-card");
    refs.authForm = document.getElementById("auth-form");
    refs.adminUsername = document.getElementById("admin-username");
    refs.adminPassword = document.getElementById("admin-password");
    refs.adminPanel = document.getElementById("admin-panel");

    refs.changePasswordBtn = document.getElementById("change-password-btn");
    refs.logoutBtn = document.getElementById("logout-btn");
    refs.exportBtn = document.getElementById("export-btn");
    refs.importFile = document.getElementById("import-file");
    refs.resetDefaultsBtn = document.getElementById("reset-defaults-btn");
    refs.refreshOrdersBtn = document.getElementById("refresh-orders-btn");
    refs.orderStatusFilter = document.getElementById("order-status-filter");
    refs.orderPaymentFilter = document.getElementById("order-payment-filter");
    refs.orderSearch = document.getElementById("order-search");

    refs.formTitle = document.getElementById("form-title");
    refs.productForm = document.getElementById("product-form");
    refs.productId = document.getElementById("product-id");
    refs.name = document.getElementById("name");
    refs.price = document.getElementById("price");
    refs.currency = document.getElementById("currency");
    refs.category = document.getElementById("category");
    refs.description = document.getElementById("description");
    refs.image = document.getElementById("image");
    refs.imageFile = document.getElementById("image-file");
    refs.sizes = document.getElementById("sizes");
    refs.colors = document.getElementById("colors");
    refs.featured = document.getElementById("featured");
    refs.saveBtn = document.getElementById("save-btn");
    refs.clearFormBtn = document.getElementById("clear-form-btn");

    refs.productsList = document.getElementById("products-list");
    refs.noProducts = document.getElementById("no-products");
    refs.ordersList = document.getElementById("orders-list");
    refs.noOrders = document.getElementById("no-orders");
    refs.statTotalOrders = document.getElementById("stat-total-orders");
    refs.statOpenOrders = document.getElementById("stat-open-orders");
    refs.statPaidOrders = document.getElementById("stat-paid-orders");
    refs.statTotalRevenue = document.getElementById("stat-total-revenue");
    refs.statPaidRevenue = document.getElementById("stat-paid-revenue");
    refs.toast = document.getElementById("toast");
    refs.setupSummary = document.getElementById("setup-summary");
    refs.setupChecks = document.getElementById("setup-checks");
    refs.refreshSetupBtn = document.getElementById("refresh-setup-btn");
    refs.copyEnvTemplateBtn = document.getElementById("copy-env-template-btn");
    refs.setupLinkPayment = document.getElementById("setup-link-payment");
    refs.setupLinkWhatsApp = document.getElementById("setup-link-whatsapp");
    refs.setupLinkDomain = document.getElementById("setup-link-domain");
    refs.setupLinkEmail = document.getElementById("setup-link-email");
  }

  function bindEvents() {
    refs.authForm.addEventListener("submit", handleAuthSubmit);
    refs.changePasswordBtn.addEventListener("click", handleChangePassword);
    refs.logoutBtn.addEventListener("click", handleLogout);
    refs.exportBtn.addEventListener("click", exportProducts);
    refs.importFile.addEventListener("change", importProducts);
    refs.resetDefaultsBtn.addEventListener("click", resetToDefaults);
    refs.refreshOrdersBtn.addEventListener("click", loadOrders);
    if (refs.orderStatusFilter) {
      refs.orderStatusFilter.addEventListener("change", function () {
        state.orderFilter = refs.orderStatusFilter.value || "all";
        renderOrders();
      });
    }
    if (refs.orderPaymentFilter) {
      refs.orderPaymentFilter.addEventListener("change", function () {
        state.orderPaymentFilter = refs.orderPaymentFilter.value || "all";
        renderOrders();
      });
    }
    if (refs.orderSearch) {
      refs.orderSearch.addEventListener("input", function () {
        state.orderSearchQuery = String(refs.orderSearch.value || "").trim().toLowerCase();
        renderOrders();
      });
    }
    refs.productForm.addEventListener("submit", handleProductSubmit);
    refs.clearFormBtn.addEventListener("click", resetForm);
    refs.imageFile.addEventListener("change", handleImageUpload);
    if (refs.refreshSetupBtn) {
      refs.refreshSetupBtn.addEventListener("click", loadSetupStatus);
    }
    if (refs.copyEnvTemplateBtn) {
      refs.copyEnvTemplateBtn.addEventListener("click", copySetupEnvTemplate);
    }
  }

  async function hydrateSession() {
    try {
      const session = await storeApi.getSession();
      if (session && session.authenticated) {
        showPanel();
        await loadDashboardData();
        if (session.user && session.user.mustChangePassword) {
          setTimeout(function () {
            window.alert("For better security, change your current password before continuing to admin.");
          }, 250);
        }
        return;
      }
      showAuth();
    } catch (_error) {
      showAuth();
    }
  }

  function showPanel() {
    refs.authCard.classList.add("hidden");
    refs.adminPanel.classList.remove("hidden");
  }

  function showAuth() {
    refs.adminPanel.classList.add("hidden");
    refs.authCard.classList.remove("hidden");
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const username = String(refs.adminUsername.value || "").trim();
    const password = String(refs.adminPassword.value || "").trim();
    if (!username || !password) {
      showToast("Enter your username and password.");
      return;
    }

    setButtonLoading(refs.authForm.querySelector("button[type='submit']"), true, "Signing in...");
    try {
      const loginResult = await storeApi.login(username, password);
      refs.authForm.reset();
      refs.adminUsername.value = "admin";
      showPanel();
      await loadDashboardData();
      showToast("Signed in successfully.");
      if (loginResult && loginResult.user && loginResult.user.mustChangePassword) {
        setTimeout(function () {
          window.alert("For better security, change your password now using the (Change Password) button.");
        }, 250);
      }
    } catch (error) {
      showToast(error.message || "Invalid login credentials.");
    } finally {
      setButtonLoading(refs.authForm.querySelector("button[type='submit']"), false, "Sign In");
    }
  }

  async function handleLogout() {
    try {
      await storeApi.logout();
    } catch (_error) {
    }
    showAuth();
    state.products = [];
    state.orders = [];
    state.setupStatus = null;
    state.orderFilter = "all";
    state.orderPaymentFilter = "all";
    state.orderSearchQuery = "";
    refs.productsList.innerHTML = "";
    refs.ordersList.innerHTML = "";
    if (refs.setupSummary) {
      refs.setupSummary.textContent = "Sign in to view readiness status.";
    }
    if (refs.setupChecks) {
      refs.setupChecks.innerHTML = "";
    }
    if (refs.orderStatusFilter) {
      refs.orderStatusFilter.value = "all";
    }
    if (refs.orderPaymentFilter) {
      refs.orderPaymentFilter.value = "all";
    }
    if (refs.orderSearch) {
      refs.orderSearch.value = "";
    }
    renderOrderStats();
    showToast("Signed out successfully.");
  }

  async function handleChangePassword() {
    const currentPassword = window.prompt("Enter your current password:");
    if (!currentPassword) {
      return;
    }

    const newPassword = window.prompt("Enter the new password (6 characters or more):");
    if (!newPassword) {
      return;
    }

    if (newPassword.trim().length < 6) {
      showToast("The new password must be at least 6 characters.");
      return;
    }

    try {
      await storeApi.changePassword(currentPassword.trim(), newPassword.trim());
      showToast("Password changed successfully.");
    } catch (error) {
      showToast(error.message || "Could not change the password.");
    }
  }

  async function loadDashboardData() {
    await Promise.all([loadProducts(), loadOrders(), loadSetupStatus()]);
  }

  async function loadProducts() {
    try {
      state.products = await storeApi.readProducts();
      renderProductsList();
    } catch (error) {
      showToast(error.message || "Could not load products.");
    }
  }

  function renderProductsList() {
    refs.productsList.innerHTML = "";
    refs.noProducts.classList.toggle("hidden", state.products.length > 0);

    state.products.forEach(function (product) {
      refs.productsList.appendChild(buildProductItem(product));
    });
  }

  function buildProductItem(product) {
    const wrapper = document.createElement("article");
    wrapper.className = "product-item";

    const top = document.createElement("div");
    top.className = "product-top";

    const img = document.createElement("img");
    img.src = product.image || "tshirt.jpg.jpg";
    img.alt = product.name;
    img.addEventListener("error", function () {
      img.src = "tshirt.jpg.jpg";
    });

    const info = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = product.name;
    const meta = document.createElement("p");
    meta.textContent =
      formatPrice(product.price, product.currency) +
      " • " +
      (product.category || "Product");

    info.appendChild(title);
    info.appendChild(meta);
    top.appendChild(img);
    top.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-ghost";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () {
      fillForm(product);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", function () {
      deleteProduct(product.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    wrapper.appendChild(top);
    wrapper.appendChild(actions);
    return wrapper;
  }

  async function loadOrders() {
    if (refs.adminPanel.classList.contains("hidden")) {
      return;
    }

    try {
      state.orders = await storeApi.readOrders();
      renderOrders();
    } catch (error) {
      showToast(error.message || "Could not load orders.");
    }
  }

  async function loadSetupStatus() {
    if (refs.adminPanel.classList.contains("hidden")) {
      return;
    }

    try {
      const fetchSetup =
        typeof storeApi.getSetupStatus === "function"
          ? storeApi.getSetupStatus
          : async function () {
              const response = await fetch("/api/setup/status", { credentials: "include" });
              if (!response.ok) {
                throw new Error("Could not load readiness status.");
              }
              return await response.json();
            };

      const payload = await fetchSetup();
      state.setupStatus = payload || null;
      renderSetupStatus();
    } catch (error) {
      state.setupStatus = null;
      if (refs.setupSummary) {
        refs.setupSummary.textContent = "Could not check readiness right now.";
      }
      if (refs.setupChecks) {
        refs.setupChecks.innerHTML = "";
      }
      showToast(error.message || "Could not load readiness status.");
    }
  }

  function renderSetupStatus() {
    if (!refs.setupSummary || !refs.setupChecks) {
      return;
    }

    const status = state.setupStatus;
    if (!status || !Array.isArray(status.checks)) {
      refs.setupSummary.textContent = "No readiness data available right now.";
      refs.setupChecks.innerHTML = "";
      return;
    }

    const readyForPayments = Boolean(
      status.readiness && status.readiness.readyForPayments
    );
    const readyForLaunch = Boolean(status.readiness && status.readiness.readyForLaunch);

    refs.setupSummary.textContent =
      "Payments: " +
      (readyForPayments ? "Ready" : "Not ready") +
      " • Public launch: " +
      (readyForLaunch ? "Ready" : "Missing settings");

    refs.setupChecks.innerHTML = "";
    status.checks.forEach(function (check) {
      refs.setupChecks.appendChild(buildSetupCheckItem(check));
    });
    updateSetupLinks(status.links || {});
  }

  function buildSetupCheckItem(check) {
    const wrapper = document.createElement("article");
    wrapper.className = "setup-check-item";

    const row = document.createElement("div");
    row.className = "setup-check-row";

    const label = document.createElement("span");
    label.className = "setup-check-label";
    label.textContent = check && check.label ? check.label : "Setup item";

    const badge = document.createElement("span");
    const isConfigured = Boolean(check && check.configured);
    badge.className = "setup-badge " + (isConfigured ? "ok" : "missing");
    badge.textContent = isConfigured ? "Ready" : "Missing";

    row.appendChild(label);
    row.appendChild(badge);

    const note = document.createElement("p");
    note.className = "setup-check-note";
    note.textContent = check && check.where ? check.where : "";

    wrapper.appendChild(row);
    wrapper.appendChild(note);

    if (check && check.value) {
      const valueText = document.createElement("p");
      valueText.className = "setup-check-note";
      valueText.textContent = "Current value: " + check.value;
      wrapper.appendChild(valueText);
    }

    if (check && check.url) {
      const link = document.createElement("a");
      link.className = "btn btn-ghost btn-small";
      link.href = check.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open Source";
      wrapper.appendChild(link);
    }

    return wrapper;
  }

  function updateSetupLinks(links) {
    if (refs.setupLinkPayment && links.paymentGuide) {
      refs.setupLinkPayment.href = links.paymentGuide;
    }
    if (refs.setupLinkWhatsApp && links.whatsappBusiness) {
      refs.setupLinkWhatsApp.href = links.whatsappBusiness;
    }
    if (refs.setupLinkDomain && links.domainProviders) {
      refs.setupLinkDomain.href = links.domainProviders;
    }
    if (refs.setupLinkEmail && links.businessEmail) {
      refs.setupLinkEmail.href = links.businessEmail;
    }
  }

  function copySetupEnvTemplate() {
    if (!state.setupStatus || !state.setupStatus.envTemplate) {
      showToast("No ENV template is available right now.");
      return;
    }
    copyText(state.setupStatus.envTemplate, "ENV template copied.");
  }

  async function handleUpdateOrderStatus(orderId, status) {
    if (!orderId) {
      return;
    }
    try {
      await storeApi.updateOrderStatus(orderId, status);
      await loadOrders();
      showToast("Order status updated.");
    } catch (error) {
      showToast(error.message || "Could not update the order status.");
    }
  }

  function getFilteredOrders() {
    return state.orders.filter(function (order) {
      const statusKey = String(order && order.status ? order.status : "new");
      if (state.orderFilter !== "all" && statusKey !== state.orderFilter) {
        return false;
      }

      const paymentKey = String(order && order.paymentStatus ? order.paymentStatus : "pending").toLowerCase();
      if (state.orderPaymentFilter !== "all" && paymentKey !== state.orderPaymentFilter) {
        return false;
      }

      if (!state.orderSearchQuery) {
        return true;
      }

      const searchable = [
        order && order.id,
        order && order.productName,
        order && order.customerName,
        order && order.customerPhone,
        order && order.customerEmail
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.indexOf(state.orderSearchQuery) !== -1;
    });
  }

  function renderOrderStats() {
    const list = state.orders.slice();
    let openOrders = 0;
    let paidOrders = 0;
    let totalRevenue = 0;
    let paidRevenue = 0;

    list.forEach(function (order) {
      const statusKey = String(order && order.status ? order.status : "new");
      if (statusKey === "new" || statusKey === "in_progress" || statusKey === "ready_to_ship") {
        openOrders += 1;
      }

      const amount = calculateOrderAmount(order);
      totalRevenue += amount;

      const paymentKey = String(order && order.paymentStatus ? order.paymentStatus : "").toLowerCase();
      if (paymentKey === "paid") {
        paidOrders += 1;
        paidRevenue += amount;
      }
    });

    if (refs.statTotalOrders) {
      refs.statTotalOrders.textContent = String(list.length);
    }
    if (refs.statOpenOrders) {
      refs.statOpenOrders.textContent = String(openOrders);
    }
    if (refs.statPaidOrders) {
      refs.statPaidOrders.textContent = String(paidOrders);
    }
    if (refs.statTotalRevenue) {
      refs.statTotalRevenue.textContent = formatMoney(totalRevenue);
    }
    if (refs.statPaidRevenue) {
      refs.statPaidRevenue.textContent = formatMoney(paidRevenue);
    }
  }

  function renderOrders() {
    refs.ordersList.innerHTML = "";
    const filteredOrders = getFilteredOrders();
    renderOrderStats();

    refs.noOrders.classList.toggle("hidden", filteredOrders.length > 0);

    filteredOrders.forEach(function (order) {
      const item = document.createElement("article");
      item.className = "order-item";

      const header = document.createElement("strong");
      header.textContent = `${order.productName || "New Order"} • ${order.customerName || "Customer"}`;

      const statusBadge = document.createElement("span");
      const statusKey = String(order.status || "new");
      statusBadge.className = "order-status-badge status-" + statusKey;
      statusBadge.textContent = "Status: " + statusLabel(statusKey);

      const paymentBadge = document.createElement("span");
      const paymentKey = String(order.paymentStatus || "pending").toLowerCase();
      paymentBadge.className = "order-status-badge payment-status-badge status-" + paymentKey;
      paymentBadge.textContent = "Payment: " + paymentLabel(paymentKey);

      const meta = document.createElement("p");
      meta.className = "order-meta";
      meta.textContent = [
        order.type === "custom" ? "Custom Design" : "Ready-made",
        order.id ? "Order ID: " + order.id : "",
        order.size ? "Size: " + order.size : "",
        order.color ? "Color: " + order.color : "",
        order.quantity ? "Quantity: " + order.quantity : "",
        order.customerPhone ? "Phone: " + order.customerPhone : "",
        order.customerEmail ? "Email: " + order.customerEmail : "Email: Not provided",
        order.createdAt ? "Time: " + new Date(order.createdAt).toLocaleString("en-US") : ""
      ]
        .filter(Boolean)
        .join(" • ");

      const actions = document.createElement("div");
      actions.className = "order-actions";

      const statusSelect = document.createElement("select");
      ORDER_STATUS_OPTIONS.forEach(function (status) {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = statusLabel(status);
        option.selected = status === statusKey;
        statusSelect.appendChild(option);
      });

      const saveStatusBtn = document.createElement("button");
      saveStatusBtn.type = "button";
      saveStatusBtn.className = "btn btn-ghost btn-small";
      saveStatusBtn.textContent = "Save Status";
      saveStatusBtn.addEventListener("click", function () {
        handleUpdateOrderStatus(order.id, statusSelect.value);
      });

      actions.appendChild(statusSelect);
      actions.appendChild(saveStatusBtn);

      if (order.customerPhone) {
        const whatsappBtn = document.createElement("a");
        whatsappBtn.className = "btn btn-ghost btn-small";
        whatsappBtn.href = "https://wa.me/" + toWhatsAppDigits(order.customerPhone);
        whatsappBtn.target = "_blank";
        whatsappBtn.rel = "noopener noreferrer";
        whatsappBtn.textContent = "WhatsApp";
        actions.appendChild(whatsappBtn);

        const copyPhoneBtn = document.createElement("button");
        copyPhoneBtn.type = "button";
        copyPhoneBtn.className = "btn btn-ghost btn-small";
        copyPhoneBtn.textContent = "Copy Number";
        copyPhoneBtn.addEventListener("click", function () {
          copyText(order.customerPhone, "Phone number copied.");
        });
        actions.appendChild(copyPhoneBtn);
      }

      if (order.customerEmail) {
        const copyEmailBtn = document.createElement("button");
        copyEmailBtn.type = "button";
        copyEmailBtn.className = "btn btn-ghost btn-small";
        copyEmailBtn.textContent = "Copy Email";
        copyEmailBtn.addEventListener("click", function () {
          copyText(order.customerEmail, "Email copied.");
        });
        actions.appendChild(copyEmailBtn);
      }

      item.appendChild(header);
      item.appendChild(statusBadge);
      item.appendChild(paymentBadge);

      if (order.type === "custom" && order.customPreview) {
        const previewWrap = document.createElement("div");
        previewWrap.className = "order-custom-preview";

        const previewImg = document.createElement("img");
        previewImg.src = order.customPreview;
        previewImg.alt = "Customer design preview";
        previewImg.loading = "lazy";
        previewWrap.appendChild(previewImg);

        const downloadBtn = document.createElement("a");
        downloadBtn.className = "btn btn-ghost btn-small";
        downloadBtn.href = order.customPreview;
        downloadBtn.download = "design-" + (order.id || "order") + ".png";
        downloadBtn.textContent = "Download Design";
        previewWrap.appendChild(downloadBtn);

        item.appendChild(previewWrap);
      }

      item.appendChild(meta);
      item.appendChild(actions);
      refs.ordersList.appendChild(item);
    });
  }

  function calculateOrderAmount(order) {
    const finalPrice = Number(order && order.finalPrice);
    if (Number.isFinite(finalPrice) && finalPrice >= 0) {
      return Math.round(finalPrice);
    }
    const quantity = Math.max(1, Math.floor(Number(order && order.quantity ? order.quantity : 1)));
    const unitPrice = Number(order && order.unitPrice ? order.unitPrice : 0);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return 0;
    }
    return unitPrice * quantity;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-US") + " EGP";
  }

  function copyText(value, successMessage) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return;
    }

    function fallbackCopy() {
      const temp = document.createElement("textarea");
      temp.value = normalized;
      temp.setAttribute("readonly", "readonly");
      temp.style.position = "fixed";
      temp.style.top = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
      showToast(successMessage);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(normalized)
        .then(function () {
          showToast(successMessage);
        })
        .catch(function () {
          fallbackCopy();
        });
      return;
    }

    fallbackCopy();
  }

  function handleImageUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file only.");
      refs.imageFile.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      state.imageFileData = String(loadEvent.target.result || "");
      refs.image.value = state.imageFileData;
      showToast("Image is ready.");
    };
    reader.readAsDataURL(file);
  }

  async function handleProductSubmit(event) {
    event.preventDefault();

    if (!refs.productForm.checkValidity()) {
      refs.productForm.reportValidity();
      return;
    }

    const payload = buildProductPayloadFromForm();
    if (!payload) {
      return;
    }

    setButtonLoading(refs.saveBtn, true, "Saving...");
    try {
      if (state.editingId) {
        await storeApi.updateProduct(state.editingId, payload);
        showToast("Product updated.");
      } else {
        await storeApi.createProduct(payload);
        showToast("Product added.");
      }

      await loadProducts();
      resetForm();
    } catch (error) {
      showToast(error.message || "Could not save the product.");
    } finally {
      setButtonLoading(refs.saveBtn, false, state.editingId ? "Save Changes" : "Save Product");
    }
  }

  function buildProductPayloadFromForm() {
    const price = Number(refs.price.value);
    if (!Number.isFinite(price) || price <= 0) {
      showToast("Price must be a number greater than zero.");
      return null;
    }

    return {
      id: refs.productId.value.trim() || undefined,
      name: refs.name.value.trim(),
      price: price,
      currency: refs.currency.value.trim() || "EGP",
      category: refs.category.value.trim(),
      description: refs.description.value.trim(),
      image: refs.image.value.trim() || "tshirt.jpg.jpg",
      sizes: parseCSV(refs.sizes.value, ["M", "L", "XL"]),
      colors: parseCSV(refs.colors.value, ["Black", "White"]),
      featured: refs.featured.checked
    };
  }

  function fillForm(product) {
    state.editingId = product.id;
    refs.formTitle.textContent = "Edit Product";
    refs.saveBtn.textContent = "Save Changes";

    refs.productId.value = product.id;
    refs.name.value = product.name || "";
    refs.price.value = String(product.price || "");
    refs.currency.value = product.currency || "EGP";
    refs.category.value = product.category || "";
    refs.description.value = product.description || "";
    refs.image.value = product.image || "";
    refs.sizes.value = (product.sizes || []).join(",");
    refs.colors.value = (product.colors || []).join(",");
    refs.featured.checked = Boolean(product.featured);
    refs.imageFile.value = "";
    state.imageFileData = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    state.editingId = null;
    state.imageFileData = "";
    refs.formTitle.textContent = "Add New Product";
    refs.saveBtn.textContent = "Save Product";
    refs.productForm.reset();
    refs.productId.value = "";
    refs.currency.value = "EGP";
    refs.sizes.value = "S,M,L,XL,XXL";
    refs.colors.value = "Black,White,Navy";
  }

  async function deleteProduct(productId) {
    const confirmed = window.confirm("Are you sure you want to delete this product?");
    if (!confirmed) {
      return;
    }

    try {
      await storeApi.deleteProduct(productId);
      await loadProducts();
      showToast("Product deleted.");
    } catch (error) {
      showToast(error.message || "Could not delete the product.");
    }
  }

  function exportProducts() {
    try {
      const json = JSON.stringify(state.products, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
    link.download = "vantage-products.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Products exported.");
    } catch (_error) {
      showToast("Failed to export products.");
    }
  }

  async function importProducts(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (loadEvent) {
      try {
        const parsed = JSON.parse(String(loadEvent.target.result || "[]"));
        if (!Array.isArray(parsed)) {
          throw new Error("Invalid JSON file.");
        }

        setButtonLoading(refs.exportBtn, true, "Importing...");
        if (typeof storeApi.importProducts === "function") {
          await storeApi.importProducts(parsed);
        } else {
          for (const existing of state.products) {
            await storeApi.deleteProduct(existing.id);
          }
          for (const item of parsed) {
            await storeApi.createProduct(item);
          }
        }
        await loadProducts();
        resetForm();
        showToast("Products imported.");
      } catch (error) {
        showToast(error.message || "Failed to import products.");
      } finally {
        setButtonLoading(refs.exportBtn, false, "Export Products JSON");
        refs.importFile.value = "";
      }
    };

    reader.readAsText(file);
  }

  async function resetToDefaults() {
    const confirmed = window.confirm("This will restore the default products. Continue?");
    if (!confirmed) {
      return;
    }

    try {
      await storeApi.resetProducts();
      await loadProducts();
      resetForm();
      showToast("Default products restored.");
    } catch (error) {
      showToast(error.message || "Could not restore products.");
    }
  }

  function parseCSV(value, fallback) {
    const items = String(value || "")
      .split(",")
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
    return items.length ? items : fallback.slice();
  }

  function formatPrice(price, currency) {
    const value = Number(price || 0).toLocaleString("ar-EG");
    return value + " " + (currency || "EGP");
  }

  function toWhatsAppDigits(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) {
      return ADMIN_WHATSAPP_PHONE;
    }
    if (digits.startsWith("20") && digits.length >= 12) {
      return digits;
    }
    if (digits.startsWith("0") && digits.length === 11) {
      return "20" + digits.slice(1);
    }
    if (digits.length === 10) {
      return "20" + digits;
    }
    return digits;
  }

  function statusLabel(status) {
    return ORDER_STATUS_LABELS[status] || status || "Unspecified";
  }

  function paymentLabel(status) {
    const key = String(status || "").toLowerCase();
    if (key === "pending") {
      return "Pending";
    }
    if (key === "paid") {
      return "Paid";
    }
    if (key === "failed") {
      return "Failed";
    }
    if (key === "expired") {
      return "Expired";
    }
    return key || "Unspecified";
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) {
      return;
    }

    if (isLoading) {
      button.dataset.originalText = button.textContent || "";
      button.textContent = loadingText;
      button.disabled = true;
      button.style.opacity = "0.75";
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent || "";
    button.disabled = false;
    button.style.opacity = "";
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add("is-visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      refs.toast.classList.remove("is-visible");
    }, 2400);
  }
})();