(function () {
  "use strict";

  const APP_CONFIG = {
    whatsappPhone: "201140094137"
  };

  const ALL_CATEGORY_KEY = "__all__";

  const TXT = {
    showDetails: "Show Details",
    pleaseLogin: "You need to sign in first.",
    loginForOrder: "You need to sign in to confirm the order.",
    chooseProduct: "Please choose a product first.",
    invalidPhone: "Phone number must start with 01 and be 11 digits long.",
    orderOk: "Order confirmed successfully.",
    orderFallback: "Could not save the order automatically, opening WhatsApp.",
    signinOk: "Signed in successfully.",
    signupOk: "Account created successfully.",
    logoutOk: "Signed out successfully."
  };

  const fallbackStoreApi = {
    readProducts: async function () {
      return [];
    },
    createOrder: async function () {
      return { ok: true };
    },
    customerSignUp: async function (_name, email) {
      return {
        ok: true,
        user: {
          id: "fallback-user",
          name: "User",
          email: String(email || "").trim().toLowerCase()
        }
      };
    },
    customerSignIn: async function () {
      throw new Error("Sign in is unavailable in fallback mode.");
    },
    customerSignOut: async function () {
      return { ok: true };
    },
    getCustomerSession: async function () {
      return { ok: true, authenticated: false, user: null };
    }
  };

  const storeApi = window.YYStoreData || fallbackStoreApi;

  const state = {
    products: [],
    activeCategory: ALL_CATEGORY_KEY,
    selectedProduct: null,
    toastTimer: null,
    customer: {
      authenticated: false,
      user: null
    },
    pendingProductId: "",
    studio: {
      shirtColor: "#0c0c0c",
      logoImage: null,
      logoLoaded: false,
      selectedLayer: "logo",
      logo: { x: 300, y: 300, scale: 1, rotation: 0, baseSize: 220 },
      text: { x: 300, y: 480, scale: 1, rotation: 0, value: "", color: "#ffffff", font: "Tajawal, sans-serif" },
      isDragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0
    }
  };

  const refs = {};
  let productsMarqueeController = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheRefs();
    setupNavbar();
    setupModalBehavior();
    setupOrderForm();
    setupAuthUi();
    setupDesignStudio();
    await hydrateCustomerSession();
    await loadProducts();
  }

  function cacheRefs() {
    refs.navToggle = document.getElementById("nav-toggle");
    refs.navLinks = document.getElementById("nav-links");

    refs.authTriggerBtn = document.getElementById("auth-trigger-btn");
    refs.authUserChip = document.getElementById("auth-user-chip");
    refs.authUserEmail = document.getElementById("auth-user-email");
    refs.authLogoutBtn = document.getElementById("auth-logout-btn");

    refs.filters = document.getElementById("product-filters");
    refs.productsGrid = document.getElementById("products-grid");
    refs.emptyProducts = document.getElementById("empty-products");

    refs.modal = document.getElementById("product-modal");
    refs.closeModalBtn = document.getElementById("close-modal-btn");
    refs.modalImg = document.getElementById("modal-img");
    refs.modalTitle = document.getElementById("modal-title");
    refs.modalPrice = document.getElementById("modal-price");
    refs.modalDescription = document.getElementById("modal-description");

    refs.orderForm = document.getElementById("order-form");
    refs.confirmOrderBtn = document.getElementById("confirm-order-btn");
    refs.orderSize = document.getElementById("order-size");
    refs.orderColor = document.getElementById("order-color");
    refs.orderName = document.getElementById("order-name");
    refs.orderPhone = document.getElementById("order-phone");
    refs.orderEmail = document.getElementById("order-email");

    refs.authModal = document.getElementById("auth-modal");
    refs.closeAuthModalBtn = document.getElementById("close-auth-modal-btn");
    refs.authModalNote = document.getElementById("auth-modal-note");
    refs.authTabSignIn = document.getElementById("auth-tab-signin");
    refs.authTabSignUp = document.getElementById("auth-tab-signup");
    refs.signInForm = document.getElementById("signin-form");
    refs.signUpForm = document.getElementById("signup-form");
    refs.signInSubmitBtn = document.getElementById("signin-submit-btn");
    refs.signUpSubmitBtn = document.getElementById("signup-submit-btn");

    refs.studioCanvas = document.getElementById("design-canvas");
    refs.studioColorOptions = document.getElementById("studio-color-options");
    refs.studioLogoUpload = document.getElementById("studio-logo-upload");
    refs.studioLogoName = document.getElementById("studio-logo-name");
    refs.studioTextInput = document.getElementById("studio-text-input");
    refs.studioTextColor = document.getElementById("studio-text-color");
    refs.studioTextFont = document.getElementById("studio-text-font");
    refs.studioSelectLogoBtn = document.getElementById("studio-select-logo");
    refs.studioSelectTextBtn = document.getElementById("studio-select-text");
    refs.studioScaleRange = document.getElementById("studio-scale-range");
    refs.studioRotateRange = document.getElementById("studio-rotate-range");
    refs.studioResetBtn = document.getElementById("studio-reset-btn");
    refs.studioConfirmBtn = document.getElementById("studio-confirm-btn");
    refs.studioCustomerName = document.getElementById("studio-customer-name");
    refs.studioCustomerPhone = document.getElementById("studio-customer-phone");

    refs.toast = document.getElementById("toast");
  }

  function setupNavbar() {
    if (!refs.navToggle || !refs.navLinks) {
      return;
    }

    refs.navToggle.addEventListener("click", function () {
      const isOpen = refs.navLinks.classList.toggle("is-open");
      refs.navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    refs.navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeNavMenu);
    });
  }

  function closeNavMenu() {
    if (!refs.navLinks || !refs.navToggle) {
      return;
    }
    refs.navLinks.classList.remove("is-open");
    refs.navToggle.setAttribute("aria-expanded", "false");
  }

  function setupAuthUi() {
    if (refs.authTriggerBtn) {
      refs.authTriggerBtn.addEventListener("click", function () {
        closeNavMenu();
        state.pendingProductId = "";
        openAuthModal("", "signin");
      });
    }

    if (refs.authLogoutBtn) {
      refs.authLogoutBtn.addEventListener("click", handleCustomerLogout);
    }

    if (refs.authTabSignIn) {
      refs.authTabSignIn.addEventListener("click", function () {
        setAuthTab("signin");
      });
    }

    if (refs.authTabSignUp) {
      refs.authTabSignUp.addEventListener("click", function () {
        setAuthTab("signup");
      });
    }

    if (refs.signInForm) {
      refs.signInForm.addEventListener("submit", handleSignInSubmit);
    }

    if (refs.signUpForm) {
      refs.signUpForm.addEventListener("submit", handleSignUpSubmit);
    }

    setAuthTab("signin");
    updateAuthUi();
  }

  async function hydrateCustomerSession() {
    try {
      const payload = await storeApi.getCustomerSession();
      applyCustomerSession(payload);
    } catch (error) {
      console.warn("Failed to hydrate customer session:", error);
      applyCustomerSession({ authenticated: false, user: null });
    }
    updateAuthUi();
  }

  function sanitizeCustomerUser(input) {
    const source = input && typeof input === "object" ? input : {};
    const email = String(source.email || "")
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return null;
    }

    return {
      id: String(source.id || "").trim(),
      name: String(source.name || "").trim(),
      email: email
    };
  }

  function applyCustomerSession(payload) {
    const authenticated = Boolean(payload && payload.authenticated);
    const user = authenticated ? sanitizeCustomerUser(payload.user) : null;
    state.customer.authenticated = Boolean(user);
    state.customer.user = user;
    prefillStudioCustomerName();
  }

  function prefillStudioCustomerName() {
    if (!refs.studioCustomerName || refs.studioCustomerName.value.trim()) {
      return;
    }
    if (state.customer.user && state.customer.user.name) {
      refs.studioCustomerName.value = state.customer.user.name;
    }
  }

  function isCustomerAuthenticated() {
    return Boolean(state.customer.authenticated && state.customer.user && state.customer.user.email);
  }

  function updateAuthUi() {
    const authenticated = isCustomerAuthenticated();
    const user = state.customer.user;

    if (refs.authTriggerBtn) {
      refs.authTriggerBtn.classList.toggle("hidden", authenticated);
    }
    if (refs.authUserChip) {
      refs.authUserChip.classList.toggle("hidden", !authenticated);
    }
    if (refs.authUserEmail) {
      refs.authUserEmail.textContent = authenticated && user ? user.email : "";
    }

    if (refs.orderEmail) {
      refs.orderEmail.readOnly = authenticated;
      refs.orderEmail.required = authenticated;
      if (authenticated && user) {
        refs.orderEmail.value = user.email;
      }
      if (!authenticated && (!refs.modal || !refs.modal.classList.contains("is-visible"))) {
        refs.orderEmail.value = "";
      }
    }
  }

  function setAuthTab(tab) {
    const isSignUp = tab === "signup";
    if (refs.authTabSignIn) {
      refs.authTabSignIn.classList.toggle("is-active", !isSignUp);
      refs.authTabSignIn.setAttribute("aria-selected", String(!isSignUp));
    }
    if (refs.authTabSignUp) {
      refs.authTabSignUp.classList.toggle("is-active", isSignUp);
      refs.authTabSignUp.setAttribute("aria-selected", String(isSignUp));
    }
    if (refs.signInForm) {
      refs.signInForm.classList.toggle("hidden", isSignUp);
    }
    if (refs.signUpForm) {
      refs.signUpForm.classList.toggle("hidden", !isSignUp);
    }
  }

  function openAuthModal(noteMessage, preferredTab) {
    if (!refs.authModal) {
      return;
    }
    if (preferredTab) {
      setAuthTab(preferredTab);
    }
    if (refs.authModalNote) {
      refs.authModalNote.textContent = noteMessage || "Create an account with your email once and future orders will be faster.";
    }
    refs.authModal.classList.add("is-visible");
    refs.authModal.setAttribute("aria-hidden", "false");
    syncBodyScrollLock();
  }

  function closeAuthModal() {
    if (!refs.authModal) {
      return;
    }
    refs.authModal.classList.remove("is-visible");
    refs.authModal.setAttribute("aria-hidden", "true");
    syncBodyScrollLock();
  }

  async function handleSignInSubmit(event) {
    event.preventDefault();
    if (!refs.signInForm) {
      return;
    }
    if (!refs.signInForm.checkValidity()) {
      refs.signInForm.reportValidity();
      return;
    }

    const formData = new FormData(refs.signInForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    setButtonLoading(refs.signInSubmitBtn, true, "Signing in...");
    try {
      const payload = await storeApi.customerSignIn(email, password);
      applyCustomerSession({
        authenticated: true,
        user: payload && payload.user ? payload.user : null
      });
      updateAuthUi();
      refs.signInForm.reset();
      closeAuthModal();
      showToast(TXT.signinOk);

      if (state.pendingProductId) {
        const pending = state.pendingProductId;
        state.pendingProductId = "";
        openProductModal(pending);
      }
    } catch (error) {
      showToast(error && error.message ? error.message : "Could not sign in.");
    } finally {
      setButtonLoading(refs.signInSubmitBtn, false, "Sign In");
    }
  }

  async function handleSignUpSubmit(event) {
    event.preventDefault();
    if (!refs.signUpForm) {
      return;
    }
    if (!refs.signUpForm.checkValidity()) {
      refs.signUpForm.reportValidity();
      return;
    }

    const formData = new FormData(refs.signUpForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    setButtonLoading(refs.signUpSubmitBtn, true, "Creating account...");
    try {
      const payload = await storeApi.customerSignUp(name, email, password);
      applyCustomerSession({
        authenticated: true,
        user: payload && payload.user ? payload.user : null
      });
      updateAuthUi();
      refs.signUpForm.reset();
      closeAuthModal();
      showToast(TXT.signupOk);

      if (state.pendingProductId) {
        const pending = state.pendingProductId;
        state.pendingProductId = "";
        openProductModal(pending);
      }
    } catch (error) {
      showToast(error && error.message ? error.message : "Could not create the account.");
    } finally {
      setButtonLoading(refs.signUpSubmitBtn, false, "Sign Up");
    }
  }

  async function handleCustomerLogout() {
    closeNavMenu();
    setButtonLoading(refs.authLogoutBtn, true, "...");
    try {
      await storeApi.customerSignOut();
      applyCustomerSession({ authenticated: false, user: null });
      updateAuthUi();
      closeAuthModal();
      closeProductModal();
      showToast(TXT.logoutOk);
    } catch (error) {
      showToast(error && error.message ? error.message : "Could not sign out.");
    } finally {
      setButtonLoading(refs.authLogoutBtn, false, "Logout");
    }
  }

  async function loadProducts() {
    try {
      state.products = await storeApi.readProducts();
    } catch (error) {
      console.error("Failed to load products:", error);
      state.products = [];
      showToast(error && error.message ? error.message : "Could not load products.");
    }
    renderFilters();
    renderProducts();
  }

  function renderFilters() {
    if (!refs.filters) {
      return;
    }

    const categoriesSet = new Set();
    state.products.forEach(function (product) {
      categoriesSet.add(product.category || "Products");
    });

    const categories = [ALL_CATEGORY_KEY].concat(Array.from(categoriesSet));
    if (categories.indexOf(state.activeCategory) === -1) {
      state.activeCategory = ALL_CATEGORY_KEY;
    }

    refs.filters.innerHTML = "";
    categories.forEach(function (category) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-btn" + (category === state.activeCategory ? " is-active" : "");
      button.textContent = category === ALL_CATEGORY_KEY ? "All" : category;
      button.addEventListener("click", function () {
        state.activeCategory = category;
        renderFilters();
        renderProducts();
      });
      refs.filters.appendChild(button);
    });
  }

  function getVisibleProducts() {
    if (state.activeCategory === ALL_CATEGORY_KEY) {
      return state.products.slice();
    }
    return state.products.filter(function (product) {
      return product.category === state.activeCategory;
    });
  }

  function renderProducts() {
    if (!refs.productsGrid || !refs.emptyProducts) {
      return;
    }

    teardownProductsMarquee();
    refs.productsGrid.innerHTML = "";
    refs.productsGrid.classList.remove("products-grid--moving");
    refs.productsGrid.classList.remove("is-dragging");

    const visible = getVisibleProducts();
    if (!visible.length) {
      refs.emptyProducts.classList.remove("hidden");
      return;
    }

    refs.emptyProducts.classList.add("hidden");

    if (visible.length > 1) {
      const track = document.createElement("div");
      track.className = "products-track";
      visible.forEach(function (product) {
        track.appendChild(buildProductCard(product));
      });
      refs.productsGrid.classList.add("products-grid--moving");
      refs.productsGrid.appendChild(track);
      setupProductsMarquee(track, visible);
      return;
    }

    visible.forEach(function (product) {
      refs.productsGrid.appendChild(buildProductCard(product));
    });
  }

  function setupProductsMarquee(track, sourceProducts) {
    if (!track || !refs.productsGrid || !Array.isArray(sourceProducts) || sourceProducts.length < 2) {
      return;
    }

    const speedPxPerSecond = 40;
    const controller = {
      offset: 0,
      lastFrameTime: 0,
      rafId: 0,
      paused: false,
      isPointerDown: false,
      pointerId: null,
      dragStartX: 0,
      dragStartOffset: 0,
      dragMoved: false,
      suppressClickUntil: 0
    };

    const host = refs.productsGrid;

    const applyTransform = function () {
      track.style.transform = "translate3d(" + Math.round(controller.offset) + "px,0,0)";
    };

    const getFirstCardStep = function () {
      const first = track.children[0];
      const second = track.children[1];
      if (!first) {
        return 0;
      }
      if (second) {
        return Math.max(1, second.offsetLeft - first.offsetLeft);
      }
      return Math.max(1, Math.round(first.getBoundingClientRect().width));
    };

    const ensureTrackLength = function () {
      const targetWidth = host.clientWidth * 2.2;
      if (!targetWidth) {
        return;
      }
      let index = 0;
      let guard = 0;
      while (track.scrollWidth < targetWidth && guard < sourceProducts.length * 12) {
        const product = sourceProducts[index % sourceProducts.length];
        track.appendChild(buildProductCard(product));
        index += 1;
        guard += 1;
      }
    };

    const recycleCards = function () {
      let step = getFirstCardStep();
      while (step > 0 && -controller.offset >= step && track.children.length > 1) {
        controller.offset += step;
        track.appendChild(track.children[0]);
        step = getFirstCardStep();
      }

      step = getFirstCardStep();
      while (step > 0 && controller.offset > 0 && track.children.length > 1) {
        const last = track.children[track.children.length - 1];
        track.insertBefore(last, track.children[0]);
        controller.offset -= step;
        step = getFirstCardStep();
      }
    };

    const onPointerDown = function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      controller.isPointerDown = true;
      controller.pointerId = event.pointerId;
      controller.dragStartX = event.clientX;
      controller.dragStartOffset = controller.offset;
      controller.dragMoved = false;
      controller.paused = true;
      host.classList.add("is-dragging");
      if (host.setPointerCapture) {
        try {
          host.setPointerCapture(event.pointerId);
        } catch (_error) {
        }
      }
    };

    const onPointerMove = function (event) {
      if (!controller.isPointerDown || event.pointerId !== controller.pointerId) {
        return;
      }
      const delta = event.clientX - controller.dragStartX;
      if (Math.abs(delta) > 3) {
        controller.dragMoved = true;
      }
      controller.offset = controller.dragStartOffset + delta;
      recycleCards();
      applyTransform();
      if (controller.dragMoved) {
        event.preventDefault();
      }
    };

    const stopDragging = function (event) {
      if (!controller.isPointerDown) {
        return;
      }
      if (event && event.pointerId !== undefined && event.pointerId !== controller.pointerId) {
        return;
      }
      if (controller.dragMoved) {
        controller.suppressClickUntil = Date.now() + 220;
      }
      controller.isPointerDown = false;
      controller.pointerId = null;
      controller.dragMoved = false;
      controller.paused = false;
      host.classList.remove("is-dragging");
      if (event && host.releasePointerCapture) {
        try {
          host.releasePointerCapture(event.pointerId);
        } catch (_error) {
        }
      }
    };

    const onClickCapture = function (event) {
      if (Date.now() < controller.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onResize = function () {
      ensureTrackLength();
      recycleCards();
      applyTransform();
    };

    const step = function (timestamp) {
      if (productsMarqueeController !== controller) {
        return;
      }
      if (!controller.lastFrameTime) {
        controller.lastFrameTime = timestamp;
      }
      const deltaSeconds = Math.max(0, (timestamp - controller.lastFrameTime) / 1000);
      controller.lastFrameTime = timestamp;

      if (!controller.paused && !controller.isPointerDown) {
        controller.offset -= deltaSeconds * speedPxPerSecond;
        recycleCards();
        applyTransform();
      }
      controller.rafId = window.requestAnimationFrame(step);
    };

    ensureTrackLength();
    recycleCards();
    applyTransform();

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", stopDragging);
    host.addEventListener("pointercancel", stopDragging);
    host.addEventListener("click", onClickCapture, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", stopDragging);

    controller.rafId = window.requestAnimationFrame(step);
    controller.cleanup = function () {
      window.cancelAnimationFrame(controller.rafId);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", stopDragging);
      host.removeEventListener("pointercancel", stopDragging);
      host.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", stopDragging);
    };

    productsMarqueeController = controller;
  }

  function teardownProductsMarquee() {
    if (!productsMarqueeController) {
      return;
    }
    if (typeof productsMarqueeController.cleanup === "function") {
      productsMarqueeController.cleanup();
    }
    productsMarqueeController = null;
  }

  function buildProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";

    const image = document.createElement("img");
    image.src = product.image || "tshirt.jpg.jpg";
    image.alt = product.name || "Product";
    image.loading = "lazy";
    image.addEventListener("error", function () {
      image.src = "tshirt.jpg.jpg";
    });

    const meta = document.createElement("div");
    meta.className = "product-meta";

    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = product.category || "Product";
    meta.appendChild(category);

    if (product.featured) {
      const badge = document.createElement("span");
      badge.className = "product-featured";
      badge.textContent = "Featured";
      meta.appendChild(badge);
    }

    const title = document.createElement("h3");
    title.textContent = product.name || "Product";

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description || "";

    const price = document.createElement("p");
    price.className = "product-price";
    price.textContent = formatPrice(product);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.textContent = TXT.showDetails;
    button.addEventListener("click", function () {
      openProductModal(product.id);
    });

    card.appendChild(image);
    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(price);
    card.appendChild(button);

    return card;
  }

  function openProductModal(productId) {
    const product = state.products.find(function (item) {
      return item.id === productId;
    });
    if (!product || !refs.modal) {
      return;
    }

    if (!isCustomerAuthenticated()) {
      state.pendingProductId = productId;
      showToast(TXT.pleaseLogin);
      openAuthModal(TXT.loginForOrder, "signin");
      return;
    }

    state.selectedProduct = product;
    refs.modalImg.src = product.image || "tshirt.jpg.jpg";
    refs.modalTitle.textContent = product.name || "Product";
    refs.modalPrice.textContent = formatPrice(product);
    refs.modalDescription.textContent = product.description || "";

    refs.orderForm.reset();
    fillSelect(refs.orderSize, product.sizes || ["M", "L"]);
    fillSelect(refs.orderColor, product.colors || ["Black", "White"]);
    refs.orderSize.selectedIndex = 0;
    refs.orderColor.selectedIndex = 0;
    prefillOrderCustomerFields();

    refs.modal.classList.add("is-visible");
    refs.modal.setAttribute("aria-hidden", "false");
    syncBodyScrollLock();
  }

  function closeProductModal() {
    if (!refs.modal) {
      return;
    }
    refs.modal.classList.remove("is-visible");
    refs.modal.setAttribute("aria-hidden", "true");
    syncBodyScrollLock();
  }

  function prefillOrderCustomerFields() {
    if (!isCustomerAuthenticated()) {
      if (refs.orderEmail) {
        refs.orderEmail.readOnly = false;
      }
      return;
    }

    const user = state.customer.user;
    if (!user) {
      return;
    }
    if (refs.orderName && !refs.orderName.value.trim() && user.name) {
      refs.orderName.value = user.name;
    }
    if (refs.orderEmail) {
      refs.orderEmail.value = user.email;
      refs.orderEmail.readOnly = true;
      refs.orderEmail.required = true;
    }
  }

  function fillSelect(select, options) {
    if (!select) {
      return;
    }
    select.innerHTML = "";
    options.forEach(function (value, index) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (index === 0) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  function setupModalBehavior() {
    if (refs.closeModalBtn) {
      refs.closeModalBtn.addEventListener("click", closeProductModal);
    }

    if (refs.modal) {
      refs.modal.addEventListener("click", function (event) {
        if (event.target === refs.modal) {
          closeProductModal();
        }
      });
    }

    if (refs.closeAuthModalBtn) {
      refs.closeAuthModalBtn.addEventListener("click", closeAuthModal);
    }

    if (refs.authModal) {
      refs.authModal.addEventListener("click", function (event) {
        if (event.target === refs.authModal) {
          closeAuthModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        return;
      }
      if (refs.authModal && refs.authModal.classList.contains("is-visible")) {
        closeAuthModal();
        return;
      }
      if (refs.modal && refs.modal.classList.contains("is-visible")) {
        closeProductModal();
      }
    });
  }

  function syncBodyScrollLock() {
    const productOpen = Boolean(refs.modal && refs.modal.classList.contains("is-visible"));
    const authOpen = Boolean(refs.authModal && refs.authModal.classList.contains("is-visible"));
    document.body.style.overflow = productOpen || authOpen ? "hidden" : "";
  }

  function setupOrderForm() {
    if (!refs.orderForm) {
      return;
    }
    refs.orderForm.addEventListener("submit", handleReadyOrderSubmission);
  }

  async function handleReadyOrderSubmission(event) {
    event.preventDefault();

    if (!isCustomerAuthenticated()) {
      closeProductModal();
      openAuthModal(TXT.loginForOrder, "signin");
      return;
    }

    if (!refs.orderForm.checkValidity()) {
      refs.orderForm.reportValidity();
      return;
    }

    if (!state.selectedProduct) {
      showToast(TXT.chooseProduct);
      return;
    }

    const customerUser = state.customer.user;
    if (!customerUser || !customerUser.email) {
      showToast("Account information is incomplete.");
      closeProductModal();
      openAuthModal("Please sign in again to complete the order.", "signin");
      return;
    }

    const formData = new FormData(refs.orderForm);
    const order = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: customerUser.email,
      size: String(formData.get("size") || "").trim(),
      color: String(formData.get("color") || "").trim(),
      qty: String(formData.get("qty") || "1").trim()
    };

    if (!/^01\d{9}$/.test(order.phone)) {
      showToast(TXT.invalidPhone);
      return;
    }

    setButtonLoading(refs.confirmOrderBtn, true, "Preparing your order...");
    try {
      const created = await storeApi.createOrder({
        type: "ready",
        source: "storefront",
        customerName: order.name,
        customerPhone: order.phone,
        customerEmail: order.email,
        productId: state.selectedProduct.id,
        productName: state.selectedProduct.name,
        size: order.size,
        color: order.color,
        quantity: Number(order.qty) || 1,
        unitPrice: Number(state.selectedProduct.price || 0),
        currency: "egp",
        priceLabel: formatPrice(state.selectedProduct),
        notes: ""
      });

      if (created && created.user) {
        applyCustomerSession({
          authenticated: true,
          user: created.user
        });
        updateAuthUi();
      }

      const orderId = created && created.orderId ? String(created.orderId) : "";

      openWhatsApp(buildReadyOrderWhatsAppMessage(order, state.selectedProduct, orderId));
      showToast(TXT.orderOk);
      closeProductModal();
    } catch (error) {
      console.error("Ready order failed:", error);
      if (error && Number(error.status) === 401) {
        showToast("Your session has expired.");
        await hydrateCustomerSession();
        closeProductModal();
        openAuthModal("Your session has expired. Sign in to complete the order.", "signin");
      } else {
        showToast(TXT.orderFallback);
        openWhatsApp(buildReadyOrderWhatsAppMessage(order, state.selectedProduct, ""));
        closeProductModal();
      }
    } finally {
      setButtonLoading(refs.confirmOrderBtn, false, "Confirm Order");
    }
  }

  function buildReadyOrderWhatsAppMessage(order, product, orderId) {
    return [
      "New order from VANTAGE",
      orderId ? "Order ID: " + orderId : "",
      "Product: " + product.name,
      "Price: " + formatPrice(product),
      "Quantity: " + order.qty,
      "Size: " + order.size,
      "Color: " + order.color,
      "Name: " + order.name,
      "Phone: " + order.phone,
      "Email: " + (order.email || "Not provided")
    ]
      .filter(Boolean)
      .join("\n");
  }

  function openWhatsApp(message) {
    const url = "https://wa.me/" + APP_CONFIG.whatsappPhone + "?text=" + encodeURIComponent(message);
    window.location.href = url;
  }


  const STUDIO_SHIRT_COLORS = [
    { id: "black", label: "Black", hex: "#0c0c0c" },
    { id: "white", label: "White", hex: "#f4f4f4" },
    { id: "navy", label: "Navy", hex: "#1c2740" },
    { id: "grey", label: "Grey", hex: "#6b6f76" },
    { id: "maroon", label: "Maroon", hex: "#5c1a26" }
  ];

  function setupDesignStudio() {
    if (!refs.studioCanvas || !refs.studioCanvas.getContext) {
      return;
    }

    renderStudioColorOptions();
    setupStudioLogoUpload();
    setupStudioTextControls();
    setupStudioLayerTabs();
    setupStudioTransformControls();
    setupStudioCanvasDrag();

    if (refs.studioResetBtn) {
      refs.studioResetBtn.addEventListener("click", resetStudioDesign);
    }
    if (refs.studioConfirmBtn) {
      refs.studioConfirmBtn.addEventListener("click", handleCustomOrderSubmission);
    }

    drawStudioCanvas();
  }

  function renderStudioColorOptions() {
    if (!refs.studioColorOptions) {
      return;
    }
    refs.studioColorOptions.innerHTML = "";
    STUDIO_SHIRT_COLORS.forEach(function (color, index) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "studio-color-swatch" + (index === 0 ? " is-active" : "");
      btn.style.background = color.hex;
      btn.setAttribute("aria-label", color.label);
      btn.dataset.colorId = color.id;
      btn.dataset.colorHex = color.hex;
      btn.dataset.colorLabel = color.label;
      btn.addEventListener("click", function () {
        state.studio.shirtColor = color.hex;
        state.studio.shirtColorLabel = color.label;
        refs.studioColorOptions.querySelectorAll(".studio-color-swatch").forEach(function (node) {
          node.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        drawStudioCanvas();
      });
      refs.studioColorOptions.appendChild(btn);
    });
    state.studio.shirtColorLabel = STUDIO_SHIRT_COLORS[0].label;
  }

  function setupStudioLogoUpload() {
    if (!refs.studioLogoUpload) {
      return;
    }
    refs.studioLogoUpload.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
        showToast("Image must be PNG, JPG, or WEBP.");
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        showToast("Image size exceeds 6MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          state.studio.logoImage = img;
          state.studio.logoLoaded = true;
          state.studio.selectedLayer = "logo";
          refs.studioLogoName.textContent = file.name;
          syncStudioLayerTabs();
          syncStudioTransformInputsFromLayer();
          drawStudioCanvas();
        };
        img.onerror = function () {
          showToast("Could not load the image, try another one.");
        };
        img.src = String(reader.result || "");
      };
      reader.onerror = function () {
        showToast("Could not read the file.");
      };
      reader.readAsDataURL(file);
    });
  }

  function setupStudioTextControls() {
    if (refs.studioTextInput) {
      refs.studioTextInput.addEventListener("input", function () {
        state.studio.text.value = refs.studioTextInput.value.slice(0, 24);
        drawStudioCanvas();
      });
    }
    if (refs.studioTextColor) {
      refs.studioTextColor.addEventListener("input", function () {
        state.studio.text.color = refs.studioTextColor.value;
        drawStudioCanvas();
      });
    }
    if (refs.studioTextFont) {
      refs.studioTextFont.addEventListener("change", function () {
        state.studio.text.font = refs.studioTextFont.value;
        drawStudioCanvas();
      });
    }
  }

  function setupStudioLayerTabs() {
    if (refs.studioSelectLogoBtn) {
      refs.studioSelectLogoBtn.addEventListener("click", function () {
        state.studio.selectedLayer = "logo";
        syncStudioLayerTabs();
        syncStudioTransformInputsFromLayer();
      });
    }
    if (refs.studioSelectTextBtn) {
      refs.studioSelectTextBtn.addEventListener("click", function () {
        state.studio.selectedLayer = "text";
        syncStudioLayerTabs();
        syncStudioTransformInputsFromLayer();
      });
    }
  }

  function syncStudioLayerTabs() {
    if (refs.studioSelectLogoBtn) {
      refs.studioSelectLogoBtn.classList.toggle("is-active", state.studio.selectedLayer === "logo");
    }
    if (refs.studioSelectTextBtn) {
      refs.studioSelectTextBtn.classList.toggle("is-active", state.studio.selectedLayer === "text");
    }
  }

  function getActiveStudioLayer() {
    return state.studio.selectedLayer === "text" ? state.studio.text : state.studio.logo;
  }

  function syncStudioTransformInputsFromLayer() {
    const layer = getActiveStudioLayer();
    if (refs.studioScaleRange) {
      refs.studioScaleRange.value = String(Math.round((layer.scale || 1) * 100));
    }
    if (refs.studioRotateRange) {
      refs.studioRotateRange.value = String(Math.round(layer.rotation || 0));
    }
  }

  function setupStudioTransformControls() {
    if (refs.studioScaleRange) {
      refs.studioScaleRange.addEventListener("input", function () {
        const layer = getActiveStudioLayer();
        layer.scale = Math.max(0.2, Math.min(3, Number(refs.studioScaleRange.value) / 100));
        drawStudioCanvas();
      });
    }
    if (refs.studioRotateRange) {
      refs.studioRotateRange.addEventListener("input", function () {
        const layer = getActiveStudioLayer();
        layer.rotation = Number(refs.studioRotateRange.value) || 0;
        drawStudioCanvas();
      });
    }
  }

  function getStudioCanvasPoint(event) {
    const canvas = refs.studioCanvas;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches && event.touches[0] ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches && event.touches[0] ? event.touches[0].clientY : event.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function hitTestLayer(layer, point, radius) {
    const dx = point.x - layer.x;
    const dy = point.y - layer.y;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  }

  function getStudioTextHitRadius() {
    const layer = state.studio.text;
    if (!layer.value) {
      return 0;
    }
    const approxWidth = layer.value.length * 24 * layer.scale;
    const approxHeight = 30 * layer.scale;
    return Math.max(30, Math.sqrt(approxWidth * approxWidth + approxHeight * approxHeight) / 2);
  }

  function setupStudioCanvasDrag() {
    const canvas = refs.studioCanvas;

    function startDrag(event) {
      const point = getStudioCanvasPoint(event);
      const logoRadius = state.studio.logoLoaded ? (state.studio.logo.baseSize * state.studio.logo.scale) / 2 : 0;
      const textRadius = getStudioTextHitRadius();

      const hitsLogo = state.studio.logoLoaded && hitTestLayer(state.studio.logo, point, logoRadius);
      const hitsText = Boolean(state.studio.text.value) && hitTestLayer(state.studio.text, point, textRadius);

      let target = null;
      if (hitsLogo && hitsText) {
        target = state.studio.selectedLayer === "text" ? "text" : "logo";
      } else if (hitsLogo) {
        target = "logo";
      } else if (hitsText) {
        target = "text";
      }

      if (!target) {
        return;
      }

      state.studio.selectedLayer = target;
      syncStudioLayerTabs();
      syncStudioTransformInputsFromLayer();

      const layer = getActiveStudioLayer();
      state.studio.isDragging = true;
      state.studio.dragOffsetX = point.x - layer.x;
      state.studio.dragOffsetY = point.y - layer.y;
      event.preventDefault();
    }

    function moveDrag(event) {
      if (!state.studio.isDragging) {
        return;
      }
      const point = getStudioCanvasPoint(event);
      const layer = getActiveStudioLayer();
      layer.x = Math.max(0, Math.min(refs.studioCanvas.width, point.x - state.studio.dragOffsetX));
      layer.y = Math.max(0, Math.min(refs.studioCanvas.height, point.y - state.studio.dragOffsetY));
      drawStudioCanvas();
      event.preventDefault();
    }

    function endDrag() {
      state.studio.isDragging = false;
    }

    canvas.addEventListener("mousedown", startDrag);
    window.addEventListener("mousemove", moveDrag);
    window.addEventListener("mouseup", endDrag);
    canvas.addEventListener("touchstart", startDrag, { passive: false });
    window.addEventListener("touchmove", moveDrag, { passive: false });
    window.addEventListener("touchend", endDrag);
  }

  function drawStudioCanvas() {
    const canvas = refs.studioCanvas;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = state.studio.shirtColor || "#0c0c0c";
    ctx.fillRect(0, 0, w, h);
    drawStudioShirtSilhouette(ctx, w, h, state.studio.shirtColor);

    if (state.studio.logoLoaded && state.studio.logoImage) {
      const layer = state.studio.logo;
      const size = layer.baseSize * layer.scale;
      ctx.save();
      ctx.translate(layer.x, layer.y);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.drawImage(state.studio.logoImage, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    if (state.studio.text.value) {
      const layer = state.studio.text;
      ctx.save();
      ctx.translate(layer.x, layer.y);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scale, layer.scale);
      ctx.fillStyle = layer.color || "#ffffff";
      ctx.font = "700 42px " + (layer.font || "Tajawal, sans-serif");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(layer.value, 0, 0);
      ctx.restore();
    }
  }

  function drawStudioShirtSilhouette(ctx, w, h, shirtHex) {
    ctx.save();
    ctx.strokeStyle = shirtHex === "#f4f4f4" ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.08);
    ctx.lineTo(w * 0.18, h * 0.2);
    ctx.lineTo(w * 0.06, h * 0.32);
    ctx.lineTo(w * 0.16, h * 0.42);
    ctx.lineTo(w * 0.24, h * 0.36);
    ctx.lineTo(w * 0.24, h * 0.92);
    ctx.lineTo(w * 0.76, h * 0.92);
    ctx.lineTo(w * 0.76, h * 0.36);
    ctx.lineTo(w * 0.84, h * 0.42);
    ctx.lineTo(w * 0.94, h * 0.32);
    ctx.lineTo(w * 0.82, h * 0.2);
    ctx.lineTo(w * 0.68, h * 0.08);
    ctx.quadraticCurveTo(w * 0.5, h * 0.18, w * 0.32, h * 0.08);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function resetStudioDesign() {
    state.studio.logoImage = null;
    state.studio.logoLoaded = false;
    state.studio.logo = { x: 300, y: 300, scale: 1, rotation: 0, baseSize: 220 };
    state.studio.text = { x: 300, y: 480, scale: 1, rotation: 0, value: "", color: "#ffffff", font: "Tajawal, sans-serif" };
    state.studio.selectedLayer = "logo";
    if (refs.studioLogoUpload) {
      refs.studioLogoUpload.value = "";
    }
    if (refs.studioLogoName) {
      refs.studioLogoName.textContent = "No image uploaded yet.";
    }
    if (refs.studioTextInput) {
      refs.studioTextInput.value = "";
    }
    if (refs.studioTextColor) {
      refs.studioTextColor.value = "#ffffff";
    }
    syncStudioLayerTabs();
    syncStudioTransformInputsFromLayer();
    drawStudioCanvas();
    showToast("Design has been reset.");
  }

  const CUSTOM_DESIGN_BASE_PRICE = 1200;

  async function handleCustomOrderSubmission() {
    if (!isCustomerAuthenticated()) {
      showToast(TXT.pleaseLogin);
      openAuthModal(TXT.loginForOrder, "signin");
      return;
    }

    if (!state.studio.logoLoaded && !state.studio.text.value.trim()) {
      showToast("Upload a logo or add text first to place an order.");
      return;
    }

    const customerUser = state.customer.user;
    if (!customerUser || !customerUser.email) {
      showToast("Account information is incomplete.");
      openAuthModal("Please sign in again to complete the order.", "signin");
      return;
    }

    const customerName = String((refs.studioCustomerName && refs.studioCustomerName.value) || "").trim();
    const customerPhone = String((refs.studioCustomerPhone && refs.studioCustomerPhone.value) || "").trim();

    if (!customerName) {
      showToast("Please enter your name first.");
      if (refs.studioCustomerName) {
        refs.studioCustomerName.focus();
      }
      return;
    }
    if (!/^01\d{9}$/.test(customerPhone)) {
      showToast(TXT.invalidPhone);
      if (refs.studioCustomerPhone) {
        refs.studioCustomerPhone.focus();
      }
      return;
    }

    const previewDataUrl = refs.studioCanvas.toDataURL("image/png", 0.92);
    if (previewDataUrl.length > 2_800_000) {
      showToast("Design is too large, try a smaller image.");
      return;
    }

    setButtonLoading(refs.studioConfirmBtn, true, "Sending your design...");
    try {
      const created = await storeApi.createOrder({
        type: "custom",
        source: "design-studio",
        customerName: customerName,
        customerPhone: customerPhone,
        customerEmail: customerUser.email,
        size: "M",
        color: state.studio.shirtColorLabel || "Black",
        quantity: 1,
        unitPrice: CUSTOM_DESIGN_BASE_PRICE,
        currency: "egp",
        priceLabel: "",
        customPreview: previewDataUrl,
        customShirtColor: state.studio.shirtColorLabel || "Black",
        notes: state.studio.text.value ? "Text on design: " + state.studio.text.value : ""
      });

      if (created && created.user) {
        applyCustomerSession({
          authenticated: true,
          user: created.user
        });
        updateAuthUi();
      }

      const orderId = created && created.orderId ? String(created.orderId) : "";
      openWhatsApp(buildCustomOrderWhatsAppMessage(orderId, customerName, customerPhone));
      showToast("Design order sent successfully.");
    } catch (error) {
      console.error("Custom order failed:", error);
      if (error && Number(error.status) === 401) {
        showToast("Your session has expired.");
        await hydrateCustomerSession();
        openAuthModal("Your session has expired. Sign in to complete the order.", "signin");
      } else {
        showToast("Could not send the order, try again or contact us on WhatsApp.");
        openWhatsApp(buildCustomOrderWhatsAppMessage("", customerName, customerPhone));
      }
    } finally {
      setButtonLoading(refs.studioConfirmBtn, false, "Order This Design Now");
    }
  }

  function buildCustomOrderWhatsAppMessage(orderId, customerName, customerPhone) {
    return [
      "Custom design order from VANTAGE",
      orderId ? "Order ID: " + orderId : "",
      "Name: " + (customerName || "-"),
      "Phone: " + (customerPhone || "-"),
      "Shirt color: " + (state.studio.shirtColorLabel || "Black"),
      state.studio.text.value ? "Text on design: " + state.studio.text.value : "",
      "The design is attached as an image with the order."
    ]
      .filter(Boolean)
      .join("\n");
  }


  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) {
      return;
    }
    const labelNode = button.querySelector(".order-btn-label");

    if (isLoading) {
      const sourceText = labelNode ? labelNode.textContent : button.textContent;
      button.dataset.originalText = sourceText || "";
      if (labelNode) {
        labelNode.textContent = loadingText;
      } else {
        button.textContent = loadingText;
      }
      button.classList.add("is-loading");
      button.disabled = true;
      button.style.opacity = "0.75";
      return;
    }

    const restoredText = button.dataset.originalText || "";
    if (labelNode) {
      labelNode.textContent = restoredText || labelNode.textContent || "";
    } else {
      button.textContent = restoredText || button.textContent || "";
    }
    button.classList.remove("is-loading");
    button.disabled = false;
    button.style.opacity = "";
  }

  function showToast(message) {
    if (!refs.toast) {
      return;
    }
    refs.toast.textContent = message;
    refs.toast.classList.add("is-visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      refs.toast.classList.remove("is-visible");
    }, 2800);
  }

  function formatPrice(product) {
    const value = Number(product && product.price ? product.price : 0);
    let currency = String(product && product.currency ? product.currency : "EGP").trim();
    if (currency.toLowerCase() === "egp") {
      currency = "EGP";
    }
    return `${value.toLocaleString("ar-EG")} ${currency}`;
  }

})();
