(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const transferPhone = params.get("transfer_phone") || "+20 11 2216 3661";
  const transferPhoneRaw = params.get("transfer_phone_raw") || "201122163661";
  const whatsappPhone = params.get("wa_phone") || "201140094137";
  const whatsappDisplay = params.get("wa_display") || "01140094137";
  const whatsappText = params.get("wa_text") || "I would like to follow up on my order.";
  const whatsappPaidText =
    params.get("wa_paid_text") || "I have transferred the amount and need payment confirmation.";
  const amountLabel = params.get("amount_label") || "The amount will be confirmed after review.";

  const transferNumberEl = document.getElementById("transfer-number");
  const copyBtn = document.getElementById("copy-transfer-number");
  const paidAlreadyBtn = document.getElementById("paid-already-btn");
  const openWhatsappBtn = document.getElementById("open-whatsapp-btn");
  const whatsappDisplayEl = document.getElementById("whatsapp-display");
  const paymentAmountEl = document.getElementById("payment-amount");
  const transferProofFileInput = document.getElementById("transfer-proof-file");
  const proofStateEl = document.getElementById("proof-state");

  const paidAlreadyHref =
    "https://wa.me/" + whatsappPhone + "?text=" + encodeURIComponent(whatsappPaidText);

  if (transferNumberEl) {
    transferNumberEl.textContent = transferPhone;
  }

  if (paymentAmountEl) {
    paymentAmountEl.textContent = amountLabel;
  }

  if (paidAlreadyBtn) {
    paidAlreadyBtn.href = "#";
    paidAlreadyBtn.addEventListener("click", function (event) {
      if (!hasUploadedProof()) {
        event.preventDefault();
        setPaidButtonState(false);
        return;
      }
      paidAlreadyBtn.href = paidAlreadyHref;
    });
  }

  if (openWhatsappBtn) {
    openWhatsappBtn.href =
      "https://wa.me/" + whatsappPhone + "?text=" + encodeURIComponent(whatsappText);
  }

  if (whatsappDisplayEl) {
    whatsappDisplayEl.textContent = whatsappDisplay;
  }

  if (transferProofFileInput) {
    transferProofFileInput.addEventListener("change", function () {
      setPaidButtonState(hasUploadedProof());
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      const valueToCopy = transferPhoneRaw || transferPhone;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(valueToCopy).then(
          function () {
            copyBtn.textContent = "Copied";
            window.setTimeout(function () {
              copyBtn.textContent = "Copy Transfer Number";
            }, 1800);
          },
          function () {
            window.prompt("Copy the transfer number:", valueToCopy);
          }
        );
        return;
      }

      window.prompt("Copy the transfer number:", valueToCopy);
    });
  }

  setPaidButtonState(hasUploadedProof());

  function hasUploadedProof() {
    return Boolean(
      transferProofFileInput &&
        transferProofFileInput.files &&
        transferProofFileInput.files.length > 0
    );
  }

  function setPaidButtonState(enabled) {
    if (!paidAlreadyBtn) {
      return;
    }

    paidAlreadyBtn.classList.toggle("is-disabled", !enabled);
    paidAlreadyBtn.setAttribute("aria-disabled", String(!enabled));
    paidAlreadyBtn.href = enabled ? paidAlreadyHref : "#";

    if (!proofStateEl) {
      return;
    }

    if (enabled) {
      const uploadedName =
        transferProofFileInput &&
        transferProofFileInput.files &&
        transferProofFileInput.files[0] &&
        transferProofFileInput.files[0].name
          ? transferProofFileInput.files[0].name
          : "Image uploaded";
      proofStateEl.textContent = "Transfer proof uploaded: " + uploadedName;
      proofStateEl.style.color = "#a8f2cf";
      return;
    }

    proofStateEl.textContent = "Transfer proof not uploaded yet.";
    proofStateEl.style.color = "#ffd9cf";
  }
})();