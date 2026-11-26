(function () {
  "use strict";

  const state = {
    all: [],
    bySku: new Map(),
    catalogStatus: "loading",
    subs: [],
    sub: null,
    filtered: [],
    rendered: 0,
    pageSize: 48,
  };
  const $ = (id) => document.getElementById(id);
  const el = {
    grid: $("grid"),
    search: $("search"),
    clearBtn: $("clear-search"),
    counter: $("counter"),
    empty: $("empty"),
    sentinel: $("sentinel"),
    loadingMore: $("loading-more"),
    overlay: $("overlay"),
    modalBody: $("modal-body"),
    metaInfo: $("meta-info"),
    promoCheck: $("promo-check"),
    subGrid: $("sub-grid"),
    title: $("list-title"),
    back: $("back-btn"),
    quoteTrigger: $("quote-trigger"),
    mobileQuoteStart: $("mobile-quote-start"),
    mobileQuote: $("mobile-quote"),
    mobileQuoteTrigger: $("mobile-quote-trigger"),
    mobileQuoteCount: $("mobile-quote-count"),
    toast: $("quote-toast"),
  };
  const quoteTriggers = [el.quoteTrigger, el.mobileQuoteStart, el.mobileQuoteTrigger];
  const feedbackStyles = document.createElement("style");
  feedbackStyles.textContent = `
    .empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 16px; }
    .empty-actions button { min-height: 44px; padding: 8px 14px; border: 1px solid #071477;
      border-radius: 8px; color: #071477; background: #fff; font-weight: 600; cursor: pointer; }
    .thumb > .photo-placeholder, .modal-img > .photo-placeholder {
      display: grid; place-items: center; width: 100%; padding: 16px;
      color: #3f4655; font-size: 0.875rem; text-align: center; }
    .thumb > .photo-placeholder { position: absolute; inset: 0; }
    .modal-img > .photo-placeholder { min-height: 160px; }
  `;
  document.head.append(feedbackStyles);

  const emptyActions = document.createElement("div");
  emptyActions.className = "empty-actions";
  el.empty.append(emptyActions);

  function nameWithoutLeadingSku(product) {
    const description = String(product.descricao || "").trim();
    const sku = String(product.sku || "");
    return sku && description.startsWith(`${sku} `)
      ? description.slice(sku.length).trimStart()
      : description;
  }
  function normalize(value) {
    return (value ?? "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }
  function escapeHtml(value) {
    return (value ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function getPromocoes(product) {
    const values = Array.isArray(product.promocoes)
      ? product.promocoes
      : product.promocao
        ? [product.promocao]
        : [];
    return values.some((value) => normalize(value) === "promo geral")
      ? ["PROMO GERAL"]
      : [];
  }
  function getSubReferencia(product) {
    return getRawSubReferencia(product).replace(/\s+/g, " ").toUpperCase();
  }
  function getRawSubReferencia(product) {
    const match = String(product.descricao || "").match(/\(\s*(SUB[^)]*)\)/i);
    return match ? match[1].trim() : "";
  }
  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean).map(String))].sort((a, b) =>
      normalize(a).localeCompare(normalize(b), "pt-BR"),
    );
  }

  const SMALL = new Set(["e", "de", "da", "do", "para"]);
  const FIX = {
    DECORACAO: "Decoração",
    ESSENCIAS: "Essências",
    VALVULA: "Válvula",
    CASTICAIS: "Castiçais",
    CERAMICAS: "Cerâmicas",
    PLASTICO: "Plástico",
    XICARAS: "Xícaras",
    TACAS: "Taças",
    DECORACOES: "Decorações",
    CERAMICA: "Cerâmica",
    VALVULAS: "Válvulas",
  };
  function pretty(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (w, i) =>
          FIX[w] ||
          (i && SMALL.has(w.toLowerCase())
            ? w.toLowerCase()
            : w[0] + w.slice(1).toLowerCase()),
      )
      .join(" ");
  }
  function slugOf(name) {
    return normalize(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  const bySku = (a, b) =>
    String(a.sku || "").localeCompare(String(b.sku || ""), "pt-BR");

  // Capas dos subgrupos: procura assets/capas/<slug>.<extensão> e, se não achar, usa a foto do produto
  const CAPA_EXT = ["jpg", "png", "webp", "jpeg", "svg"];
  el.subGrid.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (img.tagName !== "IMG") return;
      if (img.classList.contains("capa")) {
        const next = Number(img.dataset.n) + 1;
        if (next < CAPA_EXT.length) {
          img.dataset.n = next;
          img.src = `assets/capas/${img.dataset.slug}.${CAPA_EXT[next]}`;
        } else {
          img.classList.remove("capa");
          img.src = img.dataset.cover;
        }
      } else {
        img.style.opacity = 0.15;
      }
    },
    true,
  );

  function buildSubs() {
    const map = new Map();
    state.all.forEach((p) => {
      const name = String(p.subgrupo || "").trim() || "OUTROS";
      if (!map.has(name))
        map.set(name, { name, slug: slugOf(name), items: [] });
      map.get(name).items.push(p);
    });
    state.subs = [...map.values()].sort(
      (a, b) =>
        (a.name === "OUTROS") - (b.name === "OUTROS") ||
        normalize(pretty(a.name)).localeCompare(
          normalize(pretty(b.name)),
          "pt-BR",
        ),
    );
    state.subs.forEach((s) => {
      s.items.sort(bySku);
      s.cover = (s.items.find((p) => p.imagem) || {}).imagem || "";
    });
    el.subGrid.innerHTML = state.subs
      .map(
        (s, i) => `
      <a class="sub-card" href="?subgrupo=${s.slug}" data-slug="${s.slug}" style="--i:${i}">
        <div class="sub-media"><img class="capa" decoding="async" loading="${i < 6 ? "eager" : "lazy"}" data-slug="${s.slug}" data-n="0" data-cover="${escapeHtml(s.cover)}" src="assets/capas/${s.slug}.${CAPA_EXT[0]}" alt=""></div>
        <div class="sub-info">
          <span class="sub-name">${escapeHtml(pretty(s.name))}</span>
          <div class="sub-foot">
            <span class="sub-count">${s.items.length} ${s.items.length === 1 ? "produto" : "produtos"}</span>
            <span class="sub-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span>
          </div>
        </div>
      </a>`,
      )
      .join("");
  }

  async function init() {
    try {
      const response = await fetch("data/products.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      state.all = Array.isArray(data.produtos) ? data.produtos : [];
      state.bySku = new Map(state.all.map((product) => [String(product.sku), product]));
      const date = data.gerado_em ? new Date(data.gerado_em) : null;
      const dateText =
        date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString("pt-BR")
          : "";
      el.metaInfo.textContent = `Atualizado em ${dateText}`;
      buildSubs();
      route();
      state.catalogStatus = "ready";
    } catch (error) {
      console.error(error);
      state.catalogStatus = "error";
      document.body.className = "v-list";
      el.empty.classList.add("visible");
      el.empty.querySelector("h2").textContent =
        "Não foi possível carregar o catálogo";
      el.empty.querySelector("p").textContent =
        "Verifique se o arquivo data/products.json existe e se a página está sendo aberta via servidor (http://), não diretamente do disco.";
    }
    if (el.overlay.classList.contains("visible") && quoteTriggers.includes(modalTrigger)) {
      renderQuote();
      el.modalBody.querySelector(".modal-close").focus({ preventScroll: true });
    }
  }

  // ----- Navegação (?subgrupo=slug + botão voltar do navegador) -----
  function route() {
    const slug = new URLSearchParams(location.search).get("subgrupo");
    state.sub = slug ? state.subs.find((s) => s.slug === slug) || null : null;
    el.search.value = "";
    el.clearBtn.classList.remove("visible");
    el.promoCheck.checked = false;
    document.title = state.sub
      ? `${pretty(state.sub.name)} | Freecom`
      : "Catálogo | Freecom Coml Util";
    refresh();
  }
  function navigate(slug, { query = "", onlyPromo = false } = {}) {
    history.pushState(
      { app: 1 },
      "",
      slug ? "?subgrupo=" + slug : location.pathname,
    );
    route();
    if (query) {
      el.search.value = query;
      el.clearBtn.classList.add("visible");
      el.promoCheck.checked = onlyPromo;
      refresh();
      el.search.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", () => {
    closeModal();
    route();
  });
  el.subGrid.addEventListener("click", (event) => {
    const link = event.target.closest(".sub-card");
    if (
      !link ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button
    )
      return;
    event.preventDefault();
    navigate(link.dataset.slug);
  });
  el.back.addEventListener("click", () => {
    if (el.search.value && !state.sub) {
      el.search.value = "";
      el.clearBtn.classList.remove("visible");
      refresh();
      return;
    }
    if (history.state && history.state.app) history.back();
    else navigate("");
  });

  // ----- Lista: subgrupo atual ou resultado da busca geral -----
  function refresh() {
    const terms = normalize(el.search.value).split(/\s+/).filter(Boolean);
    const listMode = !!state.sub || terms.length > 0;
    document.body.className = listMode ? "v-list" : "v-home";
    syncPlaceholder();
    if (!listMode) {
      el.promoCheck.checked = false;
      return;
    }
    const onlyPromo = el.promoCheck.checked;
    const list = (
      state.sub ? state.sub.items : state.all.slice().sort(bySku)
    ).filter((p) => {
      const promos = getPromocoes(p);
      const text = [p.sku, p.descricao, p.grupo, p.subgrupo, ...promos]
        .map(normalize)
        .join(" ");
      return (
        terms.every((t) => text.includes(t)) && (!onlyPromo || promos.length)
      );
    });
    state.filtered = list;
    state.rendered = 0;
    el.grid.innerHTML = "";
    el.title.textContent = state.sub
      ? pretty(state.sub.name)
      : "Resultados da busca";
    el.counter.textContent = `${list.length} ${list.length === 1 ? "produto" : "produtos"}`;
    el.empty.classList.toggle("visible", list.length === 0);
    emptyActions.replaceChildren();
    if (list.length === 0) updateEmptyState(onlyPromo);
    renderNextPage();
  }
  function updateEmptyState(onlyPromo) {
    const query = el.search.value.trim();
    const scope = state.sub
      ? `na categoria ${pretty(state.sub.name)}`
      : "no catálogo";
    el.empty.querySelector("h2").textContent = "Nenhum produto encontrado";
    el.empty.querySelector("p").textContent = query
      ? `Nenhum resultado para “${query}” ${scope}${onlyPromo ? " com o filtro de promoção ativo" : ""}.`
      : `Nenhum produto ${scope}${onlyPromo ? " está em promoção" : " está disponível"}.`;

    function addAction(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      emptyActions.append(button);
    }
    if (state.sub && query) {
      addAction("Buscar em todo o catálogo", () =>
        navigate("", { query, onlyPromo }),
      );
    }
    if (onlyPromo) {
      addAction("Remover filtro de promoção", () => {
        el.promoCheck.checked = false;
        el.promoCheck.focus();
        refresh();
      });
    }
    if (query) {
      addAction("Limpar busca", () => el.clearBtn.click());
    }
  }

  function addProductPhoto(container, product, lazy = false) {
    function placeholder() {
      const label = document.createElement("span");
      label.className = "photo-placeholder";
      label.textContent = "Foto indisponível";
      return label;
    }

    if (!product.imagem?.trim()) {
      container.append(placeholder());
      return;
    }

    const img = document.createElement("img");
    img.alt = product.descricao || "Foto do produto";
    if (lazy) img.loading = "lazy";
    img.addEventListener("error", () => img.replaceWith(placeholder()), {
      once: true,
    });
    container.append(img);
    img.src = product.imagem;
  }

  function updateCardQuoteStatus(card) {
    const badge = card.querySelector(".quote-tag");
    const selected = quote.has(card.dataset.sku);
    if (badge.hidden === !selected) return;
    badge.hidden = !selected;
    if (selected) card.setAttribute("aria-describedby", badge.id);
    else card.removeAttribute("aria-describedby");
  }

  function cardTemplate(product) {
    const promotions = getPromocoes(product);
    const subReferencia = getSubReferencia(product);
    const name = nameWithoutLeadingSku(product);
    const units = positiveInteger(product.qtd_por_caixa);
    const boxLabel = `cx ${units ?? "—"}`;
    const div = document.createElement("div");
    div.className = "card";
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `${product.sku} — ${name}`);
    div.dataset.sku = product.sku || "";
    const promotionTag = promotions.length
      ? `<span class="promo-tag">${escapeHtml(promotions[0])}</span>`
      : "";
    const subTag = subReferencia
      ? `<span class="sub-tag">${escapeHtml(subReferencia)}</span>`
      : "";
    const category = state.sub ? "" : [product.grupo, product.subgrupo].filter(Boolean).join(" · ");
    div.innerHTML = `
      <div class="thumb">
        <div class="thumb-badges">
          <span class="sku-tag">${escapeHtml(product.sku)}</span>
          ${promotionTag}
        </div>
        <span class="quote-tag" id="quote-card-${escapeHtml(encodeURIComponent(div.dataset.sku))}" hidden>Na cotação</span>
      </div>
      <div class="body">
        ${category ? `<div class="categoria">${escapeHtml(category)}</div>` : ""}
        <div class="desc">${escapeHtml(name)}</div>
        <div class="row-bottom">
          <div class="row-tags">${subTag}<span class="box-qty">${boxLabel}</span></div>
        </div>
      </div>`;
    addProductPhoto(div.querySelector(".thumb"), product, true);
    updateCardQuoteStatus(div);
    div.addEventListener("click", () => openModal(product, div));
    div.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(product, div);
      }
    });
    return div;
  }

  function renderNextPage() {
    const end = Math.min(
      state.rendered + state.pageSize,
      state.filtered.length,
    );
    const fragment = document.createDocumentFragment();
    for (let index = state.rendered; index < end; index += 1) {
      const card = cardTemplate(state.filtered[index]);
      card.style.animationDelay = (index - state.rendered) * 12 + "ms";
      fragment.appendChild(card);
    }
    el.grid.appendChild(fragment);
    state.rendered = end;
    el.loadingMore.classList.remove("visible");
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && state.rendered < state.filtered.length) {
          el.loadingMore.classList.add("visible");
          renderNextPage();
        }
      });
    },
    { rootMargin: "600px" },
  );
  observer.observe(el.sentinel);

  // ----- Cotação: seleção por SKU e embalagem -----
  const QUOTE_STORAGE = "freecom.quote.v1";
  const WHATSAPP_CONTACTS = [
    { name: "Silvana", phone: "5511989971280" },
    { name: "Evelyn", phone: "5511963234053" },
  ];
  const UNKNOWN_BOX = "Unidades por caixa a confirmar";
  const PRICE_ONLY = "Consulta de preço sem quantidade definida";
  const WITHOUT_QUANTITY = "Incluir sem quantidade";
  const quote = loadQuote();
  let toastTimer;

  function positiveInteger(value) {
    if (!/^\d+$/.test(String(value).trim())) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function loadQuote() {
    const entries = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(QUOTE_STORAGE));
      if (!Array.isArray(saved)) return entries;
      for (const item of saved) {
        if (!item || typeof item.sku !== "string" || !item.sku) continue;
        const quantity = item.quantity === null ? null : positiveInteger(item.quantity);
        if (item.quantity !== null && quantity === null) continue;
        const description = typeof item.description === "string" ? item.description : "";
        const packaging = item.packaging === "sub" ? "sub" : "box";
        let subUnits = packaging === "sub" ? positiveInteger(item.subUnits) : null;
        if (packaging === "sub" && item.subUnits === undefined) {
          const savedSizes = subPackaging({ descricao: description })?.sizes;
          if (savedSizes?.length === 1) subUnits = savedSizes[0];
        }
        entries.set(item.sku, {
          sku: item.sku,
          description,
          packaging,
          subUnits,
          quantity,
        });
      }
    } catch (_) {
      // A cotação ainda funciona em memória quando o navegador bloqueia o armazenamento.
    }
    return entries;
  }

  function saveQuote() {
    updateQuoteCount();
    el.grid.querySelectorAll(".card").forEach(updateCardQuoteStatus);
    try {
      localStorage.setItem(QUOTE_STORAGE, JSON.stringify([...quote.values()]));
      return true;
    } catch (_) {
      return false;
    }
  }

  function updateQuoteCount() {
    const hasProducts = quote.size > 0;
    const count = productCount();
    el.quoteTrigger.textContent = hasProducts ? `Ver cotação · ${count}` : "Montar cotação";
    el.mobileQuoteCount.textContent = count;
    el.mobileQuoteStart.hidden = hasProducts;
    el.mobileQuote.hidden = !hasProducts;
    document.body.toggleAttribute("data-has-quote", hasProducts);
  }

  function productCount() {
    return `${quote.size} ${quote.size === 1 ? "produto" : "produtos"}`;
  }

  function showQuoteToast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    toastTimer = setTimeout(() => { el.toast.textContent = ""; }, 3000);
  }

  function subPackaging(product) {
    const reference = getRawSubReferencia(product);
    if (!reference) return null;
    const amounts = reference.match(/^SUB\s*(\d+(?:\s*\/\s*\d+)*)$/i)?.[1];
    const sizes = amounts?.split("/").map(positiveInteger) || [];
    return { reference, sizes: sizes.includes(null) ? [] : [...new Set(sizes)] };
  }

  function packagingError(packaging, subUnits, sub) {
    if (packaging === "box") return "";
    if (!sub) return "A subcaixa saiu do catálogo. Selecione caixa fechada.";
    const valid = sub.sizes.length ? sub.sizes.includes(subUnits) : subUnits === null;
    if (valid) return "";
    return subUnits === null
      ? "Escolha quantas unidades vêm na subcaixa."
      : "O tamanho salvo da subcaixa saiu do catálogo. Escolha um tipo de caixa disponível.";
  }

  function packagingLabel(packaging, quantity) {
    const singular = packaging === "sub" ? "subcaixa" : "caixa";
    return `${quantity.toLocaleString("pt-BR")} ${singular}${quantity === 1 ? "" : "s"}`;
  }

  function packagingDetails(product, packaging, sub, subUnits) {
    if (packaging === "sub") {
      return subUnits
        ? `${unitLabel(subUnits)} por subcaixa`
        : sub?.reference || "Subcaixa indisponível";
    }
    const units = positiveInteger(product.qtd_por_caixa);
    return units ? `${unitLabel(units)} por caixa` : UNKNOWN_BOX;
  }

  function unitLabel(units) {
    return `${units.toLocaleString("pt-BR")} ${units === 1 || units === 1n ? "unidade" : "unidades"}`;
  }

  function totalUnits(units, quantity) {
    return `${unitLabel(BigInt(units) * BigInt(quantity))} no total`;
  }

  function packagingPicker(entry, sub, id) {
    if (!sub && entry.packaging !== "sub") return "";
    const selected = entry.packaging === "box"
      ? "box"
      : entry.subUnits ? `sub:${entry.subUnits}` : "sub";
    const unresolved = packagingError(entry.packaging, entry.subUnits, sub);
    const options = [{ value: "box", label: "Caixa fechada" }];
    if (sub?.sizes.length) {
      options.push(...sub.sizes.map((units) => ({
        value: `sub:${units}`, label: `Subcaixa · ${unitLabel(units)}`,
      })));
    } else if (sub) {
      options.push({ value: "sub", label: `Subcaixa · ${sub.reference}` });
    }
    return `
      <label class="packaging-picker">
        <span>Tipo de caixa</span>
        <select aria-label="Tipo de caixa do produto ${escapeHtml(entry.sku)}" aria-describedby="${id}-hint">
          ${unresolved ? `<option value="${selected}" selected disabled>Escolha o tipo de caixa</option>` : ""}
          ${options.map(({ value, label }) =>
            `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`,
          ).join("")}
        </select>
      </label>`;
  }

  function quoteEditor(entry, sub, id) {
    const hasQuantity = entry.quantity !== null;
    return `
      <div class="quote-editor" id="${id}-editor">
        ${packagingPicker(entry, sub, id)}
        <div class="quantity-fields"${hasQuantity ? "" : " hidden"}>
          <label class="quantity-label" for="${id}">Quantidade de caixas</label>
          <div class="quantity-stepper">
            <button type="button" data-step="-1" aria-label="Diminuir quantidade do SKU ${escapeHtml(entry.sku)}">−</button>
            <input id="${id}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
              aria-describedby="${id}-hint" value="${entry.quantity ?? 1}">
            <button type="button" data-step="1" aria-label="Aumentar quantidade do SKU ${escapeHtml(entry.sku)}">+</button>
          </div>
        </div>
        <p class="quote-hint" id="${id}-hint" role="status"></p>
        <label class="quote-mode">
          <input type="checkbox"${hasQuantity ? "" : " checked"} aria-label="${WITHOUT_QUANTITY} para o SKU ${escapeHtml(entry.sku)}">
          <span>${WITHOUT_QUANTITY}</span>
        </label>
      </div>`;
  }

  function bindQuoteEditor(container, product, sub, onChange, live = false) {
    const packaging = container.querySelector("select");
    const priceOnly = container.querySelector(".quote-mode input");
    const fields = container.querySelector(".quantity-fields");
    const label = fields.querySelector("label");
    const input = fields.querySelector("input");
    const [minus, plus] = fields.querySelectorAll("button");
    const hint = container.querySelector(".quote-hint");

    function read() {
      const [pack, capacity] = (packaging?.value || "box").split(":");
      const subUnits = positiveInteger(capacity);
      const quantity = priceOnly.checked ? null : positiveInteger(input.value);
      const invalidQuantity = !priceOnly.checked && quantity === null;
      const packagingIssue = packagingError(pack, subUnits, sub);
      return { pack, subUnits, quantity, invalidQuantity, packagingIssue };
    }

    function update(commit = live) {
      const { pack, subUnits, quantity, invalidQuantity, packagingIssue } = read();
      const error = invalidQuantity || Boolean(packagingIssue);
      let message = packagingIssue;
      if (!message && invalidQuantity) {
        message = "Digite uma quantidade inteira maior que zero.";
      } else if (!message && live) {
        const units = pack === "sub" ? subUnits : positiveInteger(product.qtd_por_caixa);
        message = quantity !== null && units
          ? totalUnits(units, quantity)
          : packagingDetails(product, pack, sub, subUnits);
      }
      label.textContent = pack === "sub" ? "Quantidade de subcaixas" : "Quantidade de caixas";
      fields.hidden = priceOnly.checked;
      minus.disabled = quantity === null || quantity <= 1;
      plus.disabled = quantity === Number.MAX_SAFE_INTEGER;
      input.setAttribute("aria-invalid", String(invalidQuantity));
      packaging?.setAttribute("aria-invalid", String(Boolean(packagingIssue)));
      hint.classList.toggle("is-error", error);
      if (hint.textContent !== message) hint.textContent = message;
      if (commit) onChange(error ? null : {
        sku: String(product.sku), description: product.descricao, packaging: pack, subUnits, quantity,
      });
    }

    input.addEventListener("input", () => update());
    priceOnly.addEventListener("change", () => update());
    packaging?.addEventListener("change", () => update());
    for (const button of [minus, plus]) {
      button.addEventListener("click", () => {
        const next = (positiveInteger(input.value) ?? 0) + Number(button.dataset.step);
        input.value = next;
        update();
        if (button.disabled) input.focus();
      });
    }
    update(false);
    return {
      submit() {
        update(true);
        const { invalidQuantity, packagingIssue } = read();
        if (packagingIssue) packaging.focus();
        else if (invalidQuantity) input.focus();
      },
    };
  }

  function buildQuoteMessage() {
    const lines = [...quote.values()].map((entry, index) => {
      const product = state.bySku.get(entry.sku);
      const sub = subPackaging(product);
      const pack = entry.packaging;
      const units = pack === "sub" ? entry.subUnits : positiveInteger(product.qtd_por_caixa);
      const details = packagingDetails(product, pack, sub, entry.subUnits);
      const quantity = entry.quantity;
      let summary = quantity === null
        ? `${PRICE_ONLY} · ${pack === "sub" ? "Subcaixa" : "Caixa fechada"} · ${details}`
        : `${packagingLabel(pack, quantity)} · ${details}`;
      if (quantity !== null && units) {
        summary = `${packagingLabel(pack, quantity)} × ${unitLabel(units)} = ${totalUnits(units, quantity)}`;
      }
      if (pack === "sub" && !positiveInteger(product.qtd_por_caixa)) summary += ` · ${UNKNOWN_BOX}`;
      const name = nameWithoutLeadingSku(product);
      return `${index + 1}. SKU ${entry.sku} · ${name}\n   ${summary}`;
    });
    return [
      "Olá! Gostaria de solicitar uma cotação para os seguintes produtos do catálogo Freecom:",
      ...lines,
    ].join("\n\n");
  }

  function openQuote(event) {
    renderQuote();
    showModal(event.currentTarget);
  }

  function quoteItemSummary(product, sub, entry) {
    const { packaging, subUnits, quantity } = entry;
    const issue = packagingError(packaging, subUnits, sub);
    if (issue) return issue;

    if (quantity === null) {
      const type = packaging === "sub"
        ? subUnits ? `Subcaixa de ${unitLabel(subUnits)}` : sub.reference
        : "Caixa fechada";
      return `Sem quantidade · ${type}`;
    }

    const units = packaging === "sub" ? subUnits : positiveInteger(product.qtd_por_caixa);
    const amount = packagingLabel(packaging, quantity);
    const boxes = subUnits ? `${amount} de ${subUnits.toLocaleString("pt-BR")}` : amount;
    const total = units
      ? unitLabel(BigInt(units) * BigInt(quantity))
      : packagingDetails(product, packaging, sub, subUnits);
    return `${boxes} · ${total}`;
  }

  function showQuoteItemEditor(editor, button, expanded) {
    editor.hidden = !expanded;
    button.textContent = expanded ? "Concluir" : "Editar";
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", `${expanded ? "Concluir edição do" : "Editar"} produto ${button.dataset.sku}`);
  }

  function syncQuoteReviewLayout() {
    const list = el.modalBody.querySelector(".quote-items");
    if (!list) return;
    const compact = mobileHeader.matches && quote.size >= 20;
    if (list.classList.contains("quote-items-compact") === compact) return;
    list.classList.toggle("quote-items-compact", compact);
    const focused = document.activeElement;
    for (const summary of list.querySelectorAll(".quote-item-summary")) {
      const editor = summary.nextElementSibling;
      const button = summary.querySelector(".quote-item-edit");
      summary.hidden = !compact;
      if (compact) {
        showQuoteItemEditor(editor, button, editor.contains(focused) || button.getAttribute("aria-expanded") === "true");
      } else {
        editor.hidden = false;
        if (focused === button) summary.parentElement.querySelector(".quote-remove").focus();
      }
    }
  }

  function renderQuote() {
    el.modalBody.className = "modal modal-quote";
    el.modalBody.innerHTML = `
      <div class="modal-head">
        <div>
          <h2 id="modal-title">Minha cotação</h2>
          <div class="quote-overview">
            <p class="quote-count"></p>
            <button class="quote-clear" type="button" aria-expanded="false" aria-controls="quote-clear-confirm" hidden>Limpar cotação</button>
            <div class="quote-clear-confirm" id="quote-clear-confirm" role="group" aria-labelledby="quote-clear-question" hidden>
              <p id="quote-clear-question">Limpar tudo?</p>
              <div class="quote-clear-actions">
                <button class="quote-clear-cancel" type="button">Cancelar</button>
                <button class="quote-clear-submit" type="button"><span>Limpar</span></button>
              </div>
            </div>
          </div>
        </div>
        <button class="modal-close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-scroll quote-scroll">
        <p class="quote-reset-status" role="status"></p>
        <p class="quote-empty">Abra um produto, escolha a quantidade e toque em <strong>Adicionar à cotação</strong>. Depois, revise a lista e envie pelo WhatsApp.</p>
        <ul class="quote-items" aria-label="Produtos da cotação"></ul>
      </div>
      <div class="modal-footer quote-footer">
        <p class="quote-issue" role="status" hidden></p>
        <textarea class="quote-copy-text" aria-label="Lista para copiar manualmente" readonly hidden></textarea>
        <p class="quote-copy-status" role="status"></p>
        <div class="quote-contact-picker" id="quote-contact-picker" hidden>
          <h3 class="quote-contact-title" id="quote-contact-title" tabindex="-1">Escolha uma vendedora</h3>
          <div class="quote-contact-options" role="group" aria-labelledby="quote-contact-title">
            ${WHATSAPP_CONTACTS.map(({ name, phone }) => `
              <a class="primary-btn quote-contact" data-phone="${phone}" target="_blank" rel="noopener noreferrer">
                <span class="quote-contact-name">
                  <img src="assets/img/whatsapp-glyph-white.svg" alt="" width="16" height="16">
                  <strong>${name}</strong>
                </span>
                <span class="quote-contact-phone">${phone.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")}</span>
              </a>`).join("")}
          </div>
        </div>
        <div class="modal-actions">
          <button class="copy-btn" type="button">Copiar lista</button>
          <button class="primary-btn quote-request" type="button" aria-expanded="false" aria-controls="quote-contact-picker">
            <img src="assets/img/whatsapp-glyph-white.svg" alt="" width="17" height="17">
            Pedir cotação
          </button>
          <button class="primary-btn quote-contact-back" type="button" hidden>Voltar</button>
        </div>
      </div>`;
    const list = el.modalBody.querySelector(".quote-items");
    const empty = el.modalBody.querySelector(".quote-empty");
    const footer = el.modalBody.querySelector(".quote-footer");
    const count = el.modalBody.querySelector(".quote-count");
    const issue = el.modalBody.querySelector(".quote-issue");
    const copy = footer.querySelector(".modal-actions .copy-btn");
    const request = footer.querySelector(".quote-request");
    const contactPicker = footer.querySelector(".quote-contact-picker");
    const contactTitle = contactPicker.querySelector(".quote-contact-title");
    const contacts = contactPicker.querySelectorAll(".quote-contact");
    const contactBack = footer.querySelector(".quote-contact-back");
    const copyText = el.modalBody.querySelector(".quote-copy-text");
    const copyStatus = el.modalBody.querySelector(".quote-copy-status");
    const resetStatus = el.modalBody.querySelector(".quote-reset-status");
    const clear = el.modalBody.querySelector(".quote-clear");
    const confirmation = el.modalBody.querySelector(".quote-clear-confirm");
    const cancel = confirmation.querySelector(".quote-clear-cancel");
    const unavailable = new Set();
    const invalid = new Set();
    let message = "";

    function setClearConfirmation(open) {
      confirmation.hidden = !open;
      count.hidden = open;
      clear.hidden = open || quote.size === 0;
      clear.setAttribute("aria-expanded", String(open));
    }

    function setContactPicker(open) {
      contactPicker.hidden = !open;
      contactBack.hidden = !open;
      request.hidden = open;
      request.setAttribute("aria-expanded", String(open));
    }

    function updateActions() {
      count.textContent = productCount();
      syncQuoteReviewLayout();
      setClearConfirmation(quote.size > 0 && !confirmation.hidden);
      const emptyQuote = quote.size === 0 && state.catalogStatus === "ready";
      empty.hidden = !emptyQuote;
      footer.hidden = emptyQuote;
      issue.textContent = state.catalogStatus === "loading"
        ? "Carregando catálogo…"
        : state.catalogStatus === "error"
          ? "O catálogo não carregou. Recarregue a página para conferir os produtos."
          : unavailable.size
            ? "Remova os produtos fora do catálogo para continuar."
            : invalid.size
              ? "Revise os tipos de caixa e as quantidades indicadas para continuar."
              : "";
      issue.hidden = !issue.textContent;
      copyText.hidden = true;
      copyStatus.textContent = "";
      const ready = state.catalogStatus === "ready" && !issue.textContent && quote.size > 0;
      copy.disabled = !ready;
      request.disabled = !ready;
      message = ready ? buildQuoteMessage() : "";
      const encoded = encodeURIComponent(message);
      for (const contact of contacts) {
        if (ready) contact.href = `https://wa.me/${contact.dataset.phone}?text=${encoded}`;
        else contact.removeAttribute("href");
      }
      if (!ready) setContactPicker(false);
    }

    request.addEventListener("click", () => {
      setClearConfirmation(false);
      setContactPicker(true);
      contactTitle.focus();
    });
    contactBack.addEventListener("click", () => {
      setContactPicker(false);
      request.focus();
    });
    clear.addEventListener("click", () => {
      setContactPicker(false);
      setClearConfirmation(true);
      cancel.focus();
    });
    cancel.addEventListener("click", () => {
      setClearConfirmation(false);
      clear.focus();
    });
    confirmation.querySelector(".quote-clear-submit").addEventListener("click", () => {
      quote.clear();
      unavailable.clear();
      invalid.clear();
      list.replaceChildren();
      const persisted = saveQuote();
      updateActions();
      resetStatus.textContent = persisted
        ? "Cotação limpa."
        : "Cotação limpa nesta aba. O navegador não salvou a alteração.";
      el.modalBody.querySelector(".modal-close").focus();
    });

    let index = 0;
    for (const entry of quote.values()) {
      const product = state.bySku.get(entry.sku);
      const sub = product ? subPackaging(product) : null;
      const missing = !product && state.catalogStatus === "ready";
      const editorId = `quote-amount-${index++}`;
      const name = nameWithoutLeadingSku({
        sku: entry.sku,
        descricao: product?.descricao || entry.description,
      });
      if (missing) unavailable.add(entry.sku);
      if (product && packagingError(entry.packaging, entry.subUnits, sub)) invalid.add(entry.sku);
      const item = document.createElement("li");
      item.className = "quote-item";
      item.innerHTML = `
        <div class="quote-item-head">
          <div class="quote-photo"></div>
          <div>
            <span class="quote-sku">${escapeHtml(entry.sku)}</span>
            ${name && name !== entry.sku ? `<h3>${escapeHtml(name)}</h3>` : ""}
          </div>
        </div>
        ${product ? `
          <div class="quote-item-summary" hidden>
            <p class="quote-item-summary-text"></p>
            <button class="quote-item-edit" type="button" aria-expanded="false"
              aria-controls="${editorId}-editor" aria-label="Editar produto ${escapeHtml(entry.sku)}" data-sku="${escapeHtml(entry.sku)}">Editar</button>
          </div>
          ${quoteEditor(entry, sub, editorId)}` : `
          <p class="quote-hint${missing ? " is-error" : ""}">
            ${missing ? "Produto fora do catálogo · " : ""}
            ${entry.quantity === null ? PRICE_ONLY : packagingLabel(entry.packaging, entry.quantity)}
          </p>`}
        <button class="quote-remove" type="button" aria-label="Remover SKU ${escapeHtml(entry.sku)}">Remover</button>`;
      if (product) addProductPhoto(item.querySelector(".quote-photo"), product, true);
      const editor = item.querySelector(".quote-editor");
      if (editor) {
        const summaryText = item.querySelector(".quote-item-summary-text");
        const edit = item.querySelector(".quote-item-edit");
        summaryText.textContent = quoteItemSummary(product, sub, entry);
        summaryText.classList.toggle("is-error", invalid.has(entry.sku));
        edit.addEventListener("click", () => {
          if (!editor.hidden && invalid.has(entry.sku)) {
            editor.querySelector('[aria-invalid="true"]').focus();
            return;
          }
          showQuoteItemEditor(editor, edit, editor.hidden);
        });
        bindQuoteEditor(editor, product, sub, (updated) => {
          if (updated) {
            invalid.delete(entry.sku);
            quote.set(entry.sku, updated);
            summaryText.textContent = quoteItemSummary(product, sub, updated);
          } else {
            invalid.add(entry.sku);
            summaryText.textContent = "Revise o tipo de caixa e a quantidade.";
          }
          summaryText.classList.toggle("is-error", !updated);
          updateActions();
          if (updated && !saveQuote()) copyStatus.textContent = "Alteração salva apenas nesta aba.";
        }, true);
      }
      item.querySelector(".quote-remove").addEventListener("click", () => {
        const neighbor = item.nextElementSibling || item.previousElementSibling;
        quote.delete(entry.sku);
        unavailable.delete(entry.sku);
        invalid.delete(entry.sku);
        item.remove();
        updateActions();
        if (!saveQuote()) copyStatus.textContent = "Alteração salva apenas nesta aba.";
        (neighbor?.querySelector(".quote-remove") || el.modalBody.querySelector(".modal-close")).focus();
      });
      list.append(item);
    }
    copy.addEventListener("click", async () => {
      const text = message;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (message === text) copyStatus.textContent = "Lista copiada.";
      } catch (_) {
        if (message !== text || !el.overlay.classList.contains("visible") || !copyText.isConnected) return;
        copyText.value = text;
        copyText.hidden = false;
        copyStatus.textContent = "Texto selecionado. Use o comando Copiar do seu dispositivo.";
        copyText.focus();
        copyText.select();
      }
    });
    updateActions();
  }
  updateQuoteCount();
  quoteTriggers.forEach((trigger) => trigger.addEventListener("click", openQuote));

  // ----- Ficha de produto e comportamento dos diálogos -----
  let modalTrigger;
  let previousOverflow;
  let inertElements = [];

  function openModal(product, trigger) {
    const sku = String(product.sku);
    const saved = quote.get(sku);
    const entry = saved || { sku, packaging: "box", quantity: 1 };
    const promotions = getPromocoes(product);
    const sub = subPackaging(product);
    const promotionTag = promotions.length
      ? `<span class="promo-tag">${escapeHtml(promotions.join(" · "))}</span>`
      : "";
    const subFact = sub
      ? `<div><strong>Subcaixa</strong><span>${escapeHtml(packagingDetails(product, "sub", sub, sub.sizes.length === 1 ? sub.sizes[0] : null))}</span></div>`
      : "";
    el.modalBody.className = "modal modal-product";
    el.modalBody.innerHTML = `
      <div class="modal-head">
        <div class="product-badges">
          <span class="modal-sku">${escapeHtml(product.sku)}</span>
          ${promotionTag}
        </div>
        <button class="modal-close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-scroll product-scroll">
        <div class="modal-img"></div>
        <div class="modal-info">
          <div class="product-description">
            <div class="modal-breadcrumb">${escapeHtml([product.grupo, product.subgrupo].filter(Boolean).join(" · "))}</div>
            <h2 id="modal-title">${escapeHtml(nameWithoutLeadingSku(product))}</h2>
          </div>
          <div class="modal-facts">
            <div><strong>Venda por caixa fechada</strong><span>${packagingDetails(product, "box", sub)}</span></div>
            ${subFact}
          </div>
          ${quoteEditor(entry, sub, "product-amount")}
        </div>
      </div>
      <div class="modal-footer product-footer">
        <div class="modal-actions">
          <button class="copy-btn" id="copy-sku-btn" type="button">Copiar código</button>
          <button class="primary-btn" type="button">${saved ? "Atualizar cotação" : "Adicionar à cotação"}</button>
        </div>
      </div>`;
    addProductPhoto(el.modalBody.querySelector(".modal-img"), product);
    const editor = bindQuoteEditor(el.modalBody.querySelector(".quote-editor"), product, sub, (updated) => {
      if (!updated) return;
      quote.set(sku, updated);
      const persisted = saveQuote();
      closeModal();
      const feedback = saved ? "Cotação atualizada." : "Produto adicionado à cotação.";
      showQuoteToast(persisted ? feedback : `${feedback} Lista salva apenas nesta aba.`);
    });
    el.modalBody.querySelector(".primary-btn").addEventListener("click", editor.submit);
    el.modalBody.querySelector("#product-amount").addEventListener("keydown", (event) => {
      if (event.key === "Enter") editor.submit();
    });
    const copy = el.modalBody.querySelector("#copy-sku-btn");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(sku);
        copy.textContent = "Copiado!";
        copy.classList.add("copied");
        setTimeout(() => {
          copy.textContent = "Copiar código";
          copy.classList.remove("copied");
        }, 1400);
      } catch (_) {
        copy.textContent = "Selecione o código";
      }
    });
    showModal(trigger);
  }

  function showModal(trigger) {
    modalTrigger = trigger;
    window.scrollTo({ top: window.scrollY, behavior: "instant" });
    el.overlay.classList.add("visible");
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = el.modalBody.querySelector(".modal-close");
    close.focus({ preventScroll: true });
    inertElements = [...document.body.children].filter(
      (element) => element !== el.overlay && element !== el.toast && !element.inert,
    );
    inertElements.forEach((element) => {
      element.inert = true;
    });
  }
  function closeModal() {
    if (!el.overlay.classList.contains("visible")) return;
    el.overlay.classList.remove("visible");
    document.body.style.overflow = previousOverflow;
    inertElements.forEach((element) => {
      element.inert = false;
    });
    inertElements = [];
    const fallback = toTop.classList.contains("show")
      ? toTop
      : el.mobileQuoteStart.getClientRects().length ? el.mobileQuoteStart : el.search;
    const target = modalTrigger?.getClientRects().length ? modalTrigger : fallback;
    target.focus({ preventScroll: target === modalTrigger || target === toTop });
    modalTrigger = null;
  }
  el.overlay.addEventListener("click", (event) => {
    if (event.target === el.overlay || event.target.closest(".modal-close")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (!el.overlay.classList.contains("visible")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      const cancel = el.modalBody.querySelector(".quote-clear-confirm:not([hidden]) .quote-clear-cancel");
      const contactBack = el.modalBody.querySelector(".quote-contact-back:not([hidden])");
      if (cancel) cancel.click();
      else if (contactBack) contactBack.click();
      else closeModal();
    } else if (event.key === "Tab") {
      const controls = [...el.modalBody.querySelectorAll(
        "button:enabled, input:enabled, select:enabled, textarea:enabled, a[href]",
      )].filter((control) => !control.closest("[hidden]"));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        !el.modalBody.contains(document.activeElement) ||
        document.activeElement === (event.shiftKey ? first : last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  });

  let debounceTimer;
  el.search.addEventListener("input", () => {
    el.clearBtn.classList.toggle("visible", el.search.value.length > 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refresh, 90);
  });
  el.clearBtn.addEventListener("click", () => {
    el.search.value = "";
    el.clearBtn.classList.remove("visible");
    el.search.focus();
    refresh();
  });
  el.promoCheck.addEventListener("change", refresh);

  // No desktop, apenas o bloco da marca recolhe ao rolar.
  const topEl = $("top");
  const mobileHeader = window.matchMedia("(max-width: 720px)");
  const fullPlaceholder = el.search.placeholder;

  mobileHeader.addEventListener("change", () => {
    syncQuoteReviewLayout();
    if (mobileHeader.matches) topEl.classList.remove("is-compact");
    requestCompactUpdate();
    syncPlaceholder();
  });

  let compactTicking = false,
    compactLockUntil = 0;
  function requestCompactUpdate() {
    if (mobileHeader.matches || compactTicking) return;
    compactTicking = true;
    requestAnimationFrame(updateCompact);
  }
  function updateCompact() {
    compactTicking = false;
    if (mobileHeader.matches) return;
    const now = performance.now();
    if (now < compactLockUntil) {
      setTimeout(requestCompactUpdate, compactLockUntil - now + 30);
      return;
    }
    const y = window.scrollY;
    const compact = topEl.classList.contains("is-compact");
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight > 400;
    if (!compact && y > 140 && scrollable) {
      topEl.classList.add("is-compact");
      compactLockUntil = now + 450;
    } else if (compact && y < 8) {
      topEl.classList.remove("is-compact");
      compactLockUntil = now + 450;
    }
  }
  function syncPlaceholder() {
    const scope = state.sub
      ? `Buscar em ${pretty(state.sub.name)}`
      : "Buscar em todo o catálogo";
    el.search.placeholder = state.sub
      ? scope
      : mobileHeader.matches ? "Buscar produtos" : fullPlaceholder;
    el.search.setAttribute("aria-label", scope + " por código ou descrição");
  }
  window.addEventListener("scroll", requestCompactUpdate, { passive: true });

  // Botão "voltar ao topo"
  const toTop = $("to-top");
  window.addEventListener(
    "scroll",
    () => toTop.classList.toggle("show", window.scrollY > 700),
    { passive: true },
  );
  toTop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );

  init();
})();
