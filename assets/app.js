(function () {
  "use strict";

  const state = { all: [], filtered: [], rendered: 0, pageSize: 48, grupo: "" };
  const el = {
    grid: document.getElementById("grid"), search: document.getElementById("search"),
    clearBtn: document.getElementById("clear-search"), sort: document.getElementById("sort"),
    counter: document.getElementById("counter"), empty: document.getElementById("empty"),
    sentinel: document.getElementById("sentinel"), loadingMore: document.getElementById("loading-more"),
    overlay: document.getElementById("overlay"), modalBody: document.getElementById("modal-body"),
    metaInfo: document.getElementById("meta-info"), grupoChips: document.getElementById("grupo-chips"),
    subgrupo: document.getElementById("subgrupo-select"), promoCheck: document.getElementById("promo-check"),
    menuToggle: document.getElementById("menu-toggle"), filterPanel: document.getElementById("filter-panel"),
    filterClose: document.getElementById("filter-close"), filterBackdrop: document.getElementById("filter-backdrop"),
    applyFiltersButton: document.getElementById("apply-filters"),
    clearFiltersButton: document.getElementById("clear-filters"),
  };
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  function formatPrice(value) {
    return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : BRL.format(Number(value));
  }
  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number.isInteger(Number(value)) ? String(Number(value)) : String(value).replace(".", ",");
  }
  function normalize(value) {
    return (value ?? "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }
  function escapeHtml(value) {
    return (value ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function getPromocoes(product) {
    const values = Array.isArray(product.promocoes)
      ? product.promocoes
      : (product.promocao ? [product.promocao] : []);
    return values.some((value) => normalize(value) === "promo geral") ? ["PROMO GERAL"] : [];
  }
  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => normalize(a).localeCompare(normalize(b), "pt-BR"));
  }

  async function init() {
    try {
      const response = await fetch("data/products.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      state.all = Array.isArray(data.produtos) ? data.produtos : [];
      if (el.metaInfo) {
        const date = data.gerado_em ? new Date(data.gerado_em) : null;
        const dateText = date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString("pt-BR") : "";
        el.metaInfo.textContent = `Atualizado em ${dateText}`;
      }
      populateGroups();
      updateSubgroups();
      applyFilters();
    } catch (error) {
      console.error(error);
      el.grid.innerHTML = "";
      el.empty.classList.add("visible");
      el.empty.querySelector("h2").textContent = "Não foi possível carregar o catálogo";
      el.empty.querySelector("p").textContent = "Verifique se o arquivo data/products.json existe e se a página está sendo aberta via servidor (http://), não diretamente do disco.";
    }
  }

  function populateGroups() {
    const groups = uniqueSorted(state.all.map((product) => product.grupo));
    el.grupoChips.innerHTML = "";
    ["", ...groups].forEach((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip" + (value === state.grupo ? " active" : "");
      button.dataset.value = value;
      button.textContent = value || "Todos";
      button.setAttribute("aria-selected", String(value === state.grupo));
      button.addEventListener("click", () => {
        state.grupo = value;
        el.grupoChips.querySelectorAll(".chip").forEach((chip) => {
          const active = chip.dataset.value === state.grupo;
          chip.classList.toggle("active", active);
          chip.setAttribute("aria-selected", String(active));
        });
        updateSubgroups();
        applyFilters();
      });
      el.grupoChips.appendChild(button);
    });
  }

  function updateSubgroups() {
    const products = state.grupo ? state.all.filter((product) => String(product.grupo || "") === state.grupo) : state.all;
    const current = el.subgrupo.value;
    const subgroups = uniqueSorted(products.map((product) => product.subgrupo));
    el.subgrupo.innerHTML = "<option value=\"\">Todos os subgrupos</option>";
    subgroups.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      el.subgrupo.appendChild(option);
    });
    el.subgrupo.disabled = subgroups.length === 0;
    el.subgrupo.value = subgroups.includes(current) ? current : "";
  }

  function applyFilters() {
    const terms = normalize(el.search.value).split(/\s+/).filter(Boolean);
    const subgroup = el.subgrupo.value;
    const onlyPromotions = el.promoCheck.checked;
    let list = state.all.filter((product) => {
      const promotions = getPromocoes(product);
      const searchable = [product.sku, product.descricao, product.grupo, product.subgrupo, ...promotions].map(normalize).join(" ");
      if (terms.length && !terms.every((term) => searchable.includes(term))) return false;
      if (state.grupo && String(product.grupo || "") !== state.grupo) return false;
      if (subgroup && String(product.subgrupo || "") !== subgroup) return false;
      if (onlyPromotions && promotions.length === 0) return false;
      return true;
    });

    list = list.slice();
    switch (el.sort.value) {
      case "sku": list.sort((a, b) => String(a.sku || "").localeCompare(String(b.sku || ""), "pt-BR")); break;
      case "preco-asc": list.sort((a, b) => (Number(a.preco) || Infinity) - (Number(b.preco) || Infinity)); break;
      case "preco-desc": list.sort((a, b) => (Number(b.preco) || -Infinity) - (Number(a.preco) || -Infinity)); break;
    }
    state.filtered = list;
    state.rendered = 0;
    el.grid.innerHTML = "";
    el.counter.innerHTML = `<strong>${list.length}</strong> ${list.length === 1 ? "item" : "itens"}`;
    el.empty.classList.toggle("visible", list.length === 0);
    renderNextPage();
  }

  function cardTemplate(product) {
    const promotions = getPromocoes(product);
    const div = document.createElement("div");
    div.className = "card";
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `${product.sku} — ${product.descricao}`);
    div.dataset.sku = product.sku || "";
    const promotionTag = promotions.length ? `<span class="promo-tag">${escapeHtml(promotions[0])}</span>` : "";
    div.innerHTML = `
      <div class="thumb">
        <span class="sku-tag">${escapeHtml(product.sku)}</span>
        ${promotionTag}
        <img loading="lazy" src="${escapeHtml(product.imagem || "")}" alt="${escapeHtml(product.descricao)}" onerror="this.style.opacity=0.15">
      </div>
      <div class="body">
        <div class="categoria">${escapeHtml([product.grupo, product.subgrupo].filter(Boolean).join(" · "))}</div>
        <div class="desc">${escapeHtml(product.descricao)}</div>
        <div class="row-bottom">
          <div class="price">${formatPrice(product.preco)}<small>unidade</small></div>
          <div class="row-tags"><span class="box-qty">cx ${formatNumber(product.qtd_por_caixa)}</span></div>
        </div>
      </div>`;
    div.addEventListener("click", () => openModal(product));
    div.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openModal(product); }
    });
    return div;
  }

  function renderNextPage() {
    const end = Math.min(state.rendered + state.pageSize, state.filtered.length);
    const fragment = document.createDocumentFragment();
    for (let index = state.rendered; index < end; index += 1) {
      const card = cardTemplate(state.filtered[index]);
      card.style.animationDelay = ((index - state.rendered) * 12) + "ms";
      fragment.appendChild(card);
    }
    el.grid.appendChild(fragment);
    state.rendered = end;
    el.loadingMore.classList.remove("visible");
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && state.rendered < state.filtered.length) {
        el.loadingMore.classList.add("visible");
        renderNextPage();
      }
    });
  }, { rootMargin: "600px" });
  observer.observe(el.sentinel);

  function openModal(product) {
    const promotions = getPromocoes(product);
    const promotionTag = promotions.length ? `<span class="promo-tag">${escapeHtml(promotions.join(" · "))}</span>` : "";
    el.modalBody.innerHTML = `
      <button class="modal-close" aria-label="Fechar">&times;</button>
      <div class="modal-img">${promotionTag}<img src="${escapeHtml(product.imagem || "")}" alt="${escapeHtml(product.descricao)}" onerror="this.style.opacity=0.15"></div>
      <div class="modal-info">
        <span class="modal-sku">${escapeHtml(product.sku)}</span>
        <div class="modal-breadcrumb">${escapeHtml([product.grupo, product.subgrupo].filter(Boolean).join(" · "))}</div>
        <h2>${escapeHtml(product.descricao)}</h2>
        <div class="modal-facts">
          <div><div class="fact-label">Preço unitário</div><div class="fact-value accent">${formatPrice(product.preco)}</div></div>
          <div><div class="fact-label">Itens por caixa</div><div class="fact-value">${formatNumber(product.qtd_por_caixa)}</div></div>
        </div>
        <button class="copy-btn" id="copy-sku-btn">Copiar código</button>
      </div>`;
    el.overlay.classList.add("visible");
    document.body.style.overflow = "hidden";
    el.modalBody.querySelector(".modal-close").addEventListener("click", closeModal);
    el.modalBody.querySelector("#copy-sku-btn").addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(String(product.sku || ""));
        event.target.textContent = "Copiado!";
        event.target.classList.add("copied");
        setTimeout(() => { event.target.textContent = "Copiar código"; event.target.classList.remove("copied"); }, 1400);
      } catch (_) { event.target.textContent = "Selecione o código"; }
    });
  }
  function closeModal() { el.overlay.classList.remove("visible"); document.body.style.overflow = ""; }
  el.overlay.addEventListener("click", (event) => { if (event.target === el.overlay) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

  let debounceTimer;
  el.search.addEventListener("input", () => {
    el.clearBtn.classList.toggle("visible", el.search.value.length > 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 90);
  });
  el.clearBtn.addEventListener("click", () => { el.search.value = ""; el.clearBtn.classList.remove("visible"); el.search.focus(); applyFilters(); });
  el.sort.addEventListener("change", applyFilters);
  el.subgrupo.addEventListener("change", applyFilters);
  el.promoCheck.addEventListener("change", applyFilters);

  function setFiltersOpen(isOpen) {
    el.filterPanel.classList.toggle("open", isOpen);
    el.filterBackdrop.classList.toggle("open", isOpen);
    el.menuToggle.setAttribute("aria-expanded", String(isOpen));
    el.menuToggle.setAttribute("aria-label", isOpen ? "Fechar filtros" : "Abrir filtros");
    document.body.classList.toggle("drawer-open", isOpen);
  }

  el.menuToggle.addEventListener("click", () => setFiltersOpen(!el.filterPanel.classList.contains("open")));
  el.filterClose.addEventListener("click", () => setFiltersOpen(false));
  el.applyFiltersButton.addEventListener("click", () => setFiltersOpen(false));
  el.clearFiltersButton.addEventListener("click", () => {
    el.search.value = "";
    el.clearBtn.classList.remove("visible");
    el.sort.value = "sku";
    el.promoCheck.checked = false;
    state.grupo = "";
    populateGroups();
    updateSubgroups();
    applyFilters();
    setFiltersOpen(false);
  });
  el.filterBackdrop.addEventListener("click", () => setFiltersOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el.filterPanel.classList.contains("open")) setFiltersOpen(false);
  });
  init();
})();
