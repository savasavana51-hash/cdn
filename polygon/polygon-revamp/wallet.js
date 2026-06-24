// Code for wallet screen sequence: intro → second → third with popup, looping back to intro on confirm
(function () {
  // Code for wallet UI animation sequence: intro → login → third screen → popup → loop
  const introWrap = document.querySelector(".mobile-intro-wrap");
  const secondScreen = document.querySelector(".mobile-second-screen");
  const thirdScreen = document.querySelector(".mobile-third-screen");
  const walletEmail = document.querySelector(".wallet-email");
  const walletPass = document.querySelector(".wallet-pass");
  const walletBtn = document.querySelector(".wallet-btn:not(.mt-12)");
  const walletBtn2 = document.querySelector(".wallet-btn.mt-12");
  const walletThirdPopup = document.querySelector(".wallet-third-popup");
  const walletHeroBlur = document.querySelector(".wallet-hero-blur");
  const popupFirstScreen = document.querySelector(".wallet-popup-first-screen");
  const popupSecondScreen = document.querySelector(
    ".wallet-popup-second-screen"
  );
  const walletEarningImage = document.querySelector(".wallet-earning-image");
  const thirdScreenEarningImage = document.querySelector(
    ".third-screen-earning-image"
  );

  /* =====================================================================
   2. HELPERS
===================================================================== */
  function revealSecondScreenFields() {
    walletEmail.style.transition = "opacity 0.4s ease";
    walletEmail.style.opacity = "1";
    setTimeout(() => {
      walletPass.style.transition = "opacity 0.4s ease";
      walletPass.style.opacity = "1";
    }, 400);
    setTimeout(() => {
      if (walletBtn) {
        walletBtn.style.transition = "background-color 0.4s ease";
        walletBtn.style.backgroundColor = "#6700E5";
      }
    }, 1000);
  }

  /* =====================================================================
   3. INITIAL STATE
===================================================================== */
  walletEmail.style.opacity = "0";
  walletPass.style.opacity = "0";
  thirdScreen.style.opacity = "0";
  thirdScreen.style.display = "none";
  walletThirdPopup.style.transform = "translateY(100%)";
  walletHeroBlur.style.display = "none";
  popupSecondScreen.style.display = "none";
  popupSecondScreen.style.maxHeight = "0";
  popupSecondScreen.style.overflow = "hidden";
  popupSecondScreen.style.opacity = "0";
  if (walletEarningImage)
    walletEarningImage.style.transform = "translateX(100%)";
  if (thirdScreenEarningImage) thirdScreenEarningImage.style.opacity = "0";
  if (walletBtn) walletBtn.style.backgroundColor = "#CACACA";

  /* =====================================================================
   4. INTRO → SECOND SCREEN (auto, on load)
===================================================================== */
  setTimeout(() => {
    introWrap.style.transition = "opacity 0.4s ease";
    introWrap.style.opacity = "0";

    introWrap.addEventListener(
      "transitionend",
      () => {
        introWrap.style.display = "none";
        revealSecondScreenFields();
      },
      { once: true }
    );
  }, 1000);

  /* =====================================================================
   5. FIRST BUTTON → THIRD SCREEN + POPUP
===================================================================== */
  if (walletBtn) {
    walletBtn.addEventListener("click", () => {
      secondScreen.style.transition =
        "transform 0.7s ease-out, opacity 0.7s ease-out";
      secondScreen.style.transform = "translateX(-100%)";
      secondScreen.style.opacity = "0";

      thirdScreen.style.display = "flex";
      thirdScreen.style.transition = "opacity 0.4s ease";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          thirdScreen.style.opacity = "1";
        });
      });

      secondScreen.addEventListener(
        "transitionend",
        () => {
          secondScreen.style.display = "none";
        },
        { once: true }
      );

      setTimeout(() => {
        thirdScreen.style.transition = "transform 0.5s ease";
        thirdScreen.style.transform = "translateY(-40%)";

        thirdScreen.addEventListener(
          "transitionend",
          () => {
            walletHeroBlur.style.display = "block";
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                walletThirdPopup.style.transition = "transform 0.5s ease";
                walletThirdPopup.style.transform = "translateY(0%)";
              });
            });
          },
          { once: true }
        );
      }, 1000);
    });
  }

  /* =====================================================================
   6. SECOND BUTTON (.mt-12) → POPUP STEP 2 → CONFIRM → LOOP TO INTRO
===================================================================== */
  if (walletBtn2) {
    let isConfirmState = false;

    walletBtn2.addEventListener("click", () => {
      if (!isConfirmState) {
        popupFirstScreen.style.display = "none";

        popupSecondScreen.style.display = "flex";
        popupSecondScreen.style.transition =
          "max-height 0.3s ease, opacity 0.2s ease";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            popupSecondScreen.style.maxHeight = "500px";
            popupSecondScreen.style.opacity = "1";
          });
        });

        const btnChild = walletBtn2.querySelector("div");
        if (btnChild) btnChild.textContent = "Confirm";

        isConfirmState = true;
        return;
      }

      walletThirdPopup.style.transition = "transform 0.5s ease";
      walletThirdPopup.style.transform = "translateY(100%)";

      walletThirdPopup.addEventListener(
        "transitionend",
        () => {
          if (walletEarningImage) {
            walletEarningImage.style.transition = "transform 0.5s ease-out";
            walletEarningImage.style.transform = "translateX(0%)";
          }
          if (thirdScreenEarningImage) {
            thirdScreenEarningImage.style.transition = "opacity 0.5s ease-out";
            thirdScreenEarningImage.style.opacity = "1";
          }

          thirdScreen.style.transition = "transform 0.5s ease";
          thirdScreen.style.transform = "translateY(0%)";

          thirdScreen.addEventListener(
            "transitionend",
            () => {
              walletHeroBlur.style.display = "none";
              popupFirstScreen.style.display = "";
              popupSecondScreen.style.display = "none";
              popupSecondScreen.style.maxHeight = "0";
              popupSecondScreen.style.opacity = "0";
              isConfirmState = false;

              const btnChild = walletBtn2.querySelector("div");
              if (btnChild) btnChild.textContent = "Start Earning";

              setTimeout(() => {
                walletEmail.style.opacity = "0";
                walletPass.style.opacity = "0";
                walletThirdPopup.style.transform = "translateY(100%)";
                if (walletBtn) {
                  walletBtn.style.transition = "none";
                  walletBtn.style.backgroundColor = "#CACACA";
                }

                // Step 1: fade intro in over the still-visible third screen
                introWrap.style.transition = "none";
                introWrap.style.opacity = "0";
                introWrap.style.display = "flex";
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    introWrap.style.transition = "opacity 0.4s ease";
                    introWrap.style.opacity = "1";
                  });
                });

                // Step 2: once intro is fully visible, wait 200ms, prep second screen, then loop
                introWrap.addEventListener(
                  "transitionend",
                  () => {
                    setTimeout(() => {
                      // Prep second screen silently behind intro
                      secondScreen.style.transition = "none";
                      secondScreen.style.opacity = "1";
                      secondScreen.style.transform = "";
                      secondScreen.style.display = "flex";

                      // Reset earning images and hide third screen
                      if (walletEarningImage) {
                        walletEarningImage.style.transition = "none";
                        walletEarningImage.style.transform = "translateX(100%)";
                      }
                      if (thirdScreenEarningImage) {
                        thirdScreenEarningImage.style.transition = "none";
                        thirdScreenEarningImage.style.opacity = "0";
                      }
                      thirdScreen.style.opacity = "0";
                      thirdScreen.style.display = "none";
                      thirdScreen.style.transform = "";

                      // Wait 1s on intro, then fade out and reveal second screen
                      setTimeout(() => {
                        introWrap.style.transition = "opacity 0.4s ease";
                        introWrap.style.opacity = "0";

                        introWrap.addEventListener(
                          "transitionend",
                          () => {
                            introWrap.style.display = "none";
                            revealSecondScreenFields();
                          },
                          { once: true }
                        );
                      }, 1000);
                    }, 200);
                  },
                  { once: true }
                );
              }, 2000);
            },
            { once: true }
          );
        },
        { once: true }
      );
    });
  }

  /* =====================================================================
     7. BUTTON SHADOW PULSE (ripple via scaleX)
  ===================================================================== */

  // Code to ripple wallet button shadow once every 5s of user inactivity
  const buttons = document.querySelectorAll(".wallet-btn");

  buttons.forEach((btn) => {
    const ring = document.createElement("span");
    ring.className = "btn-ripple-ring";
    btn.appendChild(ring);

    const duration = 1500;
    let inactivityTimer = null;
    let animationFrame = null;

    const playOnce = () => {
      const startTime = performance.now();

      const animate = (timestamp) => {
        const progress = (timestamp - startTime) / duration;

        if (progress >= 1) {
          ring.style.opacity = 0;
          scheduleNext(); // wait another 5s then play again
          return;
        }

        const scale = 1 + progress * 5;
        const opacity = 1 - progress;

        ring.style.transform = `translate(-50%, -50%) scale(${scale})`;
        ring.style.opacity = opacity;

        animationFrame = requestAnimationFrame(animate);
      };

      animationFrame = requestAnimationFrame(animate);
    };

    const scheduleNext = () => {
      inactivityTimer = setTimeout(playOnce, 5000);
    };

    const onInteract = () => {
      clearTimeout(inactivityTimer);
      cancelAnimationFrame(animationFrame);
      ring.style.opacity = 0;
      scheduleNext(); // reset 5s countdown on interaction
    };

    btn.addEventListener("mouseenter", onInteract);
    btn.addEventListener("mouseleave", onInteract);
    btn.addEventListener("click", onInteract);

    // Start the first countdown
    scheduleNext();
  });

  /* =====================================================================
     8. FEATURES CARDS — DESKTOP (hover to switch image)
  ===================================================================== */
  document.addEventListener("DOMContentLoaded", function () {
    if (window.innerWidth > 479) {
      const cards = document.querySelectorAll(
        ".walles-features-left .wallets-features-card"
      );
      const images = document.querySelectorAll(".wallet-right-image-wrap img");

      function setActive(index) {
        cards.forEach((card, i) =>
          card.classList.toggle("is-active", i === index)
        );
        images.forEach((img, i) =>
          img.classList.toggle("is-active", i === index)
        );
      }

      cards.forEach((card, index) => {
        card.addEventListener("mouseenter", () => setActive(index));
      });

      setActive(0);
    }
  });

  /* =====================================================================
     9. FEATURES CARDS — MOBILE (swipe + dot pagination)
  ===================================================================== */
  document.addEventListener("DOMContentLoaded", function () {
    if (window.innerWidth < 478) {
      const grid = document.querySelector(".wallets-features-grid");
      const cards = document.querySelectorAll(
        ".walles-features-left .wallets-features-card"
      );
      const images = document.querySelectorAll(
        ".wallet-top-mobile-images .wallet-card-image"
      );
      const dots = document.querySelectorAll(".wallet-mobile-pagination");

      let current = 0;
      const total = cards.length;

      function setActive(index) {
        cards.forEach((el, i) => el.classList.toggle("is-active", i === index));
        images.forEach((el, i) =>
          el.classList.toggle("is-active", i === index)
        );
        dots.forEach((el, i) => el.classList.toggle("is-active", i === index));
        current = index;
      }

      function next() {
        if (current < total - 1) setActive(current + 1);
      }
      function prev() {
        if (current > 0) setActive(current - 1);
      }

      // Touch swipe detection
      let startX = 0,
        startY = 0;
      const threshold = 40;

      grid.addEventListener(
        "touchstart",
        (e) => {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        },
        { passive: true }
      );

      grid.addEventListener(
        "touchend",
        (e) => {
          const dx = e.changedTouches[0].clientX - startX;
          const dy = e.changedTouches[0].clientY - startY;
          if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) next();
            else prev();
          }
        },
        { passive: true }
      );

      // Tap a dot to jump
      dots.forEach((dot, i) =>
        dot.addEventListener("click", () => setActive(i))
      );

      setActive(0);
    }
  });
})();
