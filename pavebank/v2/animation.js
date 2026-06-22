// =========================================================================
// ANIMATIONS.JS
// =========================================================================

window.addEventListener('load', () => {

  // ── Typewriter ────────────────────────────────────────────────────────────

  function startTypewriter() {
    const el = document.querySelector('.heading_rotate');
    if (!el) return;
    const words = ['Institutional', 'Corporate', 'Agentic', 'Infrastructure'];
    let current = 0;
    const typeDelay   = 80;
    const deleteDelay = 50;
    const pauseDelay  = 2000;

    function deleteText(cb) {
      const text = el.textContent;
      if (!text.length) { cb(); return; }
      el.textContent = text.slice(0, -1);
      setTimeout(() => deleteText(cb), deleteDelay);
    }

    function typeText(word, cb) {
      el.textContent = '';
      let i = 0;
      function next() {
        if (i >= word.length) { cb(); return; }
        el.textContent += word[i++];
        setTimeout(next, typeDelay);
      }
      next();
    }

    function loop() {
      setTimeout(() => {
        deleteText(() => {
          current = (current + 1) % words.length;
          typeText(words[current], loop);
        });
      }, pauseDelay);
    }

    loop();
  }

  startTypewriter();

  // ── Globe scroll animation ────────────────────────────────────────────────
  // Trigger: bottom of .pn-hero hits 100% viewport → 0% viewport
  // Effect: globe moves from bottom-crop to canvas centre, shrinks to 9.4rem diameter
  // Also: scroll velocity increases rotation speed

  const BASE_SPEED = 0.005;

  // Set initial state for overlays
  gsap.set('.cr-blocks.top, .cr-blocks.bottom', { scaleY: 0 });
  gsap.set('.cr-blocks.left, .cr-blocks.right', { scaleX: 0 });

  ScrollTrigger.create({
    trigger: '.pn-hero',
    start:   'bottom 100%',
    end:     'bottom 0%',
    scrub:   true,
    onUpdate: (self) => {
      grid1.globeScrollProgress = self.progress;
      grid1.GLOBE_SPEED = BASE_SPEED + Math.abs(self.getVelocity()) / 1000 * 0.06;

      const p = self.progress;
      gsap.set('.cr-blocks.top, .cr-blocks.bottom', { scaleY: p });
      gsap.set('.cr-blocks.left, .cr-blocks.right', { scaleX: p });
    },
    onLeave:     () => { grid1.GLOBE_SPEED = BASE_SPEED; },
    onLeaveBack: () => { grid1.GLOBE_SPEED = BASE_SPEED; },
  });

  // ── Phase 1: Globe outro — disintegration ─────────────────────────────────
  // Trigger: top of .globe-outro hits 100% viewport → 50% viewport
  // Effect: globe pixels scatter / disintegrate and fade out (scrubbed).
  // Scrubbing back up reassembles the globe automatically.

  ScrollTrigger.create({
    trigger: '.globe-outro',
    start:   'top 100%',
    end:     'top 50%',
    scrub:   true,
    onUpdate: (self) => {
      grid1.outroProgress = self.progress;
    },
    onLeave:     () => { grid1.outroProgress = 1; },
    onLeaveBack: () => { grid1.outroProgress = 0; },
  });

  // ── Phase 2: Bank accounts — dollar reveal + currency flips ────────────────
  // Trigger: top of .pn-product-scroll.bankaccount hits 100% → 0% viewport
  // Effect (scrubbed via grid1.bankProgress 0→1):
  //   reveal $ → hold → flip $→€ → hold → flip €→¥
  // Entirely scrub-driven, no ticker. Reverses on scroll-up.

  ScrollTrigger.create({
    trigger: '.pn-product-scroll.bankaccount',
    start:   'top 100%',
    end:     'top 0%',
    scrub:   true,
    onUpdate: (self) => {
      grid1.bankProgress = self.progress;
    },
    onLeave:     () => { grid1.bankProgress = 1; },
    onLeaveBack: () => { grid1.bankProgress = 0; },
  });

  // ── Phase 2 (content): product content fade-in from bottom ─────────────────
  // Plays alongside the dollar growing. Subtle rise + fade, scrubbed.
  // Adjust start/end offsets to taste.

  const baContent = document.querySelector('.product-content._1');

  if (baContent) {
    gsap.set(baContent, { opacity: 0, y: '0.2rem' });

    gsap.timeline({
      scrollTrigger: {
        trigger: '.pn-product-scroll.bankaccount',
        start:   'top 80%',   // ← change offset here
        end:     'top 55%',    // ← and here (window for the fade)
        scrub:   true,
      }
    })
    .to(baContent, {
      opacity: 1,
      y:       '0rem',
      ease:    'none',
    }, 0);
  }

  // ── Product scroller — heading words + nav items ──────────────────────────

  const heading2 = document.querySelector('.pn-heading-2');
  const navItems = gsap.utils.toArray('.pn-nav-wrapper .pn-product-nav');
  const graphicDot = gsap.utils.toArray('.pn-graphics .pn-graphics-dot');

  if (heading2) {
    const split = SplitText.create(heading2, { type: 'words' });
    gsap.set(split.words, { opacity: 0, y: '10%' });
    gsap.set(navItems, { opacity: 0 });
    gsap.set(graphicDot, { opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.pn-product-scroller',
        start:   'top bottom',
        end:     'top 50%',
        scrub:   true,
      }
    });

    // First 50% of scroll: heading words stagger in
    tl.to(graphicDot, {
      opacity: 0,
      ease:    'none',
    }, 0)
    .to(split.words, {
      opacity: 1,
      y:       '0%',
      stagger: 0.2,
      ease:    'none',
    }, "<")
    .to(navItems, {
      opacity: 1,
      stagger: 0.1,
      ease:    'none',
    }, '<+=50%');

  }

  // ── Product nav active-state sync ──────────────────────────────────────────
  // Each .pn-product-scroll maps by index to a .pn-product-nav-wrapper.
  // When a section is the one in view, its nav wrapper gets .active (others lose it).

  const productScrolls = gsap.utils.toArray('.pn-product-scroll');
  const navWrappers    = gsap.utils.toArray('.pn-product-nav-wrapper');

  function setActiveNav(index) {
    navWrappers.forEach((nav, i) => {
      nav.classList.toggle('active', i === index);
    });
  }

  productScrolls.forEach((section, i) => {
    ScrollTrigger.create({
      trigger: section,
      start:   'top bottom',
      end:     'bottom bottom',
      onEnter:     () => setActiveNav(i),
      onEnterBack: () => setActiveNav(i),
      onLeaveBack: () => {
        // Scrolled back up above this section — clear its active state.
        if (navWrappers[i]) navWrappers[i].classList.remove('active');
      },
    });
  });

  // ── Scroll progress tracker ───────────────────────────────────────────────

  gsap.set('.scroll-progress-thumb', { scaleX: 0 });

  ScrollTrigger.create({
    trigger:  document.body,
    start:    'top top',
    end:      'bottom bottom',
    onUpdate: (self) => {
      const p = self.progress;
      gsap.set('.scroll-progress-thumb', { scaleX: p });
      document.querySelector('.scroll-percentage').textContent = Math.round(p * 100) + '%';
    },
  });

});
