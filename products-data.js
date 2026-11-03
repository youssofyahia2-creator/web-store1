(function (global) {
  "use strict";

  const DEFAULT_PRODUCTS = [
    {
      id: "vantage-signature-tee",
      name: "VANTAGE Signature Tee",
      price: 1200,
      currency: "egp",
      category: "T-Shirts",
      description: "A basic tee with clean lines and a comfortable fabric for everyday wear.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["S", "M", "L", "XL", "XXL"],
      colors: ["Black", "White", "Navy"],
      featured: true
    },
    {
      id: "vantage-midnight-monogram",
      name: "VANTAGE Midnight Monogram",
      price: 1280,
      currency: "egp",
      category: "T-Shirts",
      description: "Subtle monogram details and a premium touch for a night-out look.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["M", "L", "XL", "XXL"],
      colors: ["Black", "Grey"],
      featured: true
    },
    {
      id: "vantage-gold-line-tee",
      name: "VANTAGE Gold Line Tee",
      price: 1340,
      currency: "egp",
      category: "T-Shirts",
      description: "A metallic gold print that adds a bold presence without overdoing it.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      colors: ["Black", "Off White"],
      featured: false
    },
    {
      id: "vantage-oversized-core",
      name: "VANTAGE Oversized Core",
      price: 1390,
      currency: "egp",
      category: "T-Shirts",
      description: "A relaxed oversized cut with heavyweight fabric and a clear street look.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["M", "L", "XL", "XXL"],
      colors: ["Black", "White", "Olive"],
      featured: true
    },
    {
      id: "vantage-shadow-print",
      name: "VANTAGE Shadow Print",
      price: 1260,
      currency: "egp",
      category: "T-Shirts",
      description: "A light shadow print that adds depth without visual clutter.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      colors: ["Black", "Charcoal"],
      featured: false
    },
    {
      id: "vantage-street-mark",
      name: "VANTAGE Street Mark",
      price: 1320,
      currency: "egp",
      category: "T-Shirts",
      description: "A clear streetwear style with a small chest embroidery and a clean finish.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["M", "L", "XL"],
      colors: ["Black", "Navy", "White"],
      featured: false
    },
    {
      id: "vantage-premium-heavy",
      name: "VANTAGE Premium Heavy Tee",
      price: 1450,
      currency: "egp",
      category: "T-Shirts",
      description: "A heavy, structured fabric for people who love a distinctive tee drape.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["L", "XL", "XXL"],
      colors: ["Black", "Brown", "Beige"],
      featured: true
    },
    {
      id: "vantage-minimal-badge",
      name: "VANTAGE Minimal Badge",
      price: 1180,
      currency: "egp",
      category: "T-Shirts",
      description: "A minimal tee with a small logo and an easygoing everyday look.",
      image: "/assets/vantage-signature-tee.jpg",
      sizes: ["S", "M", "L", "XL", "XXL"],
      colors: ["White", "Black", "Off White"],
      featured: false
    }
  ];

  const LOCAL_KEYS = {
    products: "yy_store_products_v2",
    orders: "yy_store_orders_v1",
    auth: "yy_store_local_auth",
    customerAccounts: "yy_store_local_customer_accounts_v1",
    customerAuth: "yy_store_local_customer_auth_v1",
    adminUser: "yy_store_local_admin_user",
    adminPass: "yy_store_local_admin_pass"
  };

  const LOCAL_DEFAULT_ADMIN = {
    username: "admin",
    password: "2026"
  };

  const ORDER_STATUS_OPTIONS = ["new", "in_progress", "ready_to_ship", "completed", "cancelled"];

  const FORCE_LOCAL_MODE = global.location.protocol === "file:";
  const API_BASE_URL = (function () {
    if (typeof global.YY_STORE_API_BASE_URL === "string" && global.YY_STORE_API_BASE_URL.trim()) {
      return global.YY_STORE_API_BASE_URL.trim().replace(/\/+$/, "");
    }
    const isHttpProtocol = /^https?:$/i.test(global.location.protocol);
    const host = String(global.location.hostname || "").toLowerCase();
    const port = String(global.location.port || "").trim();
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (isHttpProtocol && isLocalHost && port && port !== "3000") {
      return "http://127.0.0.1:3000";
    }
    return "";
  })();

  function useLocalMode() {
    return FORCE_LOCAL_MODE;
  }

  function buildApiUrl(path) {
    if (!API_BASE_URL || /^https?:\/\//i.test(String(path || ""))) {
      return path;
    }
    return API_BASE_URL + path;
  }

  function isLikelyCorruptedText(value) {
    if (typeof value !== "string") {
      return false;
    }
    const text = value.trim();
    if (!text) {
      return false;
    }
    if (/[\u0000-\u001F]/.test(text)) {
      return true;
    }
    if (/�/.test(text)) {
      return true;
    }
    if (/(?:Ã|Â|Ø|Ù|ï¿½)/.test(text)) {
      return true;
    }
    const questions = text.match(/\?/g);
    return Boolean(questions && questions.length >= 3 && questions.length / text.length > 0.2);
  }

  function sanitizeString(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function sanitizeDisplayString(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    const cleaned = value.trim();
    if (!cleaned || isLikelyCorruptedText(cleaned)) {
      return fallback;
    }
    return cleaned;
  }

  function sanitizePrice(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function sanitizeNonNegativeInteger(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return Math.max(0, Math.floor(Number(fallback) || 0));
    }
    return Math.max(0, Math.floor(numeric));
  }

  function getOrderAmountEgp(order) {
    const unitPrice = Number(order && order.unitPrice ? order.unitPrice : 0);
    const quantity = Math.max(1, Math.floor(Number(order && order.quantity ? order.quantity : 1)));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return 0;
    }
    return Math.max(0, Math.round(unitPrice * quantity));
  }

  function sanitizeArray(value, fallback) {
    if (!Array.isArray(value)) {
      return fallback.slice();
    }
    const cleaned = value
      .map(function (item) {
        return sanitizeDisplayString(item, "");
      })
      .filter(Boolean);
    return cleaned.length ? cleaned : fallback.slice();
  }

  function normalizeCurrencyLabel(value) {
    const cleaned = sanitizeDisplayString(value, "");
    if (!cleaned) {
      return "EGP";
    }
    if (cleaned.toLowerCase() === "egp") {
      return "EGP";
    }
    return cleaned;
  }

  function formatPriceLabel(amount, currencyLabel) {
    const numeric = Number(amount);
    const moneyLabel = normalizeCurrencyLabel(currencyLabel);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return moneyLabel;
    }
    try {
      return `${new Intl.NumberFormat("ar-EG").format(Math.round(numeric))} ${moneyLabel}`;
    } catch (_error) {
      return `${Math.round(numeric)} ${moneyLabel}`;
    }
  }

  function normalizeProduct(input, index) {
    const fallback = DEFAULT_PRODUCTS[index % DEFAULT_PRODUCTS.length];
    return {
      id: sanitizeString(input && input.id, "product-" + (index + 1)),
      name: sanitizeDisplayString(input && input.name, fallback.name),
      price: sanitizePrice(input && input.price, fallback.price),
      currency: normalizeCurrencyLabel(input && input.currency),
      category: sanitizeDisplayString(input && input.category, "Product"),
      description: sanitizeDisplayString(input && input.description, "A premium item from VANTAGE."),
      image: sanitizeString(input && input.image, "tshirt.jpg.jpg"),
      sizes: sanitizeArray(input && input.sizes, ["M", "L", "XL"]),
      colors: sanitizeArray(input && input.colors, ["Black", "White"]),
      featured: Boolean(input && input.featured)
    };
  }

  function generateProductId(name) {
    const slug = String(name || "product")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const tail = Math.random().toString(36).slice(2, 7);
    return (slug || "product") + "-" + tail;
  }

  function isOrderStatusSupported(status) {
    return ORDER_STATUS_OPTIONS.indexOf(status) >= 0;
  }

  function normalizePaymentStatus(status) {
    const value = sanitizeString(status, "pending").toLowerCase();
    if (value === "pending" || value === "paid" || value === "failed" || value === "expired") {
      return value;
    }
    return "pending";
  }

  function getFallbackProduct(products, productId, index) {
    const list = Array.isArray(products) && products.length ? products : DEFAULT_PRODUCTS;
    const matched = list.find(function (item) {
      return item && item.id === productId;
    });
    return matched || list[index % list.length] || DEFAULT_PRODUCTS[0];
  }

  function normalizeOrder(input, index, products) {
    const source = input && typeof input === "object" ? input : {};
    const fallback = getFallbackProduct(products, source.productId, index);
    const quantity = Math.max(1, Math.floor(sanitizePrice(source.quantity, 1)));
    const unitPrice = sanitizePrice(source.unitPrice, fallback.price);
    const currencyCode = sanitizeString(source.currency, "egp").toLowerCase();
    const subtotalPrice = Math.max(
      0,
      Math.round(
        Number(source.subtotalPrice) > 0 ? Number(source.subtotalPrice) : unitPrice * quantity
      )
    );
    const discountAmount = Math.max(
      0,
      Math.min(subtotalPrice, sanitizeNonNegativeInteger(source.discountAmount, 0))
    );
    const finalPrice = Math.max(
      0,
      Math.round(
        Number(source.finalPrice) >= 0 ? Number(source.finalPrice) : subtotalPrice - discountAmount
      )
    );
    const fallbackLabel = formatPriceLabel(finalPrice, fallback.currency || currencyCode);

    return {
      ...source,
      id: sanitizeString(source.id, "ord-local-" + (index + 1)),
      createdAt: sanitizeString(source.createdAt, new Date().toISOString()),
      status: isOrderStatusSupported(source.status) ? source.status : "new",
      paymentStatus: normalizePaymentStatus(source.paymentStatus),
      type: sanitizeString(source.type, "ready"),
      source: sanitizeString(source.source, "storefront"),
      customerId: sanitizeString(source.customerId, ""),
      customerName: sanitizeDisplayString(source.customerName, ""),
      customerPhone: sanitizeString(source.customerPhone, ""),
      customerEmail: sanitizeString(source.customerEmail, ""),
      notes: sanitizeDisplayString(source.notes, ""),
      productId: sanitizeString(source.productId, fallback.id),
      productName: sanitizeDisplayString(source.productName, fallback.name),
      size: sanitizeString(source.size, fallback.sizes[0] || "M"),
      color: sanitizeDisplayString(source.color, fallback.colors[0] || "Black"),
      quantity: quantity,
      unitPrice: unitPrice,
      subtotalPrice: subtotalPrice,
      discountAmount: discountAmount,
      finalPrice: finalPrice,
      currency: currencyCode,
      priceLabel: sanitizeDisplayString(source.priceLabel, fallbackLabel),
      customPreview: sanitizeString(source.customPreview, ""),
      customShirtColor: sanitizeDisplayString(source.customShirtColor, ""),
      paymentSessionId: sanitizeString(source.paymentSessionId, ""),
      paymentReference: sanitizeString(source.paymentReference, "")
    };
  }

  function localReadJSON(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function localWriteJSON(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
    }
  }

  function localReadProducts() {
    const list = localReadJSON(LOCAL_KEYS.products, null);
    if (!Array.isArray(list) || !list.length) {
      return DEFAULT_PRODUCTS.slice();
    }
    const normalized = list.map(normalizeProduct);
    localWriteJSON(LOCAL_KEYS.products, normalized);
    return normalized;
  }

  function normalizeEmail(value) {
    const cleaned = sanitizeString(value, "").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      return "";
    }
    return cleaned;
  }

  function sanitizeCustomerName(value) {
    return sanitizeDisplayString(value, "").slice(0, 80);
  }

  function toCustomerPublic(customer) {
    const source = customer && typeof customer === "object" ? customer : {};
    return {
      id: sanitizeString(source.id, ""),
      name: sanitizeCustomerName(source.name),
      email: normalizeEmail(source.email)
    };
  }

  function localReadCustomerAccounts() {
    const raw = localReadJSON(LOCAL_KEYS.customerAccounts, []);
    const list = Array.isArray(raw) ? raw : [];
    const normalized = list
      .map(function (item, index) {
        const email = normalizeEmail(item && item.email);
        return {
          id: sanitizeString(item && item.id, "local-customer-" + (index + 1)),
          name: sanitizeCustomerName(item && item.name),
          email: email,
          password: sanitizeString(item && item.password, ""),
          createdAt: sanitizeString(item && item.createdAt, new Date().toISOString()),
          updatedAt: sanitizeString(item && item.updatedAt, new Date().toISOString()),
          lastLoginAt: sanitizeString(item && item.lastLoginAt, "")
        };
      })
      .filter(function (item) {
        return Boolean(item.email && item.password);
      });

    if (JSON.stringify(list) !== JSON.stringify(normalized)) {
      localWriteJSON(LOCAL_KEYS.customerAccounts, normalized);
    }

    return normalized;
  }

  function localGetCustomerSessionPayload() {
    try {
      const raw = global.sessionStorage.getItem(LOCAL_KEYS.customerAuth);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const user = toCustomerPublic(parsed);
      if (!user.id || !user.email) {
        global.sessionStorage.removeItem(LOCAL_KEYS.customerAuth);
        return null;
      }
      return user;
    } catch (_error) {
      global.sessionStorage.removeItem(LOCAL_KEYS.customerAuth);
      return null;
    }
  }

  function localSetCustomerSession(user) {
    const safe = toCustomerPublic(user);
    global.sessionStorage.setItem(LOCAL_KEYS.customerAuth, JSON.stringify(safe));
  }

  function localCustomerSignUp(name, email, password) {
    const safeName = sanitizeCustomerName(name);
    const safeEmail = normalizeEmail(email);
    const safePassword = sanitizeString(password, "");

    if (!safeName || safeName.length < 2) {
      throw new Error("Name is required and must be at least 2 characters.");
    }
    if (!safeEmail) {
      throw new Error("Invalid email address.");
    }
    if (!safePassword || safePassword.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    const accounts = localReadCustomerAccounts();
    const exists = accounts.some(function (item) {
      return item.email === safeEmail;
    });
    if (exists) {
      throw new Error("This email is already registered, try signing in instead.");
    }

    const now = new Date().toISOString();
    const user = {
      id: "local-customer-" + Date.now().toString(36),
      name: safeName,
      email: safeEmail,
      password: safePassword,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    accounts.unshift(user);
    localWriteJSON(LOCAL_KEYS.customerAccounts, accounts);
    localSetCustomerSession(user);
    return {
      ok: true,
      user: toCustomerPublic(user)
    };
  }

  function localCustomerSignIn(email, password) {
    const safeEmail = normalizeEmail(email);
    const safePassword = sanitizeString(password, "");
    if (!safeEmail || !safePassword) {
      throw new Error("Email and password are required.");
    }

    const accounts = localReadCustomerAccounts();
    const index = accounts.findIndex(function (item) {
      return item.email === safeEmail;
    });
    if (index < 0 || accounts[index].password !== safePassword) {
      throw new Error("Incorrect email or password.");
    }

    const now = new Date().toISOString();
    const nextUser = {
      ...accounts[index],
      lastLoginAt: now
    };
    accounts[index] = nextUser;
    localWriteJSON(LOCAL_KEYS.customerAccounts, accounts);
    localSetCustomerSession(nextUser);
    return {
      ok: true,
      user: toCustomerPublic(nextUser)
    };
  }

  function localCustomerSignOut() {
    global.sessionStorage.removeItem(LOCAL_KEYS.customerAuth);
    return { ok: true };
  }

  function localGetCustomerSession() {
    const user = localGetCustomerSessionPayload();
    return {
      ok: true,
      authenticated: Boolean(user),
      user: user || null
    };
  }

  function localRequireAuth() {
    const ok = global.sessionStorage.getItem(LOCAL_KEYS.auth) === "1";
    if (!ok) {
      throw new Error("Unauthorized");
    }
  }

  function localCreateProduct(product) {
    localRequireAuth();
    const current = localReadProducts();
    const normalized = normalizeProduct(
      {
        ...product,
        id: sanitizeString(product && product.id, "") || generateProductId(product && product.name)
      },
      current.length
    );
    current.unshift(normalized);
    localWriteJSON(LOCAL_KEYS.products, current);
    return normalized;
  }

  function localUpdateProduct(productId, product) {
    localRequireAuth();
    const current = localReadProducts();
    const index = current.findIndex(function (item) {
      return item.id === productId;
    });
    if (index < 0) {
      throw new Error("Product not found.");
    }
    const merged = normalizeProduct({ ...current[index], ...product, id: productId }, index);
    current[index] = merged;
    localWriteJSON(LOCAL_KEYS.products, current);
    return merged;
  }

  function localDeleteProduct(productId) {
    localRequireAuth();
    const current = localReadProducts();
    const next = current.filter(function (item) {
      return item.id !== productId;
    });
    localWriteJSON(LOCAL_KEYS.products, next);
    return true;
  }

  function localResetProducts() {
    localRequireAuth();
    localWriteJSON(LOCAL_KEYS.products, DEFAULT_PRODUCTS.slice());
    return DEFAULT_PRODUCTS.slice();
  }

  function localImportProducts(productsList) {
    localRequireAuth();
    if (!Array.isArray(productsList)) {
      throw new Error("Invalid JSON file.");
    }
    const normalized = productsList.map(function (item, index) {
      return normalizeProduct(item, index);
    });
    localWriteJSON(LOCAL_KEYS.products, normalized);
    return normalized;
  }

  function localCreateOrder(order) {
    const sessionUser = localGetCustomerSessionPayload();
    if (!sessionUser) {
      throw new Error("You need to sign in first.");
    }

    const current = localReadJSON(LOCAL_KEYS.orders, []);
    const list = Array.isArray(current) ? current : [];
    const accounts = localReadCustomerAccounts();
    const customerIndex = accounts.findIndex(function (item) {
      return item && item.email === sessionUser.email;
    });
    if (customerIndex < 0) {
      throw new Error("Your session is no longer valid, please sign in again.");
    }
    const customer = accounts[customerIndex];
    const products = localReadProducts();
    const snapshot =
      order && typeof order.customPreview === "string" && order.customPreview.length > 120000
        ? "[preview-too-large-local]"
        : order && order.customPreview;
    const customerNameFallback = customer.name || "VANTAGE Customer";
    const nextOrderInput = {
      ...(order || {}),
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: sanitizeDisplayString(order && order.customerName, customerNameFallback),
      customPreview: snapshot
    };
    const subtotalEgp = getOrderAmountEgp(nextOrderInput);
    const finalPriceLabel = formatPriceLabel(
      subtotalEgp,
      sanitizeString(nextOrderInput && nextOrderInput.currency, "egp")
    );
    const next = normalizeOrder(
      {
        ...nextOrderInput,
        id: "ord-" + Date.now().toString(36),
        createdAt: new Date().toISOString(),
        status: "new",
        paymentStatus: "pending",
        subtotalPrice: subtotalEgp,
        discountAmount: 0,
        finalPrice: subtotalEgp,
        priceLabel: finalPriceLabel
      },
      list.length,
      products
    );
    list.unshift(next);
    localWriteJSON(LOCAL_KEYS.orders, list.slice(0, 1000));
    return {
      ok: true,
      orderId: next.id,
      order: next,
      user: toCustomerPublic(accounts[customerIndex])
    };
  }

  function localReadOrders() {
    localRequireAuth();
    const current = localReadJSON(LOCAL_KEYS.orders, []);
    const list = Array.isArray(current) ? current : [];
    const products = localReadProducts();
    const normalized = list.map(function (item, index) {
      return normalizeOrder(item, index, products);
    });
    localWriteJSON(LOCAL_KEYS.orders, normalized);
    return normalized;
  }

  function localUpdateOrderStatus(orderId, status) {
    localRequireAuth();
    if (ORDER_STATUS_OPTIONS.indexOf(status) === -1) {
      throw new Error("Unsupported order status.");
    }

    const list = localReadOrders();
    const products = localReadProducts();
    const index = list.findIndex(function (item) {
      return item && item.id === orderId;
    });

    if (index < 0) {
      throw new Error("Order not found.");
    }

    list[index] = normalizeOrder(
      {
        ...list[index],
        status: status,
        updatedAt: new Date().toISOString()
      },
      index,
      products
    );
    localWriteJSON(LOCAL_KEYS.orders, list);
    return list[index];
  }

  function localGetAdminCredentials() {
    const username =
      global.localStorage.getItem(LOCAL_KEYS.adminUser) || LOCAL_DEFAULT_ADMIN.username;
    const password =
      global.localStorage.getItem(LOCAL_KEYS.adminPass) || LOCAL_DEFAULT_ADMIN.password;
    return { username: username, password: password };
  }

  function localLogin(username, password) {
    const admin = localGetAdminCredentials();
    if (username !== admin.username || password !== admin.password) {
      throw new Error("Invalid login credentials.");
    }
    global.sessionStorage.setItem(LOCAL_KEYS.auth, "1");
    return {
      ok: true,
      user: { username: admin.username, mustChangePassword: false }
    };
  }

  function localLogout() {
    global.sessionStorage.removeItem(LOCAL_KEYS.auth);
    return { ok: true };
  }

  function localGetSession() {
    const authenticated = global.sessionStorage.getItem(LOCAL_KEYS.auth) === "1";
    const admin = localGetAdminCredentials();
    return {
      ok: true,
      authenticated: authenticated,
      user: authenticated ? { username: admin.username, mustChangePassword: false } : null
    };
  }

  function localChangePassword(currentPassword, newPassword) {
    localRequireAuth();
    const admin = localGetAdminCredentials();
    if (currentPassword !== admin.password) {
      throw new Error("Current password is incorrect.");
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error("The new password must be at least 6 characters.");
    }
    global.localStorage.setItem(LOCAL_KEYS.adminUser, admin.username);
    global.localStorage.setItem(LOCAL_KEYS.adminPass, newPassword);
    return { ok: true };
  }

  function localGetSetupStatus() {
    const origin = global.location.protocol + "//" + global.location.host;
    return {
      ok: true,
      brand: "VANTAGE",
      generatedAt: new Date().toISOString(),
      baseUrl: origin,
      readiness: {
        readyForPayments: true,
        readyForLaunch: false
      },
      checks: [
        {
          id: "run_server_mode",
          label: "Run the full server",
          configured: false,
          required: true,
          where: "Run the site with npm start on http://localhost:3000 instead of Live Server :5500"
        }
      ],
      links: {
        paymentGuide: "https://faq.whatsapp.com/",
        whatsappBusiness: "https://www.whatsapp.com/business/",
        domainProviders: "https://www.namecheap.com/domains/",
        dnsAndSsl: "https://www.cloudflare.com/plans/free/",
        businessEmail: "https://workspace.google.com/",
        brandAssets: "https://www.figma.com/"
      },
      envTemplate: [
        "PORT=3000",
        "ADMIN_PASSWORD=put_strong_password_here",
        "ADMIN_PASSWORD_MIN_LENGTH=6",
        "ADMIN_NOTIFY_EMAIL=",
        "ADMIN_NOTIFY_EMAILS=",
        "SUPPORT_REPLY_TO_EMAIL=",
        "EMAILJS_SERVICE_ID=",
        "EMAILJS_TEMPLATE_CUSTOMER_ID=",
        "EMAILJS_TEMPLATE_ADMIN_ID=",
        "EMAILJS_PUBLIC_KEY=",
        "EMAILJS_PRIVATE_KEY="
      ].join("\n")
    };
  }

  async function request(path, options) {
    let response;
    try {
      response = await fetch(buildApiUrl(path), {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        ...options
      });
    } catch (error) {
      const wrapped = new Error("Could not connect to the server.");
      wrapped.networkFailure = true;
      wrapped.cause = error;
      throw wrapped;
    }

    const payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || payload.ok === false) {
      const wrapped = new Error(payload.message || "Could not complete the operation.");
      wrapped.status = response.status;
      throw wrapped;
    }

    return payload;
  }

  function shouldFallbackToLocal(_error) {
    return useLocalMode();
  }

  async function readProducts() {
    if (useLocalMode()) {
      return localReadProducts();
    }
    try {
      const payload = await request("/api/products", { method: "GET" });
      const list = Array.isArray(payload.products) ? payload.products : [];
      return list.map(normalizeProduct);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localReadProducts();
      }
      throw error;
    }
  }

  async function createProduct(product) {
    if (useLocalMode()) {
      return localCreateProduct(product || {});
    }
    try {
      const payload = await request("/api/products", {
        method: "POST",
        body: JSON.stringify(product || {})
      });
      return normalizeProduct(payload.product || {}, 0);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localCreateProduct(product || {});
      }
      throw error;
    }
  }

  async function updateProduct(productId, product) {
    if (useLocalMode()) {
      return localUpdateProduct(productId, product || {});
    }
    try {
      const payload = await request("/api/products/" + encodeURIComponent(productId), {
        method: "PUT",
        body: JSON.stringify(product || {})
      });
      return normalizeProduct(payload.product || {}, 0);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localUpdateProduct(productId, product || {});
      }
      throw error;
    }
  }

  async function deleteProduct(productId) {
    if (useLocalMode()) {
      return localDeleteProduct(productId);
    }
    try {
      await request("/api/products/" + encodeURIComponent(productId), {
        method: "DELETE"
      });
      return true;
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localDeleteProduct(productId);
      }
      throw error;
    }
  }

  async function resetProducts() {
    if (useLocalMode()) {
      return localResetProducts();
    }
    try {
      const payload = await request("/api/products/reset", { method: "POST" });
      const list = Array.isArray(payload.products) ? payload.products : DEFAULT_PRODUCTS.slice();
      return list.map(normalizeProduct);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localResetProducts();
      }
      throw error;
    }
  }

  async function importProducts(productsList) {
    if (useLocalMode()) {
      return localImportProducts(productsList || []);
    }
    try {
      const payload = await request("/api/products/import", {
        method: "POST",
        body: JSON.stringify(productsList || [])
      });
      const list = Array.isArray(payload.products) ? payload.products : [];
      return list.map(normalizeProduct);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localImportProducts(productsList || []);
      }
      throw error;
    }
  }

  async function createOrder(order) {
    if (useLocalMode()) {
      return localCreateOrder(order || {});
    }
    try {
      return await request("/api/orders", {
        method: "POST",
        body: JSON.stringify(order || {})
      });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localCreateOrder(order || {});
      }
      throw error;
    }
  }

  async function readOrders() {
    if (useLocalMode()) {
      return localReadOrders();
    }
    try {
      const payload = await request("/api/orders", { method: "GET" });
      const list = Array.isArray(payload.orders) ? payload.orders : [];
      const products = await readProducts().catch(function () {
        return DEFAULT_PRODUCTS.slice();
      });
      return list.map(function (item, index) {
        return normalizeOrder(item, index, products);
      });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localReadOrders();
      }
      throw error;
    }
  }


  async function updateOrderStatus(orderId, status) {
    if (useLocalMode()) {
      return localUpdateOrderStatus(orderId, status);
    }
    try {
      const payload = await request(
        "/api/orders/" + encodeURIComponent(orderId) + "/status",
        {
          method: "PATCH",
          body: JSON.stringify({ status: status })
        }
      );
      if (!payload.order) {
        return null;
      }
      const products = await readProducts().catch(function () {
        return DEFAULT_PRODUCTS.slice();
      });
      return normalizeOrder(payload.order, 0, products);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localUpdateOrderStatus(orderId, status);
      }
      throw error;
    }
  }

  async function customerSignUp(name, email, password) {
    if (useLocalMode()) {
      return localCustomerSignUp(name, email, password);
    }
    try {
      return await request("/api/customer-auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name: name,
          email: email,
          password: password
        })
      });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localCustomerSignUp(name, email, password);
      }
      throw error;
    }
  }

  async function customerSignIn(email, password) {
    if (useLocalMode()) {
      return localCustomerSignIn(email, password);
    }
    try {
      return await request("/api/customer-auth/signin", {
        method: "POST",
        body: JSON.stringify({
          email: email,
          password: password
        })
      });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localCustomerSignIn(email, password);
      }
      throw error;
    }
  }

  async function customerSignOut() {
    if (useLocalMode()) {
      return localCustomerSignOut();
    }
    try {
      return await request("/api/customer-auth/signout", { method: "POST" });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localCustomerSignOut();
      }
      throw error;
    }
  }

  async function getCustomerSession() {
    if (useLocalMode()) {
      return localGetCustomerSession();
    }
    try {
      return await request("/api/customer-auth/session", { method: "GET" });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localGetCustomerSession();
      }
      throw error;
    }
  }


  async function login(username, password) {
    if (useLocalMode()) {
      return localLogin(username, password);
    }
    try {
      return await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: username,
          password: password
        })
      });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localLogin(username, password);
      }
      throw error;
    }
  }

  async function logout() {
    if (useLocalMode()) {
      return localLogout();
    }
    try {
      return await request("/api/auth/logout", { method: "POST" });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localLogout();
      }
      throw error;
    }
  }

  async function getSession() {
    if (useLocalMode()) {
      return localGetSession();
    }
    try {
      return await request("/api/auth/session", { method: "GET" });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localGetSession();
      }
      throw error;
    }
  }

  async function changePassword(currentPassword, newPassword) {
    if (useLocalMode()) {
      return localChangePassword(currentPassword, newPassword);
    }
    try {
      return await request("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: newPassword
        })
      });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localChangePassword(currentPassword, newPassword);
      }
      throw error;
    }
  }

  async function getSetupStatus() {
    if (useLocalMode()) {
      return localGetSetupStatus();
    }
    try {
      return await request("/api/setup/status", { method: "GET" });
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        return localGetSetupStatus();
      }
      throw error;
    }
  }

  global.YYStoreData = {
    DEFAULT_PRODUCTS: DEFAULT_PRODUCTS.slice(),
    readProducts: readProducts,
    createProduct: createProduct,
    updateProduct: updateProduct,
    deleteProduct: deleteProduct,
    resetProducts: resetProducts,
    importProducts: importProducts,
    createOrder: createOrder,
    readOrders: readOrders,
    updateOrderStatus: updateOrderStatus,
    customerSignUp: customerSignUp,
    customerSignIn: customerSignIn,
    customerSignOut: customerSignOut,
    getCustomerSession: getCustomerSession,
    login: login,
    logout: logout,
    getSession: getSession,
    changePassword: changePassword,
    getSetupStatus: getSetupStatus,
    ORDER_STATUS_OPTIONS: ORDER_STATUS_OPTIONS.slice()
  };
})(window);