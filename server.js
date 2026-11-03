"use strict";

const http = require("http");
const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = __dirname;
const ORIGINAL_ENV_KEYS = new Set(Object.keys(process.env));
loadLocalEnvFiles(ROOT_DIR, ORIGINAL_ENV_KEYS);

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const ADMIN_PASSWORD_MIN_LENGTH = Number(process.env.ADMIN_PASSWORD_MIN_LENGTH || 6);
const CUSTOMER_PASSWORD_MIN_LENGTH = Number(process.env.CUSTOMER_PASSWORD_MIN_LENGTH || 6);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[FATAL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const SESSION_COOKIE = "yy_admin_session";
const CUSTOMER_SESSION_COOKIE = "yy_customer_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "2026");
const ORDER_STATUSES = ["new", "in_progress", "ready_to_ship", "completed", "cancelled"];
const OUTBOUND_HTTP_TIMEOUT_MS = Number(process.env.OUTBOUND_HTTP_TIMEOUT_MS || 6000);

const BLOCKED_STATIC_ROOTS = new Set(["data", "node_modules", ".git", ".codex"]);
const BLOCKED_STATIC_FILES = new Set([
  ".env",
  "package.json",
  "package-lock.json",
  "render.yaml",
  "start-store.bat"
]);

const ENV = {
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL || "",
  adminNotifyEmails: process.env.ADMIN_NOTIFY_EMAILS || "",
  supportReplyToEmail: process.env.SUPPORT_REPLY_TO_EMAIL || "",
  emailjsServiceId: process.env.EMAILJS_SERVICE_ID || "",
  emailjsTemplateCustomer: process.env.EMAILJS_TEMPLATE_CUSTOMER_ID || "",
  emailjsTemplateAdmin: process.env.EMAILJS_TEMPLATE_ADMIN_ID || "",
  emailjsPublicKey: process.env.EMAILJS_PUBLIC_KEY || "",
  emailjsPrivateKey: process.env.EMAILJS_PRIVATE_KEY || ""
};

function parseEnvValue(value) {
  const raw = String(value || "").trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).replace(/\\n/g, "\n");
  }
  return raw;
}

function loadEnvFile(filePath, options) {
  try {
    const overwriteExisting = Boolean(options && options.overwriteExisting);
    const protectedKeys = options && options.protectedKeys ? options.protectedKeys : new Set();
    if (!fsSync.existsSync(filePath)) {
      return;
    }

    const content = fsSync.readFileSync(filePath, "utf-8");
    content.split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }
      const key = line.slice(0, separatorIndex).trim();
      if (!key) {
        return;
      }
      if (process.env[key] !== undefined) {
        if (!overwriteExisting) {
          return;
        }
        if (protectedKeys.has(key)) {
          return;
        }
      }
      if (!overwriteExisting && process.env[key] !== undefined) {
        return;
      }
      const value = line.slice(separatorIndex + 1);
      process.env[key] = parseEnvValue(value);
    });
  } catch (_error) {
  }
}

function loadLocalEnvFiles(rootDir, protectedKeys) {
  loadEnvFile(path.join(rootDir, ".env"), {
    overwriteExisting: false,
    protectedKeys: protectedKeys
  });
  loadEnvFile(path.join(rootDir, ".env.local"), {
    overwriteExisting: true,
    protectedKeys: protectedKeys
  });
}

const SESSIONS = new Map();
const CUSTOMER_SESSIONS = new Map();
const RATE_LIMITS = new Map();

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

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};
function isAllowedDevCorsOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) {
    return false;
  }
  return (
    /^https?:\/\/localhost:\d+$/i.test(value) ||
    /^https?:\/\/127\.0\.0\.1:\d+$/i.test(value)
  );
}

function writeHeadSecure(res, statusCode, headers) {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    ...(headers || {})
  });
}

function applyApiCorsHeaders(req, res) {
  const origin = String((req && req.headers && req.headers.origin) || "").trim();
  if (!origin || !isAllowedDevCorsOrigin(origin)) {
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  return true;
}

function json(res, statusCode, payload) {
  writeHeadSecure(res, statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function text(res, statusCode, payload) {
  writeHeadSecure(res, statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(payload);
}

function createPasswordHash(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const digest = crypto.scryptSync(password, salt, 64);
  return {
    salt: salt.toString("hex"),
    hash: digest.toString("hex")
  };
}

function verifyPassword(password, saltHex, hashHex) {
  const candidate = createPasswordHash(password, saltHex);
  const left = Buffer.from(candidate.hash, "hex");
  const right = Buffer.from(hashHex, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function sanitizeString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.trim();
  return cleaned ? cleaned : fallback;
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

function sanitizeDisplayString(value, fallback) {
  const cleaned = sanitizeString(value, "");
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
    return `${new Intl.NumberFormat("en-US").format(Math.round(numeric))} ${moneyLabel}`;
  } catch (_error) {
    return `${Math.round(numeric)} ${moneyLabel}`;
  }
}

function slugify(textValue) {
  return String(textValue || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildProductId(productName) {
  const base = slugify(productName);
  const random = crypto.randomBytes(3).toString("hex");
  return (base || "product") + "-" + random;
}

function normalizeProduct(input, index) {
  const fallback = DEFAULT_PRODUCTS[index % DEFAULT_PRODUCTS.length];
  const name = sanitizeDisplayString(input && input.name, fallback.name);
  const id = sanitizeString(input && input.id, "") || buildProductId(name);

  return {
    id: id,
    name: name,
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

function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

async function ensureDataStore() {
  await ensureJsonFile(PRODUCTS_FILE, DEFAULT_PRODUCTS);
  await ensureJsonFile(ORDERS_FILE, []);
  await ensureJsonFile(CUSTOMERS_FILE, []);

  const existingAdmin = await readJson(ADMIN_FILE, null);
  if (
    existingAdmin &&
    existingAdmin.username &&
    existingAdmin.salt &&
    existingAdmin.hash &&
    typeof existingAdmin.mustChangePassword !== "boolean"
  ) {
    const shouldForceChange = !process.env.ADMIN_PASSWORD;
    await writeJson(ADMIN_FILE, {
      ...existingAdmin,
      mustChangePassword: shouldForceChange,
      updatedAt: existingAdmin.updatedAt || new Date().toISOString()
    });
  } else if (!existingAdmin) {
    const seededPassword = DEFAULT_ADMIN_PASSWORD || generateTemporaryPassword();
    const password = createPasswordHash(seededPassword);
    const mustChangePassword = !process.env.ADMIN_PASSWORD || seededPassword === "2026";
    const adminPayload = {
      username: DEFAULT_ADMIN_USER,
      salt: password.salt,
      hash: password.hash,
      mustChangePassword: mustChangePassword,
      updatedAt: new Date().toISOString()
    };
    await writeJson(ADMIN_FILE, adminPayload);

    if (!process.env.ADMIN_PASSWORD) {
      const mode = IS_PRODUCTION ? "production" : "local";
      console.warn(
        `[SECURITY] ADMIN_PASSWORD is not set (${mode}). Temporary admin credentials: admin / ${seededPassword}`
      );
      console.warn("[SECURITY] Please set ADMIN_PASSWORD in environment and change password from /admin.");
    }
  }
}

const ALLOWED_DESIGN_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

const DESIGN_UPLOADS_BUCKET = process.env.SUPABASE_DESIGN_BUCKET || "design-uploads";

async function saveDesignPreviewToFile(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return "";
  }

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return "";
  }

  const mimeType = match[1].toLowerCase();
  const extension = ALLOWED_DESIGN_IMAGE_TYPES[mimeType];
  if (!extension) {
    return "";
  }

  const base64Payload = match[2];
  const buffer = Buffer.from(base64Payload, "base64");
  if (!buffer.length || buffer.length > 3_000_000) {
    return "";
  }

  const fileName = "design-" + Date.now().toString(36) + "-" + crypto.randomBytes(8).toString("hex") + "." + extension;

  const { error } = await supabase.storage.from(DESIGN_UPLOADS_BUCKET).upload(fileName, buffer, {
    contentType: mimeType,
    upsert: false
  });
  throwIfSupabaseError(error, "upload design preview");

  const { data: publicUrlData } = supabase.storage.from(DESIGN_UPLOADS_BUCKET).getPublicUrl(fileName);
  return publicUrlData && publicUrlData.publicUrl ? publicUrlData.publicUrl : "";
}

const PRODUCTS_FILE = "products";
const ORDERS_FILE = "orders";
const ADMIN_FILE = "admin";
const CUSTOMERS_FILE = "customers";

const PRODUCT_COLUMNS = {
  id: "id",
  name: "name",
  price: "price",
  currency: "currency",
  category: "category",
  description: "description",
  image: "image",
  sizes: "sizes",
  colors: "colors",
  featured: "featured"
};

const ORDER_COLUMNS = {
  id: "id",
  createdAt: "created_at",
  status: "status",
  paymentStatus: "payment_status",
  type: "type",
  source: "source",
  customerId: "customer_id",
  customerName: "customer_name",
  customerPhone: "customer_phone",
  customerEmail: "customer_email",
  notes: "notes",
  productId: "product_id",
  productName: "product_name",
  size: "size",
  color: "color",
  quantity: "quantity",
  unitPrice: "unit_price",
  subtotalPrice: "subtotal_price",
  discountAmount: "discount_amount",
  finalPrice: "final_price",
  currency2: "currency",
  priceLabel: "price_label",
  customPreview: "custom_preview",
  customShirtColor: "custom_shirt_color",
  paymentSessionId: "payment_session_id",
  paymentReference: "payment_reference"
};

const CUSTOMER_COLUMNS = {
  id: "id",
  name: "name",
  email: "email",
  salt: "salt",
  hash: "hash",
  createdAt: "created_at",
  updatedAt: "updated_at",
  lastLoginAt: "last_login_at"
};

function throwIfSupabaseError(error, context) {
  if (error) {
    const err = new Error(`Supabase ${context} failed: ${error.message}`);
    err.cause = error;
    throw err;
  }
}

function productRowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price || 0),
    currency: row.currency || "EGP",
    category: row.category || "",
    description: row.description || "",
    image: row.image || "",
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    colors: Array.isArray(row.colors) ? row.colors : [],
    featured: Boolean(row.featured)
  };
}

function productJsonToRow(item) {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    currency: item.currency,
    category: item.category,
    description: item.description,
    image: item.image,
    sizes: item.sizes || [],
    colors: item.colors || [],
    featured: Boolean(item.featured)
  };
}

function orderRowToJson(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    paymentStatus: row.payment_status,
    type: row.type,
    source: row.source,
    customerId: row.customer_id || "",
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    customerEmail: row.customer_email || "",
    notes: row.notes || "",
    productId: row.product_id || "",
    productName: row.product_name || "",
    size: row.size || "",
    color: row.color || "",
    quantity: Number(row.quantity || 1),
    unitPrice: Number(row.unit_price || 0),
    subtotalPrice: Number(row.subtotal_price || 0),
    discountAmount: Number(row.discount_amount || 0),
    finalPrice: Number(row.final_price || 0),
    currency: row.currency || "egp",
    priceLabel: row.price_label || "",
    customPreview: row.custom_preview || "",
    customShirtColor: row.custom_shirt_color || "",
    paymentSessionId: row.payment_session_id || "",
    paymentReference: row.payment_reference || ""
  };
}

function orderJsonToRow(item) {
  return {
    id: item.id,
    created_at: item.createdAt,
    status: item.status,
    payment_status: item.paymentStatus,
    type: item.type,
    source: item.source,
    customer_id: item.customerId || null,
    customer_name: item.customerName,
    customer_phone: item.customerPhone,
    customer_email: item.customerEmail,
    notes: item.notes,
    product_id: item.productId,
    product_name: item.productName,
    size: item.size,
    color: item.color,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal_price: item.subtotalPrice,
    discount_amount: item.discountAmount,
    final_price: item.finalPrice,
    currency: item.currency,
    price_label: item.priceLabel,
    custom_preview: item.customPreview,
    custom_shirt_color: item.customShirtColor,
    payment_session_id: item.paymentSessionId,
    payment_reference: item.paymentReference
  };
}

function customerRowToJson(row) {
  return {
    id: row.id,
    name: row.name || "",
    email: row.email,
    salt: row.salt,
    hash: row.hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || ""
  };
}

function customerJsonToRow(item) {
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    salt: item.salt,
    hash: item.hash,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    last_login_at: item.lastLoginAt || null
  };
}

function adminRowToJson(row) {
  if (!row) {
    return null;
  }
  return {
    username: row.username,
    salt: row.salt,
    hash: row.hash,
    mustChangePassword: Boolean(row.must_change_password),
    updatedAt: row.updated_at
  };
}

function adminJsonToRow(payload) {
  return {
    id: 1,
    username: payload.username,
    salt: payload.salt,
    hash: payload.hash,
    must_change_password: Boolean(payload.mustChangePassword),
    updated_at: payload.updatedAt || new Date().toISOString()
  };
}

async function ensureJsonFile(table, seedValue) {
  if (table === ADMIN_FILE) {
    return;
  }
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  throwIfSupabaseError(error, `count ${table}`);
  if (count === 0 && Array.isArray(seedValue) && seedValue.length) {
    await writeJson(table, seedValue);
  }
}

async function readJson(table, fallback) {
  if (table === ADMIN_FILE) {
    const { data, error } = await supabase.from("admin_account").select("*").eq("id", 1).maybeSingle();
    throwIfSupabaseError(error, "read admin");
    return data ? adminRowToJson(data) : fallback;
  }

  if (table === PRODUCTS_FILE) {
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: true });
    throwIfSupabaseError(error, "read products");
    return (data || []).map(productRowToJson);
  }

  if (table === ORDERS_FILE) {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    throwIfSupabaseError(error, "read orders");
    return (data || []).map(orderRowToJson);
  }

  if (table === CUSTOMERS_FILE) {
    const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: true });
    throwIfSupabaseError(error, "read customers");
    return (data || []).map(customerRowToJson);
  }

  return fallback;
}

async function writeJson(table, value) {
  if (table === ADMIN_FILE) {
    const row = adminJsonToRow(value);
    const { error } = await supabase.from("admin_account").upsert(row, { onConflict: "id" });
    throwIfSupabaseError(error, "write admin");
    return;
  }

  if (table === PRODUCTS_FILE) {
    const rows = (Array.isArray(value) ? value : []).map(productJsonToRow);
    const incomingIds = rows.map(function (row) { return row.id; });
    const { data: existing, error: existingError } = await supabase.from("products").select("id");
    throwIfSupabaseError(existingError, "read products for sync");
    const staleIds = (existing || [])
      .map(function (row) { return row.id; })
      .filter(function (id) { return !incomingIds.includes(id); });
    if (staleIds.length) {
      const { error: delError } = await supabase.from("products").delete().in("id", staleIds);
      throwIfSupabaseError(delError, "prune products");
    }
    if (rows.length) {
      const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
      throwIfSupabaseError(error, "write products");
    }
    return;
  }

  if (table === ORDERS_FILE) {
    const rows = (Array.isArray(value) ? value : []).map(orderJsonToRow);
    const incomingIds = rows.map(function (row) { return row.id; });
    const { data: existing, error: existingError } = await supabase.from("orders").select("id");
    throwIfSupabaseError(existingError, "read orders for sync");
    const staleIds = (existing || [])
      .map(function (row) { return row.id; })
      .filter(function (id) { return !incomingIds.includes(id); });
    if (staleIds.length) {
      const { error: delError } = await supabase.from("orders").delete().in("id", staleIds);
      throwIfSupabaseError(delError, "prune orders");
    }
    if (rows.length) {
      const { error } = await supabase.from("orders").upsert(rows, { onConflict: "id" });
      throwIfSupabaseError(error, "write orders");
    }
    return;
  }

  if (table === CUSTOMERS_FILE) {
    const rows = (Array.isArray(value) ? value : []).map(customerJsonToRow);
    const incomingIds = rows.map(function (row) { return row.id; });
    const { data: existing, error: existingError } = await supabase.from("customers").select("id");
    throwIfSupabaseError(existingError, "read customers for sync");
    const staleIds = (existing || [])
      .map(function (row) { return row.id; })
      .filter(function (id) { return !incomingIds.includes(id); });
    if (staleIds.length) {
      const { error: delError } = await supabase.from("customers").delete().in("id", staleIds);
      throwIfSupabaseError(delError, "prune customers");
    }
    if (rows.length) {
      const { error } = await supabase.from("customers").upsert(rows, { onConflict: "id" });
      throwIfSupabaseError(error, "write customers");
    }
    return;
  }
}


function shouldPersistNormalized(rawValue, normalizedValue) {
  try {
    return JSON.stringify(rawValue) !== JSON.stringify(normalizedValue);
  } catch (_error) {
    return true;
  }
}

async function repairPersistedData() {
  const rawProducts = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
  const sourceProducts = Array.isArray(rawProducts) ? rawProducts : DEFAULT_PRODUCTS.slice();
  const normalizedProducts = sourceProducts.length
    ? sourceProducts.map(normalizeProduct)
    : DEFAULT_PRODUCTS.slice();

  if (shouldPersistNormalized(sourceProducts, normalizedProducts)) {
    await writeJson(PRODUCTS_FILE, normalizedProducts);
  }

  const rawOrders = await readJson(ORDERS_FILE, []);
  const sourceOrders = Array.isArray(rawOrders) ? rawOrders : [];
  const normalizedOrders = normalizeOrderList(sourceOrders, normalizedProducts);
  if (shouldPersistNormalized(sourceOrders, normalizedOrders)) {
    await writeJson(ORDERS_FILE, normalizedOrders);
  }
}

async function readBody(req, limitBytes) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];

    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", function (error) {
      reject(error);
    });
  });
}

function parseCookies(req) {
  const source = req.headers.cookie || "";
  const cookies = {};
  source.split(";").forEach(function (part) {
    const [rawKey, ...rest] = part.split("=");
    if (!rawKey) {
      return;
    }
    const key = rawKey.trim();
    const value = rest.join("=").trim();
    if (!key) {
      return;
    }
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function normalizeEmail(value) {
  const candidate = sanitizeString(value, "").toLowerCase();
  if (!candidate || !isEmailLike(candidate)) {
    return "";
  }
  return candidate;
}

function normalizeCustomerName(value, fallback) {
  const cleaned = sanitizeDisplayString(value, fallback || "");
  if (!cleaned) {
    return fallback || "";
  }
  return cleaned.slice(0, 80);
}

function getOrderAmountEgp(order) {
  const unitPrice = Number(order && order.unitPrice ? order.unitPrice : 0);
  const quantity = Math.max(1, Math.floor(Number(order && order.quantity ? order.quantity : 1)));
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(unitPrice * quantity));
}

function normalizeCustomerRecord(input, index) {
  const source = input && typeof input === "object" ? input : {};
  const nextIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const id =
    sanitizeString(source.id, "") ||
    "cus-" + Date.now().toString(36) + "-" + nextIndex.toString(36);

  return {
    id: id,
    name: normalizeCustomerName(source.name, ""),
    email: normalizeEmail(source.email),
    salt: sanitizeString(source.salt, ""),
    hash: sanitizeString(source.hash, ""),
    createdAt: sanitizeString(source.createdAt, new Date().toISOString()),
    updatedAt: sanitizeString(source.updatedAt, new Date().toISOString()),
    lastLoginAt: sanitizeString(source.lastLoginAt, "")
  };
}

function sanitizeCustomerPublic(customer) {
  const source = customer && typeof customer === "object" ? customer : {};
  return {
    id: sanitizeString(source.id, ""),
    name: normalizeCustomerName(source.name, ""),
    email: normalizeEmail(source.email)
  };
}

async function readCustomersList() {
  const rawCustomers = await readJson(CUSTOMERS_FILE, []);
  const list = Array.isArray(rawCustomers) ? rawCustomers : [];
  const normalized = list
    .map(function (item, index) {
      return normalizeCustomerRecord(item, index);
    })
    .filter(function (item) {
      return Boolean(item.email && item.salt && item.hash);
    });

  if (shouldPersistNormalized(list, normalized)) {
    await writeJson(CUSTOMERS_FILE, normalized);
  }

  return normalized;
}

function findCustomerByEmail(customers, email) {
  const list = Array.isArray(customers) ? customers : [];
  const target = normalizeEmail(email);
  if (!target) {
    return null;
  }
  return (
    list.find(function (item) {
      return normalizeEmail(item && item.email) === target;
    }) || null
  );
}

function createSession(username) {
  const token = crypto.randomBytes(30).toString("hex");
  SESSIONS.set(token, {
    username: username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of SESSIONS.entries()) {
    if (!session || session.expiresAt <= now) {
      SESSIONS.delete(token);
    }
  }
}

function getSession(req) {
  cleanupSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = SESSIONS.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    SESSIONS.delete(token);
    return null;
  }
  return {
    token: token,
    username: session.username
  };
}

function createCustomerSession(email) {
  const token = crypto.randomBytes(30).toString("hex");
  CUSTOMER_SESSIONS.set(token, {
    email: normalizeEmail(email),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function cleanupCustomerSessions() {
  const now = Date.now();
  for (const [token, session] of CUSTOMER_SESSIONS.entries()) {
    if (!session || session.expiresAt <= now) {
      CUSTOMER_SESSIONS.delete(token);
    }
  }
}

function getCustomerSession(req) {
  cleanupCustomerSessions();
  const cookies = parseCookies(req);
  const token = cookies[CUSTOMER_SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = CUSTOMER_SESSIONS.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    CUSTOMER_SESSIONS.delete(token);
    return null;
  }
  const email = normalizeEmail(session.email);
  if (!email) {
    CUSTOMER_SESSIONS.delete(token);
    return null;
  }
  return {
    token: token,
    email: email
  };
}

function isHttpsRequest(req) {
  const forwardedProto = req && req.headers ? req.headers["x-forwarded-proto"] : "";
  if (typeof forwardedProto === "string" && forwardedProto.trim()) {
    return forwardedProto
      .split(",")[0]
      .trim()
      .toLowerCase() === "https";
  }
  return Boolean(req && req.socket && req.socket.encrypted);
}

function setSessionCookie(req, res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`
  );
}

function setCustomerSessionCookie(req, res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${CUSTOMER_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function clearCustomerSessionCookie(req, res) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${CUSTOMER_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`
  );
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { ok: false, message: "Unauthorized" });
    return null;
  }
  return session;
}

async function requireCustomerProfile(req, res) {
  const session = getCustomerSession(req);
  if (!session) {
    json(res, 401, { ok: false, message: "You need to sign in first." });
    return null;
  }

  let customers;
  try {
    customers = await readCustomersList();
  } catch (error) {
    console.error("Failed to load customer profile:", error);
    json(res, 503, { ok: false, message: "Could not verify your account right now, please try again." });
    return null;
  }

  const customer = findCustomerByEmail(customers, session.email);
  if (!customer) {
    CUSTOMER_SESSIONS.delete(session.token);
    clearCustomerSessionCookie(req, res);
    json(res, 401, { ok: false, message: "Your session is no longer valid, please sign in again." });
    return null;
  }

  return {
    session: session,
    customer: customer,
    customers: customers
  };
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

let lastRateLimitCleanupAt = 0;

function cleanupRateLimits(now) {
  if (now - lastRateLimitCleanupAt < 60_000 && RATE_LIMITS.size < 4000) {
    return;
  }
  for (const [key, value] of RATE_LIMITS.entries()) {
    if (!value || value.resetAt <= now) {
      RATE_LIMITS.delete(key);
    }
  }
  lastRateLimitCleanupAt = now;
}

function checkRateLimit(key, maxCount, windowMs) {
  const now = Date.now();
  cleanupRateLimits(now);
  const current = RATE_LIMITS.get(key);

  if (!current || current.resetAt <= now) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= maxCount) {
    return false;
  }

  current.count += 1;
  RATE_LIMITS.set(key, current);
  return true;
}

function parseJsonBody(raw) {
  if (!raw || !raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

function normalizePaymentStatus(status) {
  const value = sanitizeString(status, "pending").toLowerCase();
  if (value === "pending" || value === "paid" || value === "failed" || value === "expired") {
    return value;
  }
  return "pending";
}

function capText(value, maxLength) {
  const text = sanitizeString(value, "");
  return text ? text.slice(0, maxLength) : "";
}

function formatOrderInput(input) {
  return {
    type: sanitizeString(input.type, "ready"),
    source: sanitizeString(input.source, "web"),
    customerId: sanitizeString(input.customerId, ""),
    customerName: capText(sanitizeDisplayString(input.customerName, ""), 80),
    customerPhone: sanitizeString(input.customerPhone, "").slice(0, 20),
    customerEmail: sanitizeString(input.customerEmail, "").slice(0, 190),
    notes: capText(sanitizeDisplayString(input.notes, ""), 500),
    productId: sanitizeString(input.productId, ""),
    productName: sanitizeDisplayString(input.productName, ""),
    size: sanitizeString(input.size, "").slice(0, 20),
    color: sanitizeDisplayString(input.color, ""),
    quantity: sanitizePrice(input.quantity, 1),
    unitPrice: sanitizePrice(input.unitPrice, 0),
    currency: sanitizeString(input.currency, "egp").toLowerCase(),
    priceLabel: sanitizeDisplayString(input.priceLabel, ""),
    customPreview: sanitizeString(input.customPreview, ""),
    customShirtColor: sanitizeDisplayString(input.customShirtColor, ""),
    paymentStatus: normalizePaymentStatus(input.paymentStatus),
    paymentSessionId: sanitizeString(input.paymentSessionId, ""),
    paymentReference: sanitizeString(input.paymentReference, "")
  };
}

function getFallbackProduct(products, productId, index) {
  const list = Array.isArray(products) && products.length ? products : DEFAULT_PRODUCTS;
  const matched = list.find(function (item) {
    return item && item.id === productId;
  });
  return matched || list[index % list.length] || DEFAULT_PRODUCTS[0];
}

function normalizeOrderRecord(input, index, products) {
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
  const fallbackPriceLabel = formatPriceLabel(
    finalPrice,
    fallback.currency || normalizeCurrencyLabel(currencyCode)
  );

  return {
    ...source,
    id: sanitizeString(source.id, `ord-${Date.now().toString(36)}-${index}`),
    createdAt: sanitizeString(source.createdAt, new Date().toISOString()),
    status: isValidOrderStatus(source.status) ? source.status : "new",
    paymentStatus: normalizePaymentStatus(source.paymentStatus),
    type: sanitizeString(source.type, "ready"),
    source: sanitizeString(source.source, "web"),
    customerId: sanitizeString(source.customerId, ""),
    customerName: capText(sanitizeDisplayString(source.customerName, ""), 80),
    customerPhone: sanitizeString(source.customerPhone, "").slice(0, 20),
    customerEmail: sanitizeString(source.customerEmail, "").slice(0, 190),
    notes: capText(sanitizeDisplayString(source.notes, ""), 500),
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
    priceLabel: sanitizeDisplayString(source.priceLabel, fallbackPriceLabel),
    customPreview: sanitizeString(source.customPreview, ""),
    customShirtColor: sanitizeDisplayString(source.customShirtColor, ""),
    paymentSessionId: sanitizeString(source.paymentSessionId, ""),
    paymentReference: sanitizeString(source.paymentReference, "")
  };
}

function normalizeOrderList(list, products) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map(function (item, index) {
    return normalizeOrderRecord(item, index, products);
  });
}

function validateOrderInput(order) {
  if (!order.customerName || !order.customerPhone) {
    return "Name and phone number are required.";
  }
  if (!/^01\d{9}$/.test(order.customerPhone)) {
    return "Phone number must start with 01 and be 11 digits long.";
  }
  if (!order.productName && order.type === "ready") {
    return "Product information is incomplete.";
  }
  if (!order.size) {
    return "Size is required.";
  }
  if (!order.color && order.type === "ready") {
    return "Color is required.";
  }
  if (order.customerEmail && !isEmailLike(order.customerEmail)) {
    return "Invalid email address.";
  }
  if (order.customPreview && order.customPreview.length > 3_000_000) {
    return "Design image exceeds the allowed size.";
  }
  if (order.quantity > 100) {
    return "Quantity exceeds the allowed limit.";
  }
  return null;
}

function enrichReadyOrderFromCatalog(order, products) {
  if (!order || order.type !== "ready") {
    return order;
  }

  const productId = sanitizeString(order.productId, "");
  if (!productId) {
    return order;
  }

  const catalog = Array.isArray(products) ? products : [];
  const matchedProduct = catalog.find(function (item) {
    return item && item.id === productId;
  });
  if (!matchedProduct) {
    return order;
  }

  if (!order.productName) {
    order.productName = sanitizeDisplayString(matchedProduct.name, "");
  }
  if (!order.color) {
    const defaultColor = Array.isArray(matchedProduct.colors) ? matchedProduct.colors[0] : "";
    order.color = sanitizeDisplayString(defaultColor, "Black");
  }

  const normalizedQuantity = Math.max(1, Math.floor(sanitizePrice(order.quantity, 1)));
  order.quantity = normalizedQuantity;
  if (!(Number(order.unitPrice) > 0)) {
    order.unitPrice = sanitizePrice(matchedProduct.price, 0);
  }
  if (!order.priceLabel) {
    const total = Number(order.unitPrice || 0) * normalizedQuantity;
    order.priceLabel = formatPriceLabel(total, matchedProduct.currency || order.currency);
  }

  return order;
}

function isValidOrderStatus(status) {
  return ORDER_STATUSES.includes(status);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function parseEmailList(rawValue) {
  const source = String(rawValue || "");
  if (!source.trim()) {
    return [];
  }

  const unique = new Set();
  source
    .split(/[\n,;]+/)
    .map(function (item) {
      return String(item || "").trim();
    })
    .forEach(function (item) {
      if (!item || !isEmailLike(item)) {
        return;
      }
      unique.add(item.toLowerCase());
    });

  return Array.from(unique);
}

function getAdminEmailRecipients() {
  const unique = new Set();
  const primary = String(ENV.adminNotifyEmail || "").trim().toLowerCase();
  if (primary && isEmailLike(primary)) {
    unique.add(primary);
  }
  parseEmailList(ENV.adminNotifyEmails).forEach(function (email) {
    unique.add(email);
  });

  return Array.from(unique);
}

function getDefaultSupportReplyToEmail() {
  const preferred = String(ENV.supportReplyToEmail || "").trim().toLowerCase();
  if (preferred && isEmailLike(preferred)) {
    return preferred;
  }

  const recipients = getAdminEmailRecipients();
  return recipients.length ? recipients[0] : "";
}

function getOrderSummaryText(order) {
  const discountLabel = Number(order.discountAmount || 0) > 0 ? `${order.discountAmount} EGP` : "0 EGP";
  return [
    `Order ID: ${order.id || "-"}`,
    `Product: ${order.productName || "-"}`,
    `Type: ${order.type === "custom" ? "Custom design" : "Ready-made"}`,
    `Size: ${order.size || "-"}`,
    `Color: ${order.color || "-"}`,
    `Quantity: ${order.quantity || "-"}`,
    `Name: ${order.customerName || "-"}`,
    `Phone: ${order.customerPhone || "-"}`,
    `Email: ${order.customerEmail || "Not provided"}`,
    `Discount: ${discountLabel}`,
    `Final price: ${order.priceLabel || "-"}`
  ].join("\n");
}

function buildOrderEmailTemplateParams(order, recipientEmail, audience) {
  const emailTo = String(recipientEmail || "").trim().toLowerCase();
  const customerEmail = String(order.customerEmail || "").trim().toLowerCase();
  const customerName = String(order.customerName || "").trim();
  const customerPhone = String(order.customerPhone || "").trim();
  const supportReplyTo = getDefaultSupportReplyToEmail();
  const orderId = String(order.id || "");
  const subjectLine = audience === "customer" ? `Your order has been received ${orderId}` : `New order ${orderId}`;
  let dateLabel = "";
  try {
    dateLabel = new Date(order.createdAt || Date.now()).toLocaleString("en-US");
  } catch (_error) {
    dateLabel = String(order.createdAt || "");
  }
  const contactEmail = audience === "admin" ? customerEmail || emailTo : emailTo;
  const payload = {
    to_email: emailTo,
    email: contactEmail,
    recipient_email: emailTo,
    recipient: emailTo,
    subject: subjectLine,
    title: subjectLine,
    name: customerName,
    whatsapp: customerPhone,
    date: dateLabel,
    from_name: customerName,
    brand_name: "VANTAGE",
    order_id: orderId,
    order_number: orderId,
    product_name: String(order.productName || ""),
    product_type: String(order.type === "custom" ? "Custom design" : "Ready-made"),
    size: String(order.size || ""),
    color: String(order.color || ""),
    quantity: String(order.quantity || ""),
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    price_label: String(order.priceLabel || ""),
    message: getOrderSummaryText(order),
    reply_to: supportReplyTo || ""
  };
  return payload;
}

async function sendEmailViaEmailJs(to, templateId, templateParams, options) {
  const recipient = String(to || "").trim().toLowerCase();
  if (
    !recipient ||
    !isEmailLike(recipient) ||
    !templateId ||
    !ENV.emailjsServiceId ||
    !ENV.emailjsPublicKey ||
    !ENV.emailjsPrivateKey
  ) {
    return false;
  }

  const extra = options && typeof options === "object" ? options : {};
  const params = {
    ...(templateParams && typeof templateParams === "object" ? templateParams : {})
  };
  if (!isEmailLike(params.to_email)) {
    params.to_email = recipient;
  }
  if (!isEmailLike(params.email)) {
    params.email = recipient;
  }
  if (!isEmailLike(params.recipient_email)) {
    params.recipient_email = recipient;
  }
  if (!isEmailLike(params.recipient)) {
    params.recipient = recipient;
  }
  if (extra.replyTo && isEmailLike(extra.replyTo)) {
    params.reply_to = String(extra.replyTo).trim().toLowerCase();
  }

  const payload = {
    service_id: ENV.emailjsServiceId,
    template_id: templateId,
    user_id: ENV.emailjsPublicKey,
    accessToken: ENV.emailjsPrivateKey,
    template_params: params
  };

  const response = await fetchWithTimeout("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch (_error) {
      details = "";
    }
    throw new Error(
      `EmailJS send failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ""}`
    );
  }

  return true;
}

async function fetchWithTimeout(url, options) {
  const requestOptions = options ? { ...options } : {};
  const timeoutMs =
    Number.isFinite(OUTBOUND_HTTP_TIMEOUT_MS) && OUTBOUND_HTTP_TIMEOUT_MS > 0
      ? OUTBOUND_HTTP_TIMEOUT_MS
      : 6000;

  if (typeof AbortController !== "function") {
    return fetch(url, requestOptions);
  }

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...requestOptions,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchOrderNotifications(order) {
  const tasks = [];
  const adminRecipients = getAdminEmailRecipients();
  const customerEmail = String(order.customerEmail || "").trim().toLowerCase();
  const hasCustomerEmailTarget = Boolean(customerEmail && isEmailLike(customerEmail));
  const hasAdminEmailTarget = adminRecipients.length > 0;
  const supportReplyTo = getDefaultSupportReplyToEmail();

  const canSendEmailViaEmailJs = Boolean(
    ENV.emailjsServiceId && ENV.emailjsPublicKey && ENV.emailjsPrivateKey
  );

  if (!canSendEmailViaEmailJs && (hasAdminEmailTarget || hasCustomerEmailTarget)) {
    console.warn("Email notifications skipped: EmailJS is not fully configured.");
  }

  if (canSendEmailViaEmailJs && ENV.emailjsTemplateAdmin && hasAdminEmailTarget) {
    adminRecipients.forEach(function (recipient) {
      const replyToForAdmin = hasCustomerEmailTarget ? customerEmail : supportReplyTo;
      tasks.push(
        sendEmailViaEmailJs(
          recipient,
          ENV.emailjsTemplateAdmin,
          buildOrderEmailTemplateParams(order, recipient, "admin"),
          {
            replyTo: replyToForAdmin
          }
        )
      );
    });
  }

  if (hasCustomerEmailTarget && canSendEmailViaEmailJs && ENV.emailjsTemplateCustomer) {
    tasks.push(
      sendEmailViaEmailJs(
        customerEmail,
        ENV.emailjsTemplateCustomer,
        buildOrderEmailTemplateParams(order, customerEmail, "customer"),
        {
          replyTo: supportReplyTo
        }
      )
    );
  }

  if (!tasks.length) {
    return;
  }

  const settled = await Promise.allSettled(tasks);
  settled.forEach(function (item) {
    if (item.status === "rejected") {
      console.warn("Notification error:", item.reason);
    }
  });
}

function notFound(res) {
  text(res, 404, "404 Not Found");
}

function isPathInside(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isStaticPathBlocked(normalizedPath) {
  const unixPath = String(normalizedPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!unixPath) {
    return true;
  }

  const segments = unixPath.split("/").filter(Boolean);
  if (!segments.length) {
    return true;
  }

  if (segments.some(function (segment) { return segment === "." || segment === ".."; })) {
    return true;
  }

  if (segments.some(function (segment) { return segment.startsWith("."); })) {
    return true;
  }

  const firstSegment = String(segments[0] || "").toLowerCase();
  if (BLOCKED_STATIC_ROOTS.has(firstSegment)) {
    return true;
  }

  const filename = String(segments[segments.length - 1] || "").toLowerCase();
  if (BLOCKED_STATIC_FILES.has(filename)) {
    return true;
  }
  if (filename.startsWith(".env.")) {
    return true;
  }
  if (filename.endsWith(".md")) {
    return true;
  }

  return false;
}

function getPublicBaseUrl(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" && forwardedProto.trim()
      ? forwardedProto.split(",")[0].trim()
      : "http";
  const host = req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

function hasConfiguredValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const placeholders = [
    "change_this_password",
    "your-domain.com",
    "your-domain",
    "xxxxxxxxx",
    "example.com",
    "your_"
  ];
  return placeholders.some(function (token) {
    return normalized.includes(token);
  });
}

function isLocalHostUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const hostname = String(parsed.hostname || "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch (_error) {
    return false;
  }
}

function isHttpsPublicUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:") {
      return false;
    }
    return !isLocalHostUrl(value);
  } catch (_error) {
    return false;
  }
}

function buildSetupStatus(req) {
  const baseUrl = getPublicBaseUrl(req);
  const domainReady = isHttpsPublicUrl(baseUrl);
  const adminEmailRecipients = getAdminEmailRecipients();
  const adminEmailTargetConfigured = adminEmailRecipients.length > 0;
  const adminPasswordConfigured =
    hasConfiguredValue(process.env.ADMIN_PASSWORD || "") &&
    !isPlaceholderValue(process.env.ADMIN_PASSWORD || "");
  const emailjsCoreConfigured =
    hasConfiguredValue(ENV.emailjsServiceId) &&
    hasConfiguredValue(ENV.emailjsPublicKey) &&
    hasConfiguredValue(ENV.emailjsPrivateKey) &&
    !isPlaceholderValue(ENV.emailjsServiceId) &&
    !isPlaceholderValue(ENV.emailjsPublicKey) &&
    !isPlaceholderValue(ENV.emailjsPrivateKey);
  const emailjsTemplateConfigured =
    (hasConfiguredValue(ENV.emailjsTemplateCustomer) && !isPlaceholderValue(ENV.emailjsTemplateCustomer)) ||
    (hasConfiguredValue(ENV.emailjsTemplateAdmin) && !isPlaceholderValue(ENV.emailjsTemplateAdmin));
  const emailjsConfigured = emailjsCoreConfigured && emailjsTemplateConfigured && adminEmailTargetConfigured;

  const checks = [
    {
      id: "admin_password",
      label: "ADMIN_PASSWORD",
      configured: adminPasswordConfigured,
      required: true,
      where: "Set a strong password in .env.local or on your hosting platform."
    },
    {
      id: "manual_payment",
      label: "Manual payment via WhatsApp",
      configured: true,
      required: true,
      where: "Payment is handled manually via the admin WhatsApp number."
    },
    {
      id: "public_domain",
      label: "HTTPS domain",
      configured: domainReady,
      required: false,
      where: "Optional for now. Connect a domain with SSL before going live.",
      value: baseUrl
    },
    {
      id: "emailjs",
      label: "Email notifications (EmailJS)",
      configured: emailjsConfigured,
      required: false,
      where: "Optional: EmailJS service + templates + public/private keys + admin email",
      url: "https://dashboard.emailjs.com/"
    }
  ];

  const readyForLaunch = adminPasswordConfigured;

  return {
    ok: true,
    brand: "VANTAGE",
    generatedAt: new Date().toISOString(),
    baseUrl: baseUrl,
    readiness: {
      readyForPayments: true,
      readyForLaunch: readyForLaunch
    },
    checks: checks,
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
function buildSitemapXml(baseUrl) {
  const routes = ["/", "/admin", "/privacy.html", "/shipping.html", "/returns.html", "/terms.html"];
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map(function (route) {
      return [
        "  <url>",
        `    <loc>${baseUrl}${route}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        "    <priority>0.8</priority>",
        "  </url>"
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>"
  ].join("\n");
}

async function handleApi(req, res, urlObj) {
  const pathname = urlObj.pathname || "";
  const method = req.method || "GET";
  applyApiCorsHeaders(req, res);
  if (method === "OPTIONS") {
    writeHeadSecure(res, 204, { "Content-Length": "0" });
    res.end();
    return true;
  }
  const setupStatus = buildSetupStatus(req);

  if (pathname === "/api/health" && method === "GET") {
    json(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      services: {
        payments: {
          mode: "manual_whatsapp",
          onlineCheckoutEnabled: false
        },
        notifications: {
          emailjsConfigured: Boolean(
            ENV.emailjsServiceId &&
              ENV.emailjsPublicKey &&
              ENV.emailjsPrivateKey &&
              (ENV.emailjsTemplateCustomer || ENV.emailjsTemplateAdmin) &&
              getAdminEmailRecipients().length
          )
        }
      },
      readiness: setupStatus.readiness
    });
    return true;
  }

  if (pathname === "/api/setup/status" && method === "GET") {
    json(res, 200, setupStatus);
    return true;
  }

  if (pathname === "/api/auth/session" && method === "GET") {
    const session = getSession(req);
    if (!session) {
      json(res, 200, { ok: true, authenticated: false });
      return true;
    }
    try {
      const admin = await readJson(ADMIN_FILE, null);
      json(res, 200, {
        ok: true,
        authenticated: true,
        user: {
          username: session.username,
          mustChangePassword: Boolean(admin && admin.mustChangePassword)
        }
      });
    } catch (error) {
      console.error("Failed to load admin session:", error);
      json(res, 503, { ok: false, message: "Could not verify the session right now, please try again." });
    }
    return true;
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const ip = getClientIp(req);
    const allowed = checkRateLimit(`login:${ip}`, 12, 1000 * 60 * 15);
    if (!allowed) {
      json(res, 429, { ok: false, message: "Too many attempts, try again in a few minutes." });
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 500_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    const username = sanitizeString(body.username, "").toLowerCase();
    const password = sanitizeString(body.password, "");

    try {
      const admin = await readJson(ADMIN_FILE, null);
      if (!admin || !admin.username || !admin.salt || !admin.hash) {
        json(res, 500, { ok: false, message: "Could not read admin data." });
        return true;
      }

      const isMatch =
        username === String(admin.username).toLowerCase() &&
        verifyPassword(password, admin.salt, admin.hash);

      if (!isMatch) {
        json(res, 401, { ok: false, message: "Invalid login credentials." });
        return true;
      }

      const token = createSession(admin.username);
      setSessionCookie(req, res, token);
      json(res, 200, {
        ok: true,
        user: {
          username: admin.username,
          mustChangePassword: Boolean(admin.mustChangePassword)
        }
      });
      return true;
    } catch (error) {
      console.error("Failed to process admin login:", error);
      json(res, 503, { ok: false, message: "Could not process the login request right now, please try again." });
      return true;
    }
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    const session = getSession(req);
    if (session) {
      SESSIONS.delete(session.token);
    }
    clearSessionCookie(req, res);
    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/auth/change-password" && method === "POST") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 500_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    const currentPassword = sanitizeString(body.currentPassword, "");
    const newPassword = sanitizeString(body.newPassword, "");

    if (!newPassword || newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
      json(res, 400, {
        ok: false,
        message: `The new password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`
      });
      return true;
    }

    try {
      const admin = await readJson(ADMIN_FILE, null);
      if (!admin || !verifyPassword(currentPassword, admin.salt, admin.hash)) {
        json(res, 401, { ok: false, message: "Current password is incorrect." });
        return true;
      }

      const password = createPasswordHash(newPassword);
      const nextAdmin = {
        username: admin.username,
        salt: password.salt,
        hash: password.hash,
        mustChangePassword: false,
        updatedAt: new Date().toISOString()
      };
      await writeJson(ADMIN_FILE, nextAdmin);
      json(res, 200, { ok: true, message: "Password updated successfully." });
      return true;
    } catch (error) {
      console.error("Failed to update admin password:", error);
      json(res, 503, { ok: false, message: "Could not update the password right now, please try again." });
      return true;
    }
  }

  if (pathname === "/api/customer-auth/session" && method === "GET") {
    const session = getCustomerSession(req);
    if (!session) {
      json(res, 200, { ok: true, authenticated: false });
      return true;
    }
    try {
      const customers = await readCustomersList();
      const customer = findCustomerByEmail(customers, session.email);
      if (!customer) {
        CUSTOMER_SESSIONS.delete(session.token);
        clearCustomerSessionCookie(req, res);
        json(res, 200, { ok: true, authenticated: false });
        return true;
      }
      json(res, 200, {
        ok: true,
        authenticated: true,
        user: sanitizeCustomerPublic(customer)
      });
    } catch (error) {
      console.error("Failed to load customer session:", error);
      json(res, 503, { ok: false, message: "Could not verify the session right now, please try again." });
    }
    return true;
  }

  if (pathname === "/api/customer-auth/signup" && method === "POST") {
    const ip = getClientIp(req);
    const allowed = checkRateLimit(`customer-signup:${ip}`, 8, 1000 * 60 * 15);
    if (!allowed) {
      json(res, 429, { ok: false, message: "Too many attempts, try again in a few minutes." });
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 500_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    const name = normalizeCustomerName(body.name, "");
    const email = normalizeEmail(body.email);
    const password = sanitizeString(body.password, "");

    if (!name || name.length < 2) {
      json(res, 400, { ok: false, message: "Name is required and must be at least 2 characters." });
      return true;
    }
    if (!email) {
      json(res, 400, { ok: false, message: "Invalid email address." });
      return true;
    }
    if (!password || password.length < CUSTOMER_PASSWORD_MIN_LENGTH) {
      json(res, 400, {
        ok: false,
        message: `Password must be at least ${CUSTOMER_PASSWORD_MIN_LENGTH} characters.`
      });
      return true;
    }

    try {
      const customers = await readCustomersList();
      if (findCustomerByEmail(customers, email)) {
        json(res, 409, { ok: false, message: "This email is already registered, try signing in instead." });
        return true;
      }

      const nextPassword = createPasswordHash(password);
      const now = new Date().toISOString();
      const nextCustomer = normalizeCustomerRecord(
        {
          id: "cus-" + Date.now().toString(36) + "-" + crypto.randomBytes(2).toString("hex"),
          name: name,
          email: email,
          salt: nextPassword.salt,
          hash: nextPassword.hash,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now
        },
        0
      );
      const nextCustomers = [nextCustomer].concat(customers);
      await writeJson(CUSTOMERS_FILE, nextCustomers);

      const token = createCustomerSession(nextCustomer.email);
      setCustomerSessionCookie(req, res, token);
      json(res, 201, {
        ok: true,
        user: sanitizeCustomerPublic(nextCustomer)
      });
      return true;
    } catch (error) {
      console.error("Failed to create customer account:", error);
      json(res, 503, { ok: false, message: "Could not create the account right now, please try again." });
      return true;
    }
  }

  if (pathname === "/api/customer-auth/signin" && method === "POST") {
    const ip = getClientIp(req);
    const allowed = checkRateLimit(`customer-signin:${ip}`, 12, 1000 * 60 * 15);
    if (!allowed) {
      json(res, 429, { ok: false, message: "Too many attempts, try again in a few minutes." });
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 500_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    const email = normalizeEmail(body.email);
    const password = sanitizeString(body.password, "");

    if (!email || !password) {
      json(res, 400, { ok: false, message: "Email and password are required." });
      return true;
    }

    try {
      const customers = await readCustomersList();
      const customer = findCustomerByEmail(customers, email);
      if (!customer || !verifyPassword(password, customer.salt, customer.hash)) {
        json(res, 401, { ok: false, message: "Incorrect email or password." });
        return true;
      }

      const customerIndex = customers.findIndex(function (item) {
        return item.id === customer.id;
      });
      const now = new Date().toISOString();
      if (customerIndex >= 0) {
        customers[customerIndex] = normalizeCustomerRecord(
          {
            ...customers[customerIndex],
            updatedAt: customers[customerIndex].updatedAt || now,
            lastLoginAt: now
          },
          customerIndex
        );
        await writeJson(CUSTOMERS_FILE, customers);
      }

      const token = createCustomerSession(customer.email);
      setCustomerSessionCookie(req, res, token);
      json(res, 200, {
        ok: true,
        user: sanitizeCustomerPublic(customer)
      });
      return true;
    } catch (error) {
      console.error("Failed to sign in customer:", error);
      json(res, 503, { ok: false, message: "Could not sign in right now, please try again." });
      return true;
    }
  }

  if (pathname === "/api/customer-auth/signout" && method === "POST") {
    const session = getCustomerSession(req);
    if (session) {
      CUSTOMER_SESSIONS.delete(session.token);
    }
    clearCustomerSessionCookie(req, res);
    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/products" && method === "GET") {
    try {
      const products = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const normalized = Array.isArray(products)
        ? products.map(normalizeProduct)
        : DEFAULT_PRODUCTS.slice();
      json(res, 200, { ok: true, products: normalized });
    } catch (error) {
      console.error("Failed to load products:", error);
      json(res, 503, { ok: false, message: "Could not load products right now, please try again." });
    }
    return true;
  }

  if (pathname === "/api/products" && method === "POST") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 2_000_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    try {
      const current = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const list = Array.isArray(current) ? current.map(normalizeProduct) : [];
      const product = normalizeProduct(body, list.length);
      list.unshift(product);
      await writeJson(PRODUCTS_FILE, list);
      json(res, 201, { ok: true, product: product });
      return true;
    } catch (error) {
      console.error("Failed to add product:", error);
      json(res, 503, { ok: false, message: "Could not add the product right now, please try again." });
      return true;
    }
  }

  if (pathname.startsWith("/api/products/") && method === "PUT") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    const productId = decodeURIComponent(pathname.replace("/api/products/", ""));
    if (!productId) {
      json(res, 400, { ok: false, message: "Invalid product ID." });
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 2_000_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    try {
      const current = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const list = Array.isArray(current) ? current.map(normalizeProduct) : [];
      const index = list.findIndex(function (item) {
        return item.id === productId;
      });

      if (index < 0) {
        json(res, 404, { ok: false, message: "Product not found." });
        return true;
      }

      const merged = normalizeProduct(
        {
          ...list[index],
          ...body,
          id: productId
        },
        index
      );
      list[index] = merged;
      await writeJson(PRODUCTS_FILE, list);
      json(res, 200, { ok: true, product: merged });
      return true;
    } catch (error) {
      console.error("Failed to update product:", error);
      json(res, 503, { ok: false, message: "Could not update the product right now, please try again." });
      return true;
    }
  }

  if (pathname.startsWith("/api/products/") && method === "DELETE") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    const productId = decodeURIComponent(pathname.replace("/api/products/", ""));
    try {
      const current = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const list = Array.isArray(current) ? current.map(normalizeProduct) : [];
      const next = list.filter(function (item) {
        return item.id !== productId;
      });

      if (next.length === list.length) {
        json(res, 404, { ok: false, message: "Product not found." });
        return true;
      }

      await writeJson(PRODUCTS_FILE, next);
      json(res, 200, { ok: true });
    } catch (error) {
      console.error("Failed to delete product:", error);
      json(res, 503, { ok: false, message: "Could not delete the product right now, please try again." });
    }
    return true;
  }

  if (pathname === "/api/products/reset" && method === "POST") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    try {
      await writeJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      json(res, 200, { ok: true, products: DEFAULT_PRODUCTS.slice() });
    } catch (error) {
      console.error("Failed to reset products:", error);
      json(res, 503, { ok: false, message: "Could not reset products right now, please try again." });
    }
    return true;
  }

  if (pathname === "/api/products/import" && method === "POST") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 4_000_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    if (!Array.isArray(body)) {
      json(res, 400, { ok: false, message: "The import file must be a JSON list of products." });
      return true;
    }

    try {
      const seenIds = new Set();
      const normalized = body.map(function (item, index) {
        const product = normalizeProduct(item, index);
        let nextId = sanitizeString(product.id, `product-${index + 1}`);
        while (seenIds.has(nextId)) {
          nextId = `${nextId}-${crypto.randomBytes(2).toString("hex")}`;
        }
        seenIds.add(nextId);
        return {
          ...product,
          id: nextId
        };
      });

      await writeJson(PRODUCTS_FILE, normalized);
      json(res, 200, { ok: true, products: normalized });
      return true;
    } catch (error) {
      console.error("Failed to import products:", error);
      json(res, 503, { ok: false, message: "Could not import the products right now, please try again." });
      return true;

    }
  }

  if (pathname === "/api/orders" && method === "POST") {
    const customerContext = await requireCustomerProfile(req, res);
    if (!customerContext) {
      return true;
    }

    const signedInCustomer = sanitizeCustomerPublic(customerContext.customer);
    const ip = getClientIp(req);
    const allowed = checkRateLimit(`order:${ip}`, 20, 1000 * 60 * 15);
    if (!allowed) {
      json(res, 429, { ok: false, message: "Too many requests, try again in a few minutes." });
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 4_000_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    const order = formatOrderInput(body);
    order.customerId = signedInCustomer.id;
    order.customerEmail = signedInCustomer.email;
    if (!order.customerName) {
      order.customerName = signedInCustomer.name || "VANTAGE Customer";
    }

    if (order.customPreview && order.customPreview.startsWith("data:")) {
      let savedPath;
      try {
        savedPath = await saveDesignPreviewToFile(order.customPreview);
      } catch (error) {
        console.error("Failed to save design preview:", error);
        json(res, 503, { ok: false, message: "Could not save the design image right now, please try again." });
        return true;
      }
      if (!savedPath) {
        json(res, 400, { ok: false, message: "Design image is invalid or too large." });
        return true;
      }
      order.customPreview = savedPath;
    }

    try {
      const rawProducts = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const products = Array.isArray(rawProducts)
        ? rawProducts.map(normalizeProduct)
        : DEFAULT_PRODUCTS.slice();
      enrichReadyOrderFromCatalog(order, products);
      const validationError = validateOrderInput(order);
      if (validationError) {
        json(res, 400, { ok: false, message: validationError });
        return true;
      }

      const customerIndex = customerContext.customers.findIndex(function (item) {
        return item && item.id === customerContext.customer.id;
      });
      const activeCustomer =
        customerIndex >= 0 ? customerContext.customers[customerIndex] : customerContext.customer;
      const subtotalEgp = getOrderAmountEgp(order);

      const orders = await readJson(ORDERS_FILE, []);
      const list = normalizeOrderList(Array.isArray(orders) ? orders : [], products);
      const nowIso = new Date().toISOString();
      const nextOrder = normalizeOrderRecord(
        {
          ...order,
          id: "ord-" + Date.now().toString(36) + "-" + crypto.randomBytes(2).toString("hex"),
          createdAt: nowIso,
          status: "new",
          paymentStatus: "pending",
          subtotalPrice: subtotalEgp,
          discountAmount: 0,
          finalPrice: subtotalEgp,
          priceLabel: formatPriceLabel(subtotalEgp, order.currency || "egp")
        },
        0,
        products
      );
      list.unshift(nextOrder);
      await writeJson(ORDERS_FILE, list.slice(0, 5000));

      dispatchOrderNotifications(nextOrder).catch(function (error) {
        console.warn("Order notification dispatch failed:", error);
      });
      json(res, 201, {
        ok: true,
        orderId: nextOrder.id,
        order: nextOrder,
        user: sanitizeCustomerPublic(activeCustomer)
      });
      return true;
    } catch (error) {
      console.error("Failed to submit order:", error);
      json(res, 503, { ok: false, message: "Could not submit the order right now, please try again." });
      return true;
    }
  }

  if (pathname === "/api/orders" && method === "GET") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    try {
      const rawProducts = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const products = Array.isArray(rawProducts)
        ? rawProducts.map(normalizeProduct)
        : DEFAULT_PRODUCTS.slice();
      const orders = await readJson(ORDERS_FILE, []);
      const list = normalizeOrderList(Array.isArray(orders) ? orders : [], products);
      json(res, 200, { ok: true, orders: list });
    } catch (error) {
      console.error("Failed to load orders:", error);
      json(res, 503, { ok: false, message: "Could not load orders right now, please try again." });
    }
    return true;
  }

  if (pathname === "/api/orders/summary" && method === "GET") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    let list;
    try {
      const rawProducts = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const products = Array.isArray(rawProducts)
        ? rawProducts.map(normalizeProduct)
        : DEFAULT_PRODUCTS.slice();
      const orders = await readJson(ORDERS_FILE, []);
      list = normalizeOrderList(Array.isArray(orders) ? orders : [], products);
    } catch (error) {
      console.error("Failed to load orders summary:", error);
      json(res, 503, { ok: false, message: "Could not load the summary right now, please try again." });
      return true;
    }
    let totalRevenue = 0;
    let paidRevenue = 0;
    let paidOrders = 0;
    let openOrders = 0;

    list.forEach(function (order) {
      const rawFinal = Number(order && order.finalPrice);
      const amount =
        Number.isFinite(rawFinal) && rawFinal >= 0 ? rawFinal : Math.max(0, getOrderAmountEgp(order));
      totalRevenue += amount;

      const paymentStatus = String(order && order.paymentStatus ? order.paymentStatus : "").toLowerCase();
      if (paymentStatus === "paid") {
        paidOrders += 1;
        paidRevenue += amount;
      }

      const status = String(order && order.status ? order.status : "new");
      if (status === "new" || status === "in_progress" || status === "ready_to_ship") {
        openOrders += 1;
      }
    });

    json(res, 200, {
      ok: true,
      summary: {
        totalOrders: list.length,
        openOrders: openOrders,
        paidOrders: paidOrders,
        totalRevenue: Math.round(totalRevenue),
        paidRevenue: Math.round(paidRevenue),
        currency: "egp",
        updatedAt: new Date().toISOString()
      }
    });
    return true;
  }

  if (pathname === "/api/payments/checkout" && method === "POST") {
    json(res, 410, {
      ok: false,
      message: "Online payment is currently disabled. Use WhatsApp for manual payment."
    });
    return true;
  }

  const orderStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && method === "PATCH") {
    const session = requireAuth(req, res);
    if (!session) {
      return true;
    }

    const orderId = decodeURIComponent(orderStatusMatch[1] || "");
    if (!orderId) {
      json(res, 400, { ok: false, message: "Invalid order ID." });
      return true;
    }

    let body;
    try {
      const raw = await readBody(req, 500_000);
      body = parseJsonBody(raw);
    } catch (_error) {
      json(res, 400, { ok: false, message: "Invalid request body." });
      return true;
    }

    const nextStatus = sanitizeString(body.status, "");
    if (!isValidOrderStatus(nextStatus)) {
      json(res, 400, {
        ok: false,
        message: "Unsupported order status.",
        supportedStatuses: ORDER_STATUSES.slice()
      });
      return true;
    }

    try {
      const rawProducts = await readJson(PRODUCTS_FILE, DEFAULT_PRODUCTS.slice());
      const products = Array.isArray(rawProducts)
        ? rawProducts.map(normalizeProduct)
        : DEFAULT_PRODUCTS.slice();
      const orders = await readJson(ORDERS_FILE, []);
      const list = normalizeOrderList(Array.isArray(orders) ? orders : [], products);
      const index = list.findIndex(function (item) {
        return item.id === orderId;
      });

      if (index < 0) {
        json(res, 404, { ok: false, message: "Order not found." });
        return true;
      }

      list[index] = normalizeOrderRecord(
        {
          ...list[index],
          status: nextStatus,
          updatedAt: new Date().toISOString()
        },
        index,
        products
      );
      await writeJson(ORDERS_FILE, list);
      json(res, 200, { ok: true, order: list[index] });
      return true;
    } catch (error) {
      console.error("Failed to update order status:", error);
      json(res, 503, { ok: false, message: "Could not update the order status right now, please try again." });
      return true;
    }
  }

  json(res, 404, { ok: false, message: "API route not found." });
  return true;
}

async function serveStatic(req, res, urlObj) {
  const pathname = urlObj.pathname || "/";
  let requestedPath = pathname;

  if (pathname === "/robots.txt") {
    const baseUrl = getPublicBaseUrl(req);
    const payload = [`User-agent: *`, `Allow: /`, `Sitemap: ${baseUrl}/sitemap.xml`].join("\n");
    writeHeadSecure(res, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    });
    res.end(payload);
    return;
  }

  if (pathname === "/sitemap.xml") {
    const baseUrl = getPublicBaseUrl(req);
    const payload = buildSitemapXml(baseUrl);
    writeHeadSecure(res, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    });
    res.end(payload);
    return;
  }

  if (pathname === "/") {
    requestedPath = "/index.html";
  } else if (pathname === "/admin" || pathname === "/admin/") {
    requestedPath = "/admin.html";
  }

  const normalized = path.normalize(requestedPath).replace(/^([/\\])+/, "");
  if (isStaticPathBlocked(normalized)) {
    notFound(res);
    return;
  }

  const fullPath = path.resolve(ROOT_DIR, normalized);

  if (!isPathInside(ROOT_DIR, fullPath)) {
    notFound(res);
    return;
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      notFound(res);
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = await fs.readFile(fullPath);
    writeHeadSecure(res, 200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(content);
  } catch (_error) {
    notFound(res);
  }
}

async function bootstrap() {
  await ensureDataStore();
  await repairPersistedData();

  const server = http.createServer(async function (req, res) {
    try {
      const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if ((urlObj.pathname || "").startsWith("/api/")) {
        await handleApi(req, res, urlObj);
        return;
      }
      await serveStatic(req, res, urlObj);
    } catch (error) {
      console.error("Server error:", error);
      json(res, 500, { ok: false, message: "Internal Server Error" });
    }
  });

  server.listen(PORT, HOST, function () {
    console.log(`VANTAGE server running at http://${HOST}:${PORT}`);
  });
}

bootstrap().catch(function (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
});