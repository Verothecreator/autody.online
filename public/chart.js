const PAIR = "0x50f7e4b8a5151996a32aa1f6da9856ffb2240dcd10b1afa72df3530b41f98cd3";
const GRAPH_URL = "https://api.thegraph.com/subgraphs/id/AdA6Ax3jtct69NnXfxNjWtPTe9gMtSEZx2TQcT4VHu";

async function fetchPairDayData(pair) {
  const query = `
    query ($pair: Bytes!) {
      pairDayDatas(first: 30, orderBy: date, orderDirection: asc, where: { pair: $pair }) {
        date
        token0Price
      }
    }`;
  const response = await fetch(GRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { pair: pair.toLowerCase() } })
  });
  const result = await response.json();
  return result.data?.pairDayDatas || [];
}

async function renderAutodyChart() {
  const data = await fetchPairDayData(PAIR);
  console.log("Fetched data:", data);
  if (!data.length) return;

  const labels = data.map(d => new Date(d.date * 1000).toLocaleDateString());
  const prices = data.map(d => parseFloat(d.token0Price));

  const ctx = document.getElementById("autodyChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Autody Price (in ETH)",
        data: prices,
        borderColor: "#5d5fef",
        backgroundColor: "rgba(93,95,239,0.3)",
        fill: true,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: "#ccc" } },
        y: { ticks: { color: "#ccc" } }
      },
      plugins: {
        legend: { labels: { color: "#ccc" } }
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderAutodyChart().catch(err => console.error("Chart error:", err));
});
