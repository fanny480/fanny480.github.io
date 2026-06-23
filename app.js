const API = {
  statistics: "./data/statistics.json",
  liveStatistics: "https://mooncakes.io/api/v0/modules/statistics?raw=true",
  user: (username) => "https://mooncakes.io/api/v0/user/" + encodeURIComponent(username),
};

const state = {
  contributors: [],
  profiles: {},
};

const elements = {
  status: document.querySelector("#status"),
  refreshButton: document.querySelector("#refreshButton"),
  searchInput: document.querySelector("#searchInput"),
  metricPackages: document.querySelector("#metricPackages"),
  metricContributors: document.querySelector("#metricContributors"),
  metricFirstTimers: document.querySelector("#metricFirstTimers"),
  metricProfileCoverage: document.querySelector("#metricProfileCoverage"),
  weeklyChart: document.querySelector("#weeklyChart"),
  contributorsTable: document.querySelector("#contributorsTable"),
};

elements.refreshButton.addEventListener("click", () => loadDashboard({ force: true }));
elements.searchInput.addEventListener("input", renderContributorsTable);

loadDashboard();

async function loadDashboard({ force = false } = {}) {
  setStatus(force ? "正在刷新 Mooncakes 数据……" : "正在读取 Mooncakes 数据……");

  try {
    const [rawStatistics, profiles] = await Promise.all([
      fetchStatistics(),
      fetchProfiles(),
    ]);

    const packages = normalizePackages(rawStatistics);
    state.profiles = profiles;
    state.contributors = buildContributors(packages, profiles);

    renderMetrics(packages, state.contributors, profiles);
    renderWeeklyChart(state.contributors, packages);
    renderContributorsTable();

    setStatus("已读取 " + packages.length.toLocaleString() + " 条包记录，解析出 " + state.contributors.length.toLocaleString() + " 位贡献者。");
  } catch (error) {
    console.error(error);
    setStatus(
      "读取失败：可能是 API 暂时不可用，或浏览器阻止了跨域请求。你可以下载接口 JSON 后在 app.js 中改成本地文件路径。",
      true,
    );
    renderError(error);
  }
}

async function fetchStatistics() {
  try {
    return await fetchJson(API.statistics);
  } catch (localError) {
    console.warn("Local statistics file is unavailable, trying live API.", localError);
    return fetchJson(API.liveStatistics);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("HTTP " + response.status + ": " + url);
  }

  return response.json();
}

async function fetchProfiles() {
  try {
    const response = await fetch("./profiles.json", { cache: "no-store" });
    if (!response.ok) return {};
    return response.json();
  } catch {
    return {};
  }
}

function normalizePackages(input) {
  const records = findLikelyRecordArray(input);

  return records
    .map((record) => {
      const owner = pickString(record, [
        "owner",
        "username",
        "user",
        "author",
        "publisher",
        "created_by",
        "uploaded_by",
        "maintainer",
      ]);
      const name =
        pickString(record, ["name", "module", "package", "pkg", "id", "full_name"]) ||
        buildPackageName(record);
      const uploadedAt = pickDate(record, [
        "created_at",
        "createdAt",
        "upload_time",
        "uploaded_at",
        "uploadedAt",
        "publish_time",
        "published_at",
        "publishedAt",
        "time",
        "timestamp",
      ]);

      return {
        owner: normalizeOwner(owner),
        name: String(name || "unknown-package"),
        uploadedAt,
        raw: record,
      };
    })
    .filter((item) => item.owner && item.uploadedAt instanceof Date && !Number.isNaN(item.uploadedAt.valueOf()));
}

function findLikelyRecordArray(input) {
  if (Array.isArray(input)) return input;

  const candidates = [
    input?.modules,
    input?.packages,
    input?.data,
    input?.items,
    input?.statistics,
    input?.result,
    input?.results,
  ].filter(Array.isArray);

  if (candidates.length) {
    return candidates.sort((a, b) => b.length - a.length)[0];
  }

  const nested = Object.values(input || {}).find((value) => Array.isArray(value) && value.some(isObject));
  return nested || [];
}

function buildContributors(packages, profiles) {
  const byOwner = new Map();

  for (const pkg of packages) {
    const current = byOwner.get(pkg.owner);
    if (!current) {
      byOwner.set(pkg.owner, {
        username: pkg.owner,
        firstContributionAt: pkg.uploadedAt,
        firstPackage: pkg.name,
        packageCount: 1,
        latestContributionAt: pkg.uploadedAt,
        profile: profiles[pkg.owner] || {},
      });
      continue;
    }

    current.packageCount += 1;
    if (pkg.uploadedAt < current.firstContributionAt) {
      current.firstContributionAt = pkg.uploadedAt;
      current.firstPackage = pkg.name;
    }
    if (pkg.uploadedAt > current.latestContributionAt) {
      current.latestContributionAt = pkg.uploadedAt;
    }
  }

  return [...byOwner.values()].sort((a, b) => b.firstContributionAt - a.firstContributionAt);
}

function renderMetrics(packages, contributors, profiles) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const firstTimersThisWeek = contributors.filter((item) => item.firstContributionAt >= sevenDaysAgo);
  const profiledUsers = contributors.filter((item) => profiles[item.username]).length;

  elements.metricPackages.textContent = packages.length.toLocaleString();
  elements.metricContributors.textContent = contributors.length.toLocaleString();
  elements.metricFirstTimers.textContent = firstTimersThisWeek.length.toLocaleString();
  elements.metricProfileCoverage.textContent = contributors.length
    ? Math.round((profiledUsers / contributors.length) * 100) + "%"
    : "0%";
}

function renderWeeklyChart(contributors, packages) {
  const activeByWeek = groupCount(packages, (item) => weekKey(item.uploadedAt), (item) => item.owner);
  const firstByWeek = groupCount(contributors, (item) => weekKey(item.firstContributionAt), (item) => item.username);

  const weeks = [...new Set([...activeByWeek.keys(), ...firstByWeek.keys()])]
    .sort()
    .slice(-14);
  const max = Math.max(
    1,
    ...weeks.map((week) => Math.max(activeByWeek.get(week)?.size || 0, firstByWeek.get(week)?.size || 0)),
  );

  elements.weeklyChart.innerHTML = weeks
    .map((week) => {
      const first = firstByWeek.get(week)?.size || 0;
      const active = activeByWeek.get(week)?.size || 0;
      const width = Math.max(4, Math.round((first / max) * 100));
      const activeWidth = Math.max(4, Math.round((active / max) * 100));

      return [
        '<div class="bar-row">',
        "<span>" + escapeHtml(week) + "</span>",
        "<div>",
        '<div class="bar-track" title="首次贡献：' + first + '">',
        '<div class="bar" style="width: ' + width + '%"></div>',
        "</div>",
        '<div class="bar-track" title="活跃上传用户：' + active + '" style="margin-top: .28rem; opacity: .58">',
        '<div class="bar" style="width: ' + activeWidth + '%; background: linear-gradient(90deg, var(--accent-2), var(--accent-3))"></div>',
        "</div>",
        "</div>",
        "<span>" + first + " / " + active + "</span>",
        "</div>",
      ].join("");
    })
    .join("");
}

function renderContributorsTable() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const filtered = state.contributors.filter((item) => {
    const profile = item.profile || {};
    const haystack = [
      item.username,
      item.firstPackage,
      profile.occupation,
      profile.country,
      profile.note,
      ...(profile.links || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  elements.contributorsTable.innerHTML =
    filtered
      .slice(0, 120)
      .map((item) => {
        const profile = item.profile || {};
        const userUrl = API.user(item.username);

        return [
          "<tr>",
          "<td>",
          '<a class="user-link" href="' + userUrl + '" target="_blank" rel="noreferrer">' + escapeHtml(item.username) + "</a>",
          "<br />",
          '<span class="tag">' + item.packageCount + " packages</span>",
          "</td>",
          "<td>" + formatDate(item.firstContributionAt) + "</td>",
          "<td>" + escapeHtml(item.firstPackage) + "</td>",
          "<td>" + escapeHtml(profile.occupation || "待补充") + "</td>",
          "<td>" + escapeHtml(profile.country || "待补充") + "</td>",
          "<td>" + renderProfileNote(profile) + "</td>",
          "</tr>",
        ].join("");
      })
      .join("") || '<tr><td colspan="6">没有找到匹配的贡献者。</td></tr>';
}

function renderError(error) {
  elements.metricPackages.textContent = "—";
  elements.metricContributors.textContent = "—";
  elements.metricFirstTimers.textContent = "—";
  elements.metricProfileCoverage.textContent = "—";
  elements.weeklyChart.innerHTML = '<p class="status">无法生成图表：' + escapeHtml(error.message) + "</p>";
  elements.contributorsTable.innerHTML = '<tr><td colspan="6">无法读取数据：' + escapeHtml(error.message) + "</td></tr>";
}

function renderProfileNote(profile) {
  const links = Array.isArray(profile.links)
    ? profile.links
        .map((link) => '<a href="' + escapeAttribute(link) + '" target="_blank" rel="noreferrer">link</a>')
        .join(" · ")
    : "";
  return [escapeHtml(profile.note || ""), links].filter(Boolean).join("<br />") || "—";
}

function groupCount(items, groupKey, valueKey) {
  const map = new Map();
  for (const item of items) {
    const key = groupKey(item);
    const value = valueKey(item);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  }
  return map;
}

function weekKey(date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((copy - yearStart) / 86400000 + 1) / 7);
  return copy.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function pickString(record, keys) {
  for (const key of keys) {
    const value = deepGet(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isObject(value)) {
      const nested = pickString(value, ["name", "username", "login", "id"]);
      if (nested) return nested;
    }
  }
  return "";
}

function pickDate(record, keys) {
  for (const key of keys) {
    const value = deepGet(record, key);
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

function parseDate(value) {
  if (value == null || value === "") return null;
  const date = typeof value === "number" && value < 10000000000
    ? new Date(value * 1000)
    : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function deepGet(record, key) {
  if (!record || typeof record !== "object") return undefined;
  if (key in record) return record[key];

  const snake = key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
  if (snake in record) return record[snake];

  for (const value of Object.values(record)) {
    if (isObject(value) && key in value) return value[key];
  }

  return undefined;
}

function buildPackageName(record) {
  const owner = pickString(record, ["owner", "username", "user"]);
  const module = pickString(record, ["module_name", "moduleName", "package_name", "packageName"]);
  const version = pickString(record, ["version"]);
  return [owner && module ? owner + "/" + module : module, version && "@" + version]
    .filter(Boolean)
    .join("");
}

function normalizeOwner(owner) {
  if (!owner) return "";
  return String(owner).replace(/^@/, "").trim();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#be123c" : "";
}
