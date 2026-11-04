(() => {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("season");
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentDay = new Date(
    currentYear,
    today.getMonth(),
    today.getDate(),
  );

  function getEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  const easterSunday = getEasterSunday(currentYear);
  const easterStart = new Date(currentYear, easterSunday.getMonth(), easterSunday.getDate() - 6);
  const easterEnd = new Date(currentYear, easterSunday.getMonth(), easterSunday.getDate() + 7);
  const isEasterSeason = currentDay >= easterStart && currentDay <= easterEnd;
  const carnivalStart = new Date(currentYear, easterSunday.getMonth(), easterSunday.getDate() - 52);
  const carnivalEnd = new Date(currentYear, easterSunday.getMonth(), easterSunday.getDate() - 47);
  const isCarnivalSeason = currentDay >= carnivalStart && currentDay <= carnivalEnd;
  const isChristmasSeason =
    today.getMonth() === 11 && today.getDate() >= 1 && today.getDate() <= 27;
  const isNewYearSeason =
    (today.getMonth() === 11 && today.getDate() === 31) ||
    (today.getMonth() === 0 && today.getDate() <= 6);
  const isHalloweenSeason =
    (today.getMonth() === 9 && today.getDate() >= 30) ||
    (today.getMonth() === 10 && today.getDate() <= 6);
  const activeSeason =
    override === "off"
      ? null
      : override === "xmas" || override === "easter" || override === "newyear" || override === "halloween"
        ? override
        : override === "karneval" || override === "carnival"
          ? "karneval"
        : isChristmasSeason
          ? "xmas"
          : isEasterSeason
            ? "easter"
            : isCarnivalSeason
              ? "karneval"
            : isNewYearSeason
              ? "newyear"
              : isHalloweenSeason
                ? "halloween"
              : null;

  if (!activeSeason) return;

  document.documentElement.classList.add(`${activeSeason}-season`);

  const tabBar = document.querySelector(".tab-bar");
  if (tabBar) {
    const scene = document.createElement("span");
    scene.className = `${activeSeason}-scene`;
    scene.setAttribute("aria-hidden", "true");

    if (activeSeason === "xmas") {
      for (const [className, emoji] of [
        ["seasonal-gift", "🎁"],
        ["seasonal-tree", "🎄"],
        ["seasonal-gift", "🎁"],
      ]) {
        const decoration = document.createElement("span");
        decoration.className = className;
        decoration.textContent = emoji;
        scene.appendChild(decoration);
      }
    } else if (activeSeason === "easter") {
      scene.innerHTML = `
        <svg viewBox="0 0 120 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="easter-bunny-fur" x1="0" y1="0" x2="0.8" y2="1">
              <stop stop-color="#fffdf7" />
              <stop offset="1" stop-color="#e9dfcf" />
            </linearGradient>
            <linearGradient id="easter-egg-lilac" x1="0" y1="0" x2="1" y2="1">
              <stop stop-color="#f6dfff" />
              <stop offset="1" stop-color="#c69bdd" />
            </linearGradient>
            <linearGradient id="easter-egg-peach" x1="0" y1="0" x2="1" y2="1">
              <stop stop-color="#fff0c7" />
              <stop offset="1" stop-color="#f3b87f" />
            </linearGradient>
          </defs>
          <g stroke="#8e6a54" stroke-opacity=".22" stroke-width=".8" stroke-linejoin="round">
            <path d="M21 44C12 37 12 29 16 23c2-3 4-4 6-4s4 1 6 4c4 6 4 14-7 21Z" fill="url(#easter-egg-lilac)"/>
            <path d="M99 44c-9-7-9-15-5-21 2-3 4-4 6-4s4 1 6 4c4 6 4 14-7 21Z" fill="url(#easter-egg-peach)"/>
          </g>
          <path d="m15 32 3-2 3 2 3-2 3 2m-10 5 3-2 3 2 3-2 2 1" fill="none" stroke="#fff8ff" stroke-width="1.5" stroke-linecap="round"/>
          <path d="m94 32 3-2 3 2 3-2 3 2m-10 5 3-2 3 2 3-2 2 1" fill="none" stroke="#fff8df" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="16" cy="26" r="1" fill="#fff" fill-opacity=".8"/>
          <circle cx="104" cy="25" r="1" fill="#fff" fill-opacity=".8"/>
          <g stroke="#b9a991" stroke-width=".7" stroke-linejoin="round">
            <ellipse cx="59" cy="37" rx="13" ry="7" fill="url(#easter-bunny-fur)"/>
            <circle cx="73" cy="34" r="3.2" fill="#fffdf7"/>
            <ellipse cx="53" cy="42" rx="5" ry="2.4" fill="#fffaf0"/>
            <ellipse cx="66" cy="42" rx="5" ry="2.4" fill="#fffaf0"/>
          </g>
          <g class="easter-graze-head" stroke="#b9a991" stroke-width=".7" stroke-linejoin="round">
            <ellipse cx="55" cy="20" rx="2.8" ry="8.5" transform="rotate(-24 55 20)" fill="url(#easter-bunny-fur)"/>
            <ellipse cx="61" cy="19" rx="2.6" ry="8" transform="rotate(-8 61 19)" fill="url(#easter-bunny-fur)"/>
            <ellipse cx="55" cy="20" rx="1.1" ry="5.5" transform="rotate(-24 55 20)" fill="#edb5bc" stroke="none"/>
            <ellipse cx="61" cy="19" rx="1" ry="5" transform="rotate(-8 61 19)" fill="#edb5bc" stroke="none"/>
            <circle cx="50" cy="29" r="7.5" fill="url(#easter-bunny-fur)"/>
            <ellipse cx="43.5" cy="32" rx="3.5" ry="2.5" fill="#fffaf0"/>
            <ellipse cx="47.5" cy="27.5" rx=".9" ry="1.2" fill="#53473f" stroke="none"/>
            <ellipse cx="46" cy="31" rx="1.3" ry=".7" fill="#efb8b7" fill-opacity=".8" stroke="none"/>
            <path d="m39.5 30.5 1.6 1.1 1.6-1.1c0 1.8-3.2 1.8-3.2 0Z" fill="#c98286" stroke="none"/>
            <path d="M41 32c-2 .2-3 .8-4 1.5m4-1c-2 .8-2.6 1.5-3.2 2.2" fill="none" stroke="#80665b" stroke-width=".55" stroke-linecap="round"/>
          </g>
        </svg>`;
    } else if (activeSeason === "karneval") {
      scene.innerHTML = `
        <svg viewBox="0 0 104 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="m13 19 2.2-4.2 2.2 4.2 4.6.7-3.4 3.1.8 4.5-4.2-2.2-4.1 2.2.8-4.5-3.4-3.1Z" fill="#f1c553"/>
          <circle cx="86" cy="13" r="2" fill="#e95870"/>
          <circle cx="91" cy="23" r="1.4" fill="#49b8a3"/>
          <path d="m25 12-3-3m57 4 3-4" stroke="#8562c8" stroke-width="2" stroke-linecap="round"/>
          <path d="M27 28C30 19 24 13 26 7c6 1 11 7 14 14C39 10 44 4 52 3c8 1 13 7 12 18 3-7 8-13 14-14 2 6-4 12-1 21Z" fill="#5e438b" stroke="#392b55" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M27 28C30 19 24 13 26 7c6 1 11 7 14 14l3 7Z" fill="#e95870"/>
          <path d="M43 28C39 10 44 4 52 3c8 1 13 7 9 25Z" fill="#f1c553"/>
          <path d="M61 28C64 20 69 9 78 7c2 6-5 14-1 21Z" fill="#49b8a3"/>
          <path d="M27 26Q52 31 78 26l-1 5Q52 36 28 31Z" fill="#f8d782" stroke="#a87927" stroke-width=".7"/>
          <circle cx="26" cy="7" r="2.4" fill="#f8d782" stroke="#a87927" stroke-width=".7"/>
          <circle cx="52" cy="3" r="2.6" fill="#fff1bd" stroke="#a87927" stroke-width=".7"/>
          <circle cx="78" cy="7" r="2.4" fill="#f8d782" stroke="#a87927" stroke-width=".7"/>
          <path d="M39 14 43 17m18-3-4 3" stroke="#fff3cc" stroke-width="1.2" stroke-linecap="round"/>
        </svg>`;
    } else if (activeSeason === "halloween") {
      scene.innerHTML = `
        <svg viewBox="0 0 250 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="39" cy="22" r="19" fill="#f6a94a" fill-opacity=".09"/>
          <circle cx="39" cy="22" r="13" fill="#ffd88c"/>
          <circle cx="45" cy="17" r="11" fill="#17201b"/>
          <path d="M8 59Q35 49 60 58T111 57T162 58T216 56T250 59v5H8Z" fill="#23202d"/>
          <path d="M25 60V48q0-6 6-6t6 6v12Z" fill="#3b3543" stroke="#71657a" stroke-width=".8"/>
          <path d="M31 43v17m-5-8h10" stroke="#93839b" stroke-width="1" opacity=".7"/>
          <path d="M91 62V31l17-12 16 11V23l18-14 20 15v38Z" fill="#30273b" stroke="#59475d" stroke-width="1" stroke-linejoin="round"/>
          <path d="m86 33 22-18 18 15 16-25 25 18-5 6-20-14-16 25-18-15-17 14Z" fill="#50405e" stroke="#68536e" stroke-width="1" stroke-linejoin="round"/>
          <path d="M139 13V5h7v9" fill="#393044" stroke="#59475d" stroke-width="1"/>
          <path d="M101 36h9v11h-9Zm37 0h9v11h-9Z" fill="#ffc96f"/>
          <path d="M105.5 36v11m-4.5-5.5h9m32-5.5v11m-4.5-5.5h9" stroke="#57414d" stroke-width="1"/>
          <path d="M121 62V48q0-8 8-8t8 8v14Z" fill="#201d2a" stroke="#5d4c63" stroke-width=".8"/>
          <circle cx="134" cy="53" r="1" fill="#f2bd62"/>
          <path d="m55 20 5-5 5 5-5-2Zm137 3 6-6 6 6-6-2Zm25-11 3-3 3 3-3-1Z" fill="#17151e"/>
          <g class="halloween-ghost">
            <path d="M63 50V35c0-8 4-13 10-13s10 5 10 13v15c-3-3-5-3-7 0-2-3-5-3-7 0-2-2-4-2-6 0Z" fill="#f7f2e8" stroke="#d8d0c5" stroke-width=".8" stroke-linejoin="round"/>
            <ellipse cx="69" cy="35" rx="1.2" ry="1.7" fill="#302b35"/>
            <ellipse cx="77" cy="35" rx="1.2" ry="1.7" fill="#302b35"/>
            <ellipse cx="73" cy="40" rx="1.3" ry="1.7" fill="#514353"/>
          </g>
          <g class="halloween-pumpkin">
            <path d="M77 48c-2-3-1-5 2-7 3 2 3 4 2 7" fill="#78934a" stroke="#526a35" stroke-width=".8"/>
            <path d="M65 55c0-6 4-10 10-10s10 4 10 10c0 5-4 8-10 8s-10-3-10-8Z" fill="#ed8735" stroke="#a95524" stroke-width=".8"/>
            <path d="M75 46c-3 4-3 12 0 16m-5-15c-3 4-3 10 0 13m10-13c3 4 3 10 0 13" fill="none" stroke="#ffb454" stroke-width=".8" opacity=".8"/>
            <path d="m69 53 4 1-2 4Zm9 0-4 1 2 4Zm-8 8 4-2 4 2-2 1h-4Z" fill="#513246"/>
          </g>
          <g class="halloween-pumpkin small-pumpkin">
            <path d="M184 53c-1-2 0-4 2-5 2 1 2 3 1 5" fill="#78934a"/>
            <path d="M175 58c0-5 3-8 8-8s8 3 8 8c0 4-3 6-8 6s-8-2-8-6Z" fill="#d97331" stroke="#a95524" stroke-width=".7"/>
            <path d="m180 56 3 1-2 3Zm7 0-3 1 2 3Z" fill="#513246"/>
          </g>
          <path d="M48 61q5-5 9 0m111 0q5-6 10 0m37-1q4-5 8 0" fill="none" stroke="#78804a" stroke-width="1.4" stroke-linecap="round"/>
          <path d="m54 38 1.2 2.4 2.7.4-2 1.8.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.8 2.7-.4Z" fill="#f3c56c"/>
          <circle cx="204" cy="38" r="1.3" fill="#f3c56c"/>
        </svg>`;
    } else {
      for (let index = 0; index < 3; index += 1) {
        const launcher = document.createElement("span");
        launcher.className = "newyear-launcher";
        launcher.innerHTML = `
          <svg viewBox="0 0 12 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 1C3.5 4.3 3 7 3 12h6c0-5-.5-7.7-3-11Z" fill="currentColor"/>
            <path d="M3.3 8.8.8 13h2.6m5.3-4.2 2.5 4.2H8.6" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>
            <circle cx="6" cy="7" r="1.1" fill="#fff5d6"/>
            <path d="M4.5 12c-.3 2.6.4 4.6 1.5 7 1.1-2.4 1.8-4.4 1.5-7Z" fill="#ffc45c"/>
          </svg>`;
        scene.appendChild(launcher);
      }
    }

    document.body.appendChild(scene);
    const positionScene = () => {
      const tabBarRect = tabBar.getBoundingClientRect();
      if (activeSeason === "newyear") scene.style.width = `${tabBarRect.width}px`;
      scene.style.left = `${tabBarRect.left + (tabBarRect.width - scene.offsetWidth) / 2}px`;
      scene.style.top = `${tabBarRect.top - scene.offsetHeight + 1}px`;
    };
    positionScene();
    window.addEventListener("resize", positionScene, { passive: true });
    window.visualViewport?.addEventListener("resize", positionScene, { passive: true });
    window.visualViewport?.addEventListener("scroll", positionScene, { passive: true });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (activeSeason === "karneval") {
    if (!reduceMotion) startCarnivalCandyToss();
    return;
  }

  if (activeSeason === "halloween") {
    if (!reduceMotion) startHalloweenBats();
    return;
  }

  if (activeSeason === "newyear") {
    if (!reduceMotion) startNewYearFireworks();
    return;
  }

  // Christmas alone uses falling snow; other seasons are static decorations.
  if (activeSeason !== "xmas" || reduceMotion) return;

  function startHalloweenBats() {
    let timer = null;
    let direction = 1;
    let firstFlight = true;
    const random = (min, max) => Math.random() * (max - min) + min;

    function flyBat() {
      const screenWidth = window.visualViewport?.width || window.innerWidth;
      const screenHeight = window.visualViewport?.height || window.innerHeight;
      const travel = screenWidth + 100;
      const signedTravel = travel * direction;
      const rise = -random(24, 68);
      const dip = random(8, 36);
      const batWidth = random(54, 64);
      const bat = document.createElement("span");
      bat.className = "halloween-flying-bat";
      bat.setAttribute("aria-hidden", "true");
      bat.style.left = direction > 0 ? "-50px" : `${screenWidth + 50}px`;
      bat.style.top = `${random(screenHeight * 0.12, screenHeight * 0.5)}px`;
      bat.style.width = `${batWidth}px`;
      bat.style.setProperty(
        "--bat-entry",
        direction > 0 ? "60px" : `${-batWidth - 60}px`,
      );
      bat.style.setProperty("--bat-quarter", `${signedTravel * 0.25}px`);
      bat.style.setProperty("--bat-half", `${signedTravel * 0.5}px`);
      bat.style.setProperty("--bat-three-quarter", `${signedTravel * 0.75}px`);
      bat.style.setProperty("--bat-travel", `${signedTravel}px`);
      bat.style.setProperty("--bat-rise", `${rise}px`);
      bat.style.setProperty("--bat-dip", `${dip}px`);
      bat.style.animationDuration = `${random(7600, 10600)}ms`;
      if (direction < 0) bat.classList.add("reverse");
      bat.innerHTML = `
        <svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg">
          <g class="halloween-bat-wing halloween-bat-wing-left">
            <path d="M20 11C15 5 11 3 4 4L7 9 2 11 8 13 4 17 11 16 16 20 20 15Z" fill="#bea8e4" stroke="#352943" stroke-width=".9" stroke-linejoin="round"/>
          </g>
          <g class="halloween-bat-wing halloween-bat-wing-right">
            <path d="M20 11C25 5 29 3 36 4L33 9 38 11 32 13 36 17 29 16 24 20 20 15Z" fill="#bea8e4" stroke="#352943" stroke-width=".9" stroke-linejoin="round"/>
          </g>
          <ellipse cx="20" cy="13" rx="2.8" ry="5.7" fill="#f0e8fb" stroke="#352943" stroke-width=".7"/>
          <circle cx="19" cy="11" r=".7" fill="#f4b05b"/>
          <circle cx="21" cy="11" r=".7" fill="#f4b05b"/>
        </svg>`;
      document.body.appendChild(bat);
      window.setTimeout(() => bat.remove(), parseFloat(bat.style.animationDuration) + 150);
      direction *= -1;
    }

    function scheduleNextBat() {
      if (document.hidden || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        flyBat();
        firstFlight = false;
        scheduleNextBat();
      }, firstFlight ? random(1200, 2100) : random(4800, 6900));
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = null;
      } else {
        scheduleNextBat();
      }
    });

    scheduleNextBat();
  }

  function startCarnivalCandyToss() {
    const colors = ["#ef7180", "#e9b94f", "#55bda7", "#a281d0"];
    let timer = null;
    const random = (min, max) => Math.random() * (max - min) + min;

    function tossCandy() {
      const scene = document.querySelector(".karneval-scene");
      if (!scene) return;
      const sceneRect = scene.getBoundingClientRect();
      const originX = sceneRect.left + sceneRect.width / 2;
      const originY = sceneRect.top + sceneRect.height * 0.72;

      for (let index = 0; index < 2; index += 1) {
        const candy = document.createElement("span");
        candy.className = "karneval-candy";
        candy.setAttribute("aria-hidden", "true");
        candy.innerHTML = `
          <svg viewBox="0 0 34 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M10 6 2 2 4 9 1 17 12 13 22 13 33 17 30 9 32 2 23 6Z" fill="#fff8e8"/>
            <path d="M9 10c0-4 3-6 8-6s8 2 8 6-3 6-8 6-8-2-8-6Z" fill="currentColor" stroke="#fff8e8" stroke-width=".8"/>
            <path d="m13 6-3 8m8-10-4 12m9-10-3 8" stroke="#fff8e8" stroke-opacity=".82" stroke-width="1.5"/>
          </svg>`;

        const offsetX =
          index === 0
            ? random(-window.innerWidth * 0.34, -window.innerWidth * 0.08)
            : random(window.innerWidth * 0.08, window.innerWidth * 0.34);
        const targetY = random(-window.innerHeight * 0.08, -window.innerHeight * 0.16);
        const arcHeight = random(105, 175);
        const spin = random(-330, 330);
        const duration = random(1450, 1900);
        candy.style.left = `${originX - 17}px`;
        candy.style.top = `${originY - 10}px`;
        candy.style.color = colors[Math.floor(random(0, colors.length))];
        candy.style.setProperty("--throw-x", `${offsetX}px`);
        candy.style.setProperty("--throw-y", `${targetY}px`);
        candy.style.setProperty("--mid-x", `${offsetX * 0.45}px`);
        candy.style.setProperty("--mid-y", `${targetY * 0.45 - arcHeight}px`);
        candy.style.setProperty("--late-x", `${offsetX * 0.8}px`);
        candy.style.setProperty("--late-y", `${targetY * 0.8 - arcHeight * 0.55}px`);
        candy.style.setProperty("--mid-spin", `${spin * 0.45}deg`);
        candy.style.setProperty("--late-spin", `${spin * 0.8}deg`);
        candy.style.setProperty("--throw-spin", `${spin}deg`);
        candy.style.animationDuration = `${duration}ms`;
        document.body.appendChild(candy);
        window.setTimeout(() => candy.remove(), duration + 100);
      }
    }

    function scheduleNextToss() {
      if (document.hidden || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        tossCandy();
        scheduleNextToss();
      }, random(2400, 3600));
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = null;
      } else {
        scheduleNextToss();
      }
    });

    window.setTimeout(tossCandy, 700);
    scheduleNextToss();
  }

  function startNewYearFireworks() {
    const colors = ["#ffd166", "#ff7096", "#69d9ef", "#b99aff", "#8ce6a1", "#fff4da"];
    let launcherIndex = 0;
    let timer = null;
    const random = (min, max) => Math.random() * (max - min) + min;

    function createBurst(x, y) {
      const burst = document.createElement("span");
      burst.className = "newyear-firework-burst";
      burst.setAttribute("aria-hidden", "true");
      burst.style.left = `${x}px`;
      burst.style.top = `${y}px`;
      const burstColor = colors[Math.floor(random(0, colors.length))];
      burst.style.setProperty("--burst-color", burstColor);

      const sparkCount = 26;
      for (let index = 0; index < sparkCount; index += 1) {
        const angle = (index / sparkCount) * Math.PI * 2 + random(-0.08, 0.08);
        const distance = random(52, 96);
        const spark = document.createElement("span");
        spark.className = "newyear-firework-spark";
        spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
        spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance + 8}px`);
        spark.style.setProperty("--spark-angle", `${angle + Math.PI / 2}rad`);
        spark.style.setProperty(
          "--spark-color",
          index % 7 === 0 ? "#fff9e8" : index % 3 === 0 ? "#ffd166" : burstColor,
        );
        spark.style.animationDelay = `${random(0, 35)}ms`;
        burst.appendChild(spark);
      }

      document.body.appendChild(burst);
      window.setTimeout(() => burst.remove(), 1100);
    }

    function launchRocket() {
      const launchers = document.querySelectorAll(".newyear-launcher");
      const launcher = launchers[launcherIndex % Math.max(launchers.length, 1)];
      launcherIndex += 1;
      const launcherRect = launcher?.getBoundingClientRect();
      const originX = launcherRect ? launcherRect.left + launcherRect.width / 2 : window.innerWidth / 2;
      const originY = launcherRect ? launcherRect.top + 2 : window.innerHeight - 88;
      const targetX = Math.max(
        window.innerWidth * 0.12,
        Math.min(window.innerWidth * 0.88, originX + random(-window.innerWidth * 0.18, window.innerWidth * 0.18)),
      );
      const targetY = random(window.innerHeight * 0.12, window.innerHeight * 0.38);
      const rocket = document.createElement("span");
      rocket.className = "newyear-rocket-flight";
      rocket.setAttribute("aria-hidden", "true");
      rocket.style.left = `${originX}px`;
      rocket.style.top = `${originY - 16}px`;
      rocket.style.color = colors[Math.floor(random(0, colors.length))];
      rocket.style.setProperty("--flight-x", `${targetX - originX}px`);
      rocket.style.setProperty("--flight-y", `${targetY - originY}px`);
      rocket.style.animationDuration = `${random(680, 880)}ms`;
      rocket.addEventListener(
        "animationend",
        () => {
          createBurst(targetX, targetY);
          rocket.remove();
        },
        { once: true },
      );
      document.body.appendChild(rocket);
    }

    function scheduleNextRocket() {
      if (document.hidden || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        launchRocket();
        scheduleNextRocket();
      }, random(1150, 1650));
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = null;
      } else {
        scheduleNextRocket();
      }
    });

    launchRocket();
    scheduleNextRocket();
  }

  const canvas = document.createElement("canvas");
  canvas.id = "seasonal-effects-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }

  let width = 0;
  let height = 0;
  let flakes = [];
  const random = (min, max) => Math.random() * (max - min) + min;

  function resizeCanvas() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const count = Math.min(65, Math.max(22, Math.round((width * height) / 25000)));
    flakes = Array.from({ length: count }, () => ({
      x: random(0, width),
      y: random(0, height),
      size: random(3.5, 7),
      speed: random(0.45, 1.35),
      drift: random(-0.35, 0.35),
      phase: random(0, Math.PI * 2),
      rotation: random(0, Math.PI * 2),
      rotationSpeed: random(-0.006, 0.006),
      opacity: random(0.35, 0.85),
    }));
  }

  function drawSnowflake(flake) {
    context.save();
    context.translate(flake.x, flake.y);
    context.rotate(flake.rotation);
    context.strokeStyle = `rgba(245, 250, 255, ${flake.opacity})`;
    context.lineWidth = Math.max(0.8, flake.size * 0.12);
    context.lineCap = "round";

    for (let arm = 0; arm < 6; arm += 1) {
      const angle = (arm * Math.PI) / 3;
      const endX = Math.cos(angle) * flake.size;
      const endY = Math.sin(angle) * flake.size;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(endX, endY);

      for (const branchPoint of [0.58, 0.8]) {
        const baseX = Math.cos(angle) * flake.size * branchPoint;
        const baseY = Math.sin(angle) * flake.size * branchPoint;
        const branchLength = flake.size * 0.28;
        for (const side of [-1, 1]) {
          const branchAngle = angle + side * (Math.PI / 4);
          context.moveTo(baseX, baseY);
          context.lineTo(
            baseX + Math.cos(branchAngle) * branchLength,
            baseY + Math.sin(branchAngle) * branchLength,
          );
        }
      }

      context.stroke();
    }
    context.restore();
  }

  function drawSnowfall() {
    context.clearRect(0, 0, width, height);
    for (const flake of flakes) {
      flake.phase += 0.012;
      flake.x += flake.drift + Math.sin(flake.phase) * 0.25;
      flake.y += flake.speed;

      flake.rotation += flake.rotationSpeed;
      if (flake.y > height + flake.size) {
        flake.y = -flake.size;
        flake.x = random(0, width);
      }
      if (flake.x < -flake.size) flake.x = width + flake.size;
      if (flake.x > width + flake.size) flake.x = -flake.size;

      drawSnowflake(flake);
    }

    if (!document.hidden) window.requestAnimationFrame(drawSnowfall);
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) window.requestAnimationFrame(drawSnowfall);
  });
  window.requestAnimationFrame(drawSnowfall);
})();
