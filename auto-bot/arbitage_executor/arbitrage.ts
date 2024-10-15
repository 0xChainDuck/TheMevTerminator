import { Pool } from 'arbitage_executor/pool';
import { ethers } from 'ethers';

interface ArbitrageResult {
  buyPool: Pool;
  sellPool: Pool;
  buyAmount: bigint;
  sellAmount: bigint;
  profit: bigint;
  finalPrice1: number;
  finalPrice2: number;
}

function calculateOptimalArbitrage(pool1: Pool, pool2: Pool): ArbitrageResult {
  // 确保 pool1 是价格较低的池
  let lowPool = pool1;
  let highPool = pool2;
  if (pool1.calculatePrice() > pool2.calculatePrice()) {
    lowPool = pool2;
    highPool = pool1;
  }

  const x1 = lowPool.reserves.reserve0;
  const y1 = lowPool.reserves.reserve1;
  const x2 = highPool.reserves.reserve0;
  const y2 = highPool.reserves.reserve1;

  // 计算最优套利量
  const ratio = Number(y1) * Number(x2) / (Number(y2) * Number(x1));
  const sqrtTerm = Math.sqrt(Number(x1) * Number(x2) * (ratio + 1) ** 2);
  const deltaX = BigInt(Math.floor((sqrtTerm - Number(x1)) / (ratio + 1)));

  // 模拟套利操作
  lowPool.resetSimulation();
  highPool.resetSimulation();
  const boughtAmount = lowPool.simulateBuy(deltaX);
  const soldAmount = highPool.simulateSell(boughtAmount);

  return {
    buyPool: lowPool,
    sellPool: highPool,
    buyAmount: deltaX,
    sellAmount: boughtAmount,
    profit: soldAmount - deltaX,
    finalPrice1: lowPool.calculatePrice(true),
    finalPrice2: highPool.calculatePrice(true)
  };
}

// 使用示例
async function main() {
  const provider = new ethers.JsonRpcProvider("YOUR_RPC_URL");
  const poolAddress1 = "0x123..."; // 替换为实际的池地址
  const poolAddress2 = "0x456..."; // 替换为实际的池地址

  const pool1 = new Pool(poolAddress1, provider);
  const pool2 = new Pool(poolAddress2, provider);

  await pool1.initialize();
  await pool2.initialize();
  await pool1.syncState();
  await pool2.syncState();

  console.log(`Initial price of pool1: ${pool1.calculatePrice()}`);
  console.log(`Initial price of pool2: ${pool2.calculatePrice()}`);

  const result = calculateOptimalArbitrage(pool1, pool2);

  console.log(`Optimal arbitrage:`);
  console.log(`Buy ${result.buyAmount} tokens from ${result.buyPool.address}`);
  console.log(`Sell ${result.sellAmount} tokens to ${result.sellPool.address}`);
  console.log(`Profit: ${result.profit}`);
  console.log(`Final price of buy pool: ${result.finalPrice1}`);
  console.log(`Final price of sell pool: ${result.finalPrice2}`);
}

main().catch(console.error);
