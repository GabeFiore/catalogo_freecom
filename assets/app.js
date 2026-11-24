(function () {
  "use strict";

  const state = {
    all: [],
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
  };
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

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value)))
      return "—";
    return Number.isInteger(Number(value))
      ? String(Number(value))
      : String(value).replace(".", ",");
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
    const match = String(product.descricao || "").match(/\(\s*(SUB[^)]*)\)/i);
    return match ? match[1].replace(/\s+/g, " ").trim().toUpperCase() : "";
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
      const date = data.gerado_em ? new Date(data.gerado_em) : null;
      const dateText =
        date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString("pt-BR")
          : "";
      el.metaInfo.textContent = `Atualizado em ${dateText}`;
      buildSubs();
      route();
    } catch (error) {
      console.error(error);
      document.body.className = "v-list";
      el.empty.classList.add("visible");
      el.empty.querySelector("h2").textContent =
        "Não foi possível carregar o catálogo";
      el.empty.querySelector("p").textContent =
        "Verifique se o arquivo data/products.json existe e se a página está sendo aberta via servidor (http://), não diretamente do disco.";
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
    if (!listMode) return;
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

  function cardTemplate(product) {
    const promotions = getPromocoes(product);
    const subReferencia = getSubReferencia(product);
    const div = document.createElement("div");
    div.className = "card";
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `${product.sku} — ${product.descricao}`);
    div.dataset.sku = product.sku || "";
    const promotionTag = promotions.length
      ? `<span class="promo-tag">${escapeHtml(promotions[0])}</span>`
      : "";
    const subTag = subReferencia
      ? `<span class="sub-tag">${escapeHtml(subReferencia)}</span>`
      : "";
    div.innerHTML = `
      <div class="thumb">
        <span class="sku-tag">${escapeHtml(product.sku)}</span>
        ${promotionTag}
      </div>
      <div class="body">
        <div class="categoria">${escapeHtml([product.grupo, product.subgrupo].filter(Boolean).join(" · "))}</div>
        <div class="desc">${escapeHtml(product.descricao)}</div>
        <div class="row-bottom">
          <div class="row-tags">${subTag}<span class="box-qty">cx ${formatNumber(product.qtd_por_caixa)}</span></div>
        </div>
      </div>`;
    addProductPhoto(div.querySelector(".thumb"), product, true);
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

  let modalTrigger;
  let previousOverflow;
  let inertElements = [];
  el.modalBody.setAttribute("role", "dialog");
  el.modalBody.setAttribute("aria-modal", "true");
  el.modalBody.setAttribute("aria-labelledby", "product-modal-title");

  function openModal(product, trigger) {
    modalTrigger = trigger;
    const promotions = getPromocoes(product);
    const subReferencia = getSubReferencia(product);
    const promotionTag = promotions.length
      ? `<span class="promo-tag">${escapeHtml(promotions.join(" · "))}</span>`
      : "";
    const subFact = subReferencia
      ? `<div><div class="fact-label">Referência</div><div class="fact-value">${escapeHtml(subReferencia)}</div></div>`
      : "";
    el.modalBody.innerHTML = `
      <button class="modal-close" aria-label="Fechar">&times;</button>
      <div class="modal-img">${promotionTag}</div>
      <div class="modal-info">
        <span class="modal-sku">${escapeHtml(product.sku)}</span>
        <div class="modal-breadcrumb">${escapeHtml([product.grupo, product.subgrupo].filter(Boolean).join(" · "))}</div>
        <h2 id="product-modal-title">${escapeHtml(product.descricao)}</h2>
        <div class="modal-facts">
          <div><div class="fact-label">Itens por caixa</div><div class="fact-value">${formatNumber(product.qtd_por_caixa)}</div></div>
          ${subFact}
        </div>
        <button class="copy-btn" id="copy-sku-btn">Copiar código</button>
      </div>`;
    addProductPhoto(el.modalBody.querySelector(".modal-img"), product);
    el.overlay.classList.add("visible");
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = el.modalBody.querySelector(".modal-close");
    close.addEventListener("click", closeModal);
    close.focus();
    inertElements = [...document.body.children].filter(
      (element) => element !== el.overlay && !element.inert,
    );
    inertElements.forEach((element) => {
      element.inert = true;
    });
    el.modalBody
      .querySelector("#copy-sku-btn")
      .addEventListener("click", async (event) => {
        try {
          await navigator.clipboard.writeText(String(product.sku || ""));
          event.target.textContent = "Copiado!";
          event.target.classList.add("copied");
          setTimeout(() => {
            event.target.textContent = "Copiar código";
            event.target.classList.remove("copied");
          }, 1400);
        } catch (_) {
          event.target.textContent = "Selecione o código";
        }
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
    const target = modalTrigger?.isConnected ? modalTrigger : el.search;
    target.focus({ preventScroll: true });
    modalTrigger = null;
  }
  el.overlay.addEventListener("click", (event) => {
    if (event.target === el.overlay) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (!el.overlay.classList.contains("visible")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    } else if (event.key === "Tab") {
      const controls = el.modalBody.querySelectorAll("button:not([disabled])");
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

  // Recolhe o bloco da marca ao rolar (com folga e trava para não oscilar)
  const topEl = $("top"),
    fullPlaceholder = el.search.placeholder;
  let compactTicking = false,
    compactLockUntil = 0;
  function requestCompactUpdate() {
    if (!compactTicking) {
      compactTicking = true;
      requestAnimationFrame(updateCompact);
    }
  }
  function updateCompact() {
    compactTicking = false;
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
    syncPlaceholder();
  }
  function syncPlaceholder() {
    const short =
      window.innerWidth <= 720 &&
      (document.body.classList.contains("v-list") ||
        topEl.classList.contains("is-compact"));
    const scope = state.sub
      ? `Buscar em ${pretty(state.sub.name)}`
      : "Buscar em todo o catálogo";
    el.search.placeholder = state.sub
      ? scope
      : short
        ? "Buscar no catálogo"
        : fullPlaceholder;
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
