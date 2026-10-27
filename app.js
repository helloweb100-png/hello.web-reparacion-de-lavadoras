/* ==========================================================================
   BLANCA · Servicio técnico Samsung · CDMX
   app.js

   Capas de comportamiento (cada bloque es independiente):
   1.  Configuración y utilidades
   2.  Enlaces de WhatsApp (data-wa)
   3.  Texto dividido en palabras (revelado con máscara)
   4.  Loader con progreso
   5.  Scroll suave (Lenis) sincronizado con ScrollTrigger
   6.  Header, navegación activa y menú móvil
   7.  Hero: parallax del escenario y burbujas en canvas
   8.  Revelado al scroll + contadores
   9.  Sección "la imagen se abre" (GSAP, sticky + clip-path)
   10. Proceso en scroll horizontal fijado (GSAP)
   11. Catálogo: filtros, fallas, solicitud y drawer
   12. Carrusel de opiniones
   13. FAQ, formulario de contacto y botón flotante
   14. Micro-interacciones: magnético y spotlight

   Si GSAP, ScrollTrigger o Lenis no cargan (CDN caído), la página sigue
   funcionando con el layout estático y los revelados por IntersectionObserver.
   Todo el movimiento respeta prefers-reduced-motion.
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1. CONFIGURACIÓN Y UTILIDADES
     ====================================================================== */
  // Cambiar aquí el número de WhatsApp (formato internacional, sin + ni espacios)
  var WA_NUMBER = '525529913258';
  var DEFAULT_MSG = 'Hola, necesito servicio técnico para mi equipo Samsung.';

  var d = document;
  var root = d.documentElement;
  var body = d.body;

  var $ = function (sel, ctx) { return (ctx || d).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  var lenis = null;

  if (hasGSAP) { gsap.registerPlugin(ScrollTrigger); }

  function waUrl(text) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text || DEFAULT_MSG);
  }

  function openWhatsApp(text) {
    var win = window.open(waUrl(text), '_blank', 'noopener');
    if (!win) { window.location.href = waUrl(text); }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) { return; }
    $('#toastMsg').textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 3200);
  }

  var refreshTimer = null;
  function refreshScroll() {
    if (!hasGSAP) { return; }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 120);
  }

  /* Bloqueo de scroll compartido por menú y drawer */
  var lockCount = 0;
  function lockScroll() {
    lockCount += 1;
    body.classList.add('is-locked');
    if (lenis) { lenis.stop(); }
  }
  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      body.classList.remove('is-locked');
      if (lenis) { lenis.start(); }
    }
  }

  function trapFocus(container, e) {
    if (e.key !== 'Tab') { return; }
    var focusables = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', container)
      .filter(function (el) { return el.getClientRects().length > 0; });
    if (!focusables.length) { return; }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ======================================================================
     2. ENLACES DE WHATSAPP
     Cada CTA lleva su propio mensaje en data-wa; las zonas usan data-zone.
     ====================================================================== */
  function hydrateWhatsApp() {
    $$('[data-wa]').forEach(function (a) { a.href = waUrl(a.getAttribute('data-wa')); });
    $$('[data-zone]').forEach(function (a) {
      var zone = a.getAttribute('data-zone');
      a.href = waUrl('Hola, mi equipo Samsung está en ' + zone + '. ¿Pueden visitarme?');
    });
  }

  /* ======================================================================
     3. TEXTO DIVIDIDO EN PALABRAS (máscara de revelado)
     ====================================================================== */
  function splitWords(el) {
    var index = 0;
    var frag = d.createDocumentFragment();
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());

    function addWords(text, extraClass) {
      text.split(/(\s+)/).forEach(function (token) {
        if (!token) { return; }
        if (/^\s+$/.test(token)) { frag.appendChild(d.createTextNode(' ')); return; }
        var mask = d.createElement('span');
        mask.className = 'w';
        mask.setAttribute('aria-hidden', 'true');
        var inner = d.createElement('span');
        inner.className = 'w__i' + (extraClass ? ' ' + extraClass : '');
        inner.style.setProperty('--wi', index++);
        inner.textContent = token;
        mask.appendChild(inner);
        frag.appendChild(mask);
      });
    }

    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) { addWords(node.textContent, ''); }
      else { addWords(node.textContent, node.className); }
    });

    el.textContent = '';
    el.appendChild(frag);
  }

  function initSplit() {
    $$('[data-split], .section-head .h2, .zones__copy .h2, .faq__side .h2, .contact__copy .h2').forEach(splitWords);
  }

  /* ======================================================================
     4. LOADER
     Progreso suave; espera a fuentes y recursos (máx. 4.5 s) y mínimo 1.9 s.
     ====================================================================== */
  function runLoader(onDone) {
    var bar = $('#loaderBar');
    var pct = $('#loaderPct');
    if (!bar || !pct || !root.classList.contains('js')) { onDone(); return; }

    var MIN = reduce ? 250 : 1900;
    var start = performance.now();
    var ready = false;

    var winLoad = new Promise(function (res) {
      if (d.readyState === 'complete') { res(); } else { window.addEventListener('load', res, { once: true }); }
    });
    var fonts = (d.fonts && d.fonts.ready) ? d.fonts.ready : Promise.resolve();
    Promise.race([
      Promise.all([winLoad, fonts]),
      new Promise(function (res) { setTimeout(res, 4500); })
    ]).then(function () { ready = true; });

    var finished = false;
    function frame(now) {
      var t = Math.min((now - start) / MIN, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = ready ? eased : Math.min(eased, 0.94);
      bar.style.transform = 'scaleX(' + value.toFixed(3) + ')';
      pct.textContent = Math.round(value * 100) + '%';

      if (ready && t >= 1 && !finished) {
        finished = true;
        pct.textContent = '100%';
        setTimeout(onDone, 220);
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ======================================================================
     5. SCROLL SUAVE (Lenis) + ScrollTrigger
     ====================================================================== */
  function initSmoothScroll() {
    if (reduce || !window.Lenis) { return; }
    lenis = new window.Lenis({
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 0.9
    });

    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var loop = function (t) { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    lenis.stop(); // se reanuda cuando termina el loader
  }

  function scrollToTarget(target, immediate) {
    if (!target) { return; }
    var offset = target.id === 'inicio' ? 0 : -((parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 70) + 8);
    if (lenis) {
      lenis.scrollTo(target, { offset: offset, duration: immediate ? 0 : 1.5, immediate: !!immediate });
    } else {
      var y = target.getBoundingClientRect().top + window.pageYOffset + offset;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce || immediate ? 'auto' : 'smooth' });
    }
  }

  function initAnchors() {
    d.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) { return; }
      var hash = link.getAttribute('href');
      if (hash.length < 2) { return; }
      var target = d.getElementById(hash.slice(1));
      if (!target) { return; }
      e.preventDefault();

      if (link.hasAttribute('data-filter-link')) { applyFilter(link.getAttribute('data-filter-link')); }
      if (menu && menu.classList.contains('is-open')) { closeMenu(true); }
      scrollToTarget(target);
    });
  }

  /* ======================================================================
     6. HEADER, NAV ACTIVA Y MENÚ MÓVIL
     ====================================================================== */
  var menu = $('#menu');
  var burger = $('#burger');
  var menuOpener = null;

  function openMenu() {
    if (!menu) { return; }
    menuOpener = d.activeElement;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Cerrar menú');
    lockScroll();
    setTimeout(function () { var c = $('#menuClose'); if (c) { c.focus(); } }, 60);
  }

  function closeMenu(skipFocus) {
    if (!menu || !menu.classList.contains('is-open')) { return; }
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Abrir menú');
    unlockScroll();
    if (!skipFocus && menuOpener) { menuOpener.focus(); }
  }

  function initHeader() {
    var header = $('#header');
    if (!header) { return; }

    // Sentinela: evita escuchar el scroll de la ventana
    var sentinel = d.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:56px;pointer-events:none;';
    body.insertBefore(sentinel, body.firstChild);
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }).observe(sentinel);

    // Enlace activo según la sección visible
    var links = $$('.nav__links a');
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        links.forEach(function (a) { a.classList.remove('is-active'); });
        if (map[en.target.id]) { map[en.target.id].classList.add('is-active'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var s = d.getElementById(id); if (s) { spy.observe(s); } });

    if (burger) { burger.addEventListener('click', function () { return menu.classList.contains('is-open') ? closeMenu() : openMenu(); }); }
    var close = $('#menuClose');
    if (close) { close.addEventListener('click', function () { closeMenu(); }); }
  }

  /* Barra de progreso de lectura */
  function initProgress() {
    var bar = $('#progress');
    if (!bar || !hasGSAP || reduce) { return; }
    gsap.to(bar, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.2 } });
  }

  /* ======================================================================
     7. HERO: PARALLAX DEL ESCENARIO + BURBUJAS (canvas)
     ====================================================================== */
  var pointer = { x: -999, y: -999 };

  function initHeroParallax() {
    var hero = $('#inicio');
    var stage = $('#stage');
    if (!hero || !stage || !finePointer || reduce) { return; }
    var raf = null;
    var next = { x: 0, y: 0 };

    function apply() {
      stage.style.setProperty('--px', next.x.toFixed(3));
      stage.style.setProperty('--py', next.y.toFixed(3));
      raf = null;
    }
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      next.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      next.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      if (!raf) { raf = requestAnimationFrame(apply); }
    }, { passive: true });
    hero.addEventListener('pointerleave', function () {
      next.x = 0; next.y = 0; pointer.x = -999; pointer.y = -999;
      if (!raf) { raf = requestAnimationFrame(apply); }
    });
  }

  function initBubbles() {
    var canvas = $('#bubbles');
    if (!canvas || reduce || !canvas.getContext) { return; }
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, bubbles = [], raf = null, visible = true;

    function make(initial) {
      var r = 4 + Math.random() * 22;
      return {
        x: Math.random() * W,
        y: initial ? Math.random() * H : H + r + Math.random() * 120,
        r: r,
        vy: 0.22 + Math.random() * 0.55 + (26 - r) * 0.012,
        ph: Math.random() * Math.PI * 2,
        a: 0.35 + Math.random() * 0.5
      };
    }

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(Math.min(34, Math.max(14, W / 46)));
      while (bubbles.length < count) { bubbles.push(make(true)); }
      bubbles.length = count;
    }

    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        b.y -= b.vy;
        b.x += Math.sin(t * 0.0009 + b.ph) * 0.28;

        var dx = b.x - pointer.x, dy = b.y - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 0.1) {
          var push = (120 - dist) * 0.06;
          b.x += (dx / dist) * push;
          b.y += (dy / dist) * push;
        }
        if (b.y < -b.r * 2) { bubbles[i] = make(false); continue; }

        var g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * b.a) + ')');
        g.addColorStop(1, 'rgba(127,160,255,' + (0.14 * b.a) + ')');
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(31,77,255,' + (0.22 * b.a) + ')';
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!raf && visible && !d.hidden) { raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    resize();
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 160); });
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { start(); } else { stop(); }
    }).observe(canvas.parentElement);
    d.addEventListener('visibilitychange', function () { if (d.hidden) { stop(); } else { start(); } });
    start();
  }

  /* ======================================================================
     8. REVELADO AL SCROLL + CONTADORES
     ====================================================================== */
  function initReveals() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal]').forEach(function (el) { io.observe(el); });
  }

  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) { return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        io.unobserve(en.target);
        var el = en.target;
        var target = parseInt(el.getAttribute('data-count'), 10) || 0;
        if (reduce) { el.textContent = target; return; }
        var t0 = performance.now();
        var dur = 1700;
        (function step(now) {
          var p = Math.min((now - t0) / dur, 1);
          var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
          el.textContent = Math.round(target * eased);
          if (p < 1) { requestAnimationFrame(step); }
        })(t0);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { el.textContent = '0'; io.observe(el); });
  }

  /* ======================================================================
     9. LA IMAGEN SE ABRE A PANTALLA COMPLETA
     Sticky (CSS) + clip-path animado con GSAP ScrollTrigger (scrub).
     ====================================================================== */
  function initExpand() {
    var sec = $('#reveal');
    if (!sec || !hasGSAP || reduce) { return; }

    var media = $('.reveal__media', sec);
    var img = $('img', media);
    var words = $$('.reveal__pre span', sec);
    var scrim = $('.reveal__scrim', sec);
    var fin = $('.reveal__final', sec);

    gsap.matchMedia().add({ desktop: '(min-width: 768px)', mobile: '(max-width: 767px)' }, function (ctx) {
      var desktop = ctx.conditions.desktop;
      sec.classList.add('is-pinned');

      // El recorte se interpola a mano: Chrome normaliza las cadenas de clip-path y
      // GSAP las empareja mal si tienen distinta cantidad de valores.
      var from = desktop ? { y: 24, x: 30, r: 28 } : { y: 30, x: 9, r: 24 };
      var prog = { v: 0 };
      function paintClip() {
        var k = 1 - prog.v;
        var vy = (from.y * k).toFixed(2) + '%';
        var vx = (from.x * k).toFixed(2) + '%';
        media.style.clipPath = 'inset(' + vy + ' ' + vx + ' ' + vy + ' ' + vx + ' round ' + (from.r * k).toFixed(1) + 'px)';
      }
      paintClip();
      if (img) { gsap.set(img, { scale: 1.3 }); }
      gsap.set(scrim, { opacity: 0 });
      gsap.set(fin, { opacity: 0, y: 40 });

      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: sec,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: function (self) { sec.classList.toggle('is-open', self.progress > 0.82); }
        }
      });

      tl.to(words[0], { xPercent: desktop ? -80 : 0, yPercent: desktop ? 0 : -60, opacity: 0, duration: 0.5 }, 0)
        .to(words[1], { xPercent: desktop ? 80 : 0, yPercent: desktop ? 0 : 60, opacity: 0, duration: 0.5 }, 0)
        .to(prog, { v: 1, duration: 0.72, onUpdate: paintClip }, 0.04)
        .to(scrim, { opacity: 1, duration: 0.3 }, 0.52);
      if (img) { tl.to(img, { scale: 1, duration: 0.95 }, 0); }
      tl.to(fin, { opacity: 1, y: 0, duration: 0.28 }, 0.72);

      return function () {
        sec.classList.remove('is-pinned', 'is-open');
        media.style.clipPath = '';
        gsap.set([img, scrim, fin].concat(words), { clearProps: 'all' });
      };
    });
  }

  /* ======================================================================
     10. PROCESO EN SCROLL HORIZONTAL FIJADO
     En pantallas < 900px queda como pila vertical normal.
     ====================================================================== */
  function initProcess() {
    var sec = $('#proceso');
    if (!sec || !hasGSAP || reduce) { return; }
    var pin = $('#processPin');
    var track = $('#processTrack');
    var fill = $('#processFill');
    if (!pin || !track) { return; }

    gsap.matchMedia().add('(min-width: 900px)', function () {
      sec.classList.add('is-pinned');

      var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };

      gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          start: 'top top',
          end: function () { return '+=' + distance(); },
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) { if (fill) { fill.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')'; } }
        }
      });

      return function () {
        sec.classList.remove('is-pinned');
        if (fill) { fill.style.transform = ''; }
      };
    });
  }

  /* ======================================================================
     11. CATÁLOGO: FILTROS, FALLAS, SOLICITUD Y DRAWER
     ====================================================================== */
  var grid = $('#catalogGrid');
  var items = grid ? $$('.item', grid) : [];
  var tabs = $$('.filter');
  var cart = []; // [{ el, name, icon, faults:[] }]

  function applyFilter(filter) {
    if (!grid) { return; }
    tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-filter') === filter)); });

    var shown = 0;
    items.forEach(function (it) {
      var match = filter === 'all' || it.getAttribute('data-cat') === filter;
      it.hidden = !match;
      if (match) {
        it.classList.add('is-in');
        if (!reduce && it.animate) {
          it.animate(
            [{ opacity: 0, transform: 'translateY(20px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
            { duration: 560, delay: shown * 60, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }
          );
        }
        shown += 1;
      }
    });
    refreshScroll();
  }

  function initFilters() {
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { applyFilter(tab.getAttribute('data-filter')); });
      tab.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) { return; }
        e.preventDefault();
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus();
        applyFilter(next.getAttribute('data-filter'));
      });
    });
  }

  function findLine(el) {
    for (var i = 0; i < cart.length; i += 1) { if (cart[i].el === el) { return cart[i]; } }
    return null;
  }

  function setAddState(el, on) {
    var btn = $('.add', el);
    var label = $('span', btn);
    var icon = $('i', btn);
    btn.setAttribute('aria-pressed', String(on));
    label.textContent = on ? 'Agregado a mi solicitud' : 'Agregar a mi solicitud';
    icon.className = on ? 'ph ph-check' : 'ph ph-plus';
    el.classList.toggle('is-selected', on);
  }

  function addToCart(el) {
    if (findLine(el)) { return; }
    cart.push({ el: el, name: el.getAttribute('data-name'), icon: el.getAttribute('data-icon') || 'ph-wrench', faults: [] });
    setAddState(el, true);
  }

  function removeFromCart(el) {
    cart = cart.filter(function (l) { return l.el !== el; });
    setAddState(el, false);
    $$('.fault', el).forEach(function (f) { f.setAttribute('aria-pressed', 'false'); });
  }

  function syncFaults(el) {
    var line = findLine(el);
    if (!line) { return; }
    line.faults = $$('.fault[aria-pressed="true"]', el).map(function (f) { return f.textContent.trim(); });
  }

  function renderCart() {
    var count = cart.length;
    var pill = $('#cartPill');
    $('#cartCount').textContent = count;
    pill.classList.toggle('is-visible', count > 0 && !$('#drawer').classList.contains('is-open'));
    pill.classList.remove('is-bump');
    void pill.offsetWidth;
    if (count) { pill.classList.add('is-bump'); }

    var list = $('#cartList');
    list.textContent = '';
    cart.forEach(function (line, i) {
      var row = d.createElement('div');
      row.className = 'line';
      row.innerHTML =
        '<i class="ph-fill ' + line.icon + '" aria-hidden="true"></i>' +
        '<div class="line__txt"><strong></strong><span></span></div>' +
        '<button class="line__rm" type="button" aria-label="Quitar de mi solicitud"><i class="ph ph-trash" aria-hidden="true"></i></button>';
      $('strong', row).textContent = line.name;
      $('span', row).textContent = line.faults.length ? line.faults.join(', ') : 'Sin falla específica seleccionada';
      $('.line__rm', row).addEventListener('click', function () {
        removeFromCart(line.el);
        renderCart();
      });
      list.appendChild(row);
    });

    $('#cartEmpty').style.display = count ? 'none' : 'grid';
    $('#cartForm').style.display = count ? 'grid' : 'none';
    $('#cartSend').disabled = !count;
  }

  function initCatalog() {
    if (!grid) { return; }
    initFilters();

    grid.addEventListener('click', function (e) {
      var fault = e.target.closest('.fault');
      var add = e.target.closest('.add');
      var item = e.target.closest('.item');
      if (!item) { return; }

      if (fault) {
        var on = fault.getAttribute('aria-pressed') !== 'true';
        fault.setAttribute('aria-pressed', String(on));
        if (on) { addToCart(item); }
        syncFaults(item);
        renderCart();
      } else if (add) {
        if (findLine(item)) { removeFromCart(item); } else { addToCart(item); syncFaults(item); }
        renderCart();
      }
    });

    renderCart();
    initDrawer();
  }

  /* Drawer "Mi solicitud" */
  var drawer = $('#drawer');
  var drawerOpener = null;

  function openDrawer() {
    if (!drawer) { return; }
    drawerOpener = d.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    $('#cartPill').classList.remove('is-visible');
    lockScroll();
    setTimeout(function () {
      var first = cart.length ? $('#c-nombre') : $('.drawer__x');
      if (first) { first.focus(); }
    }, 80);
  }

  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) { return; }
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    unlockScroll();
    renderCart();
    if (drawerOpener) { drawerOpener.focus(); }
  }

  function initDrawer() {
    $('#cartPill').addEventListener('click', openDrawer);
    $$('[data-close]', drawer).forEach(function (el) { el.addEventListener('click', closeDrawer); });
    drawer.addEventListener('keydown', function (e) { trapFocus(drawer, e); });

    var form = $('#cartForm');
    initFieldValidation(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!cart.length) { toast('Agrega al menos un equipo a tu solicitud.'); return; }
      if (!validate(form)) { return; }

      var lines = cart.map(function (l, i) {
        return (i + 1) + '. ' + l.name + (l.faults.length ? ' (' + l.faults.join(', ') + ')' : '');
      });
      var msg = 'Hola, quiero solicitar servicio técnico en CDMX.\n\n' +
        'Nombre: ' + $('#c-nombre').value.trim() + '\n' +
        'Zona: ' + $('#c-zona').value.trim() + '\n\n' +
        'Equipos:\n' + lines.join('\n');
      var extra = $('#c-msg').value.trim();
      if (extra) { msg += '\n\nComentarios: ' + extra; }

      openWhatsApp(msg);
      toast('Abriendo WhatsApp con tu solicitud...');
    });
  }

  /* ======================================================================
     12. CARRUSEL DE OPINIONES (scroll-snap + flechas + arrastre con mouse)
     ====================================================================== */
  function initReviews() {
    var track = $('#revTrack');
    if (!track) { return; }
    var prev = $('#revPrev');
    var next = $('#revNext');

    function step() {
      var card = $('.review', track);
      return card ? card.getBoundingClientRect().width + 16 : 320;
    }
    function updateArrows() {
      var max = track.scrollWidth - track.clientWidth - 4;
      if (prev) { prev.disabled = track.scrollLeft <= 4; }
      if (next) { next.disabled = track.scrollLeft >= max; }
    }
    if (prev) { prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); }); }
    if (next) { next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); }); }
    track.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    updateArrows();

    // Arrastre con mouse (en táctil se usa el scroll nativo)
    var down = false, startX = 0, startLeft = 0, moved = false;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') { return; }
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) { return; }
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) { moved = true; track.classList.add('is-drag'); }
      if (moved) { track.scrollLeft = startLeft - dx; }
    });
    window.addEventListener('pointerup', function () {
      if (!down) { return; }
      down = false;
      track.classList.remove('is-drag');
    });
  }

  /* ======================================================================
     13. FAQ, FORMULARIO DE CONTACTO Y BOTÓN FLOTANTE
     ====================================================================== */
  function initFaq() {
    var acc = $('#acc');
    if (!acc) { return; }
    var all = $$('.acc__item', acc);
    acc.addEventListener('click', function (e) {
      var q = e.target.closest('.acc__q');
      if (!q) { return; }
      var item = q.closest('.acc__item');
      var open = !item.classList.contains('is-open');
      all.forEach(function (it) {
        var isThis = it === item;
        var state = isThis ? open : false;
        it.classList.toggle('is-open', state);
        $('.acc__q', it).setAttribute('aria-expanded', String(state));
      });
    });
  }

  /* Validación sencilla con mensajes en línea */
  function initFieldValidation(form) {
    $$('.field', form).forEach(function (field) {
      var input = $('input, select, textarea', field);
      var err = $('.field__error', field);
      if (input && err) {
        err.id = input.id + '-err';
        err.setAttribute('role', 'alert');
      }
      if (input) {
        var clear = function () {
          field.classList.remove('has-error');
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
        };
        input.addEventListener('input', clear);
        input.addEventListener('change', clear);
      }
    });
  }

  function validate(form) {
    var firstBad = null;
    $$('.field', form).forEach(function (field) {
      var input = $('input, select, textarea', field);
      if (!input) { return; }
      var value = (input.value || '').trim();
      var bad = false;
      if (input.required && !value) { bad = true; }
      if (input.type === 'tel' && value && !/^[\d\s()+-]{8,}$/.test(value)) { bad = true; }
      field.classList.toggle('has-error', bad);
      if (bad) {
        input.setAttribute('aria-invalid', 'true');
        var err = $('.field__error', field);
        if (err) { input.setAttribute('aria-describedby', err.id); }
        if (!firstBad) { firstBad = input; }
      }
    });
    if (firstBad) { firstBad.focus(); return false; }
    return true;
  }

  function initContactForm() {
    var form = $('#contactForm');
    if (!form) { return; }
    initFieldValidation(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form)) { return; }

      var tel = $('#f-tel').value.trim();
      var detail = $('#f-msg').value.trim();
      var msg = 'Hola, necesito servicio técnico para mi equipo Samsung.\n\n' +
        'Nombre: ' + $('#f-nombre').value.trim() + '\n' +
        (tel ? 'Teléfono: ' + tel + '\n' : '') +
        'Equipo: ' + $('#f-equipo').value + '\n' +
        'Zona: ' + $('#f-zona').value.trim() +
        (detail ? '\nFalla: ' + detail : '');

      openWhatsApp(msg);
      toast('Abriendo WhatsApp con tu mensaje...');
      form.reset();
    });
  }

  function initFloatWhatsApp() {
    var box = $('#waFloat');
    if (!box) { return; }
    setTimeout(function () {
      if (drawer && drawer.classList.contains('is-open')) { return; }
      box.classList.add('is-tip');
      setTimeout(function () { box.classList.remove('is-tip'); }, 6500);
    }, 6000);
  }

  /* ======================================================================
     14. MICRO-INTERACCIONES
     ====================================================================== */
  function initMagnetic() {
    if (!finePointer || reduce) { return; }
    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1) + 'px');
        el.style.setProperty('--my', ((e.clientY - (r.top + r.height / 2)) * 0.32).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      });
    });
  }

  function initSpotlight() {
    if (!finePointer) { return; }
    d.addEventListener('pointermove', function (e) {
      var card = e.target.closest ? e.target.closest('.spot') : null;
      if (!card) { return; }
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ======================================================================
     ARRANQUE
     ====================================================================== */
  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (drawer && drawer.classList.contains('is-open')) { closeDrawer(); return; }
      if (menu && menu.classList.contains('is-open')) { closeMenu(); }
    }
    if (menu && menu.classList.contains('is-open')) { trapFocus(menu, e); }
  }

  function afterLoad() {
    // Efectos que miden el layout: se inician con fuentes e imágenes listas
    initReveals();
    initCounters();
    initExpand();
    initProcess();
    initProgress();
    if (hasGSAP) { ScrollTrigger.refresh(); }

    clearTimeout(window.__bf);
    root.classList.add('is-loaded');
    body.classList.remove('is-locked');
    if (lenis && lockCount === 0) { lenis.start(); }

    initFloatWhatsApp();

    if (window.location.hash && window.location.hash.length > 1) {
      var t = d.getElementById(window.location.hash.slice(1));
      if (t) { setTimeout(function () { scrollToTarget(t, true); }, 80); }
    }
    // Segunda pasada por si alguna fuente o imagen cambió alturas
    setTimeout(refreshScroll, 1200);
  }

  function init() {
    hydrateWhatsApp();
    initSplit();
    initSmoothScroll();
    initAnchors();
    initHeader();
    initHeroParallax();
    initBubbles();
    initCatalog();
    initReviews();
    initFaq();
    initContactForm();
    initMagnetic();
    initSpotlight();
    d.addEventListener('keydown', onKeydown);

    if (!hasGSAP) { root.classList.add('no-gsap'); }

    body.classList.add('is-locked');
    runLoader(afterLoad);
  }

  init();
})();
