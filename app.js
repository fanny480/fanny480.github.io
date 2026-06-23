const API = {
  statistics: "./data/statistics.csv",
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
      "读取失败：没有读到 data/statistics.csv，或 CSV 字段无法解析。请确认 GitHub Actions 已解压生成 CSV。",
      true,
    );
    renderError(error);
  }
}

async function fetchStatistics() {
  try {
    return parseCsv(await fetchText(API.statistics));
  } catch (localError) {
    console.warn("Local CSV statistics file is unavailable.", localError);
    throw localError;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { accept: "text/csv,text/plain,*/*" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("HTTP " + response.status + ": " + url);
  }

  return response.text();
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
