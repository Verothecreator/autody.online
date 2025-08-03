const PAIR_ADDRESS = "0x50f7e4b8a5151996a32aa1f6da9856ffb2240dcd10b1afa72df3530b41f98cd3";
const GRAPH_URL = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2";

async function fetchPairDayData(pairAddress) {
  const query = `
    query ($pair: Bytes!) {
      pairDayDatas(first: 30, orderBy: date, orderDirection: asc, where: {pairAddress: $pair}) {
        date
        token0Price
        token1Price
      }
    }`;
  const response = await fetch(GRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { pair: pairAddress.toLowerCase() } }),
  });
  const { data } = await response.json();
  return data.pairDayDatas;
}

async function renderChart() {
  const data = await fetchPairDayData(PAIR_ADDRESS);
  if (!data || data.length === 0) return;

  const labels = data.map(d => new Date(d.date * 1000).toLocaleDateString());
  const prices = data.map(d => parseFloat(d.token0Price));

  const ctx = document.getElementById("autodyChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Autody Price (Token0 in ETH)",
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
  renderChart().catch(console.error);
});
