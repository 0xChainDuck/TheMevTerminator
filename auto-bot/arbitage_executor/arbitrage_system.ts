import { ethers } from 'ethers';
import { Pool } from './pool';
import { SwapOperation, ArbitrageOpportunity } from './types';

class ArbitrageSystem {
  private pools: Map<string, Pool> = new Map();
  private provider: ethers.Provider;
  private pairConfigurations: Map<string, string[]> = new Map();

  constructor(provider: ethers.Provider, pairConfigurations: Record<string, string[]>) {
    this.provider = provider;
    for (const [baseToken, relatedPairs] of Object.entries(pairConfigurations)) {
      this.pairConfigurations.set(baseToken, relatedPairs);
    }
  }

  async getOrCreatePool(address: string): Promise<Pool> {
    if (!this.pools.has(address)) {
      const pool = new Pool(address, this.provider);
      await pool.initialize();
      this.pools.set(address, pool);
    }
    return this.pools.get(address)!;
  }

  async syncPool(pool: Pool): Promise<void> {
    await pool.syncState();
  }

  async simulateSwapsAndFindArbitrageOpportunities(operations: SwapOperation[]): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const affectedPools = new Set<string>();
    const allRelevantPools = new Set<string>();

    // 收集所有相关的池
    for (const op of operations) {
      allRelevantPools.add(op.pool);
      const pool = await this.getOrCreatePool(op.pool);
      const baseToken = pool.token0.address;
      const relatedPairs = this.pairConfigurations.get(baseToken) || [];
      relatedPairs.forEach(pair => allRelevantPools.add(pair));
    }

    // 同步所有相关池的状态
    for (const poolAddress of allRelevantPools) {
      const pool = await this.getOrCreatePool(poolAddress);
      await this.syncPool(pool);
    }

    // 重置所有池的模拟状态
    for (const pool of this.pools.values()) {
      pool.resetSimulation();
    }

    for (const op of operations) {
      const pool = await this.getOrCreatePool(op.pool);
      
      let amountOut: bigint;
      let success = false;

      if (op.tokenIn === pool.token1.address) {
        // 买入操作：用 token1 换 token0
        amountOut = pool.calculateBuyAmount(op.amountIn);
        if (amountOut >= op.amountOutMin) {
          pool.simulateBuy(op.amountIn);
          success = true;
        }
      } else if (op.tokenIn === pool.token0.address) {
        // 卖出操作：用 token0 换 token1
        amountOut = pool.calculateSellAmount(op.amountIn);
        if (amountOut >= op.amountOutMin) {
          pool.simulateSell(op.amountIn);
          success = true;
        }
      } else {
        console.log(`Invalid token for pool ${op.pool}`);
        continue;
      }

      if (!success) {
        console.log(`Swap operation failed: insufficient output`);
        continue;
      }

      affectedPools.add(op.pool);
    }

    // 在所有操作完成后计算套利机会并返回
    for (const affectedPoolAddress of affectedPools) {
      const affectedPool = this.pools.get(affectedPoolAddress)!;
      const baseToken = affectedPool.token0.address;
      const relatedPairs = this.pairConfigurations.get(baseToken) || [];

      for (const relatedPairAddress of relatedPairs) {
        if (relatedPairAddress === affectedPoolAddress) continue;

        const relatedPool = await this.getOrCreatePool(relatedPairAddress);
        const arbitrage = calculateOptimalArbitrage(affectedPool, relatedPool);

        if (arbitrage.profit > 0n) {
          opportunities.push(arbitrage);
        }
      }
    }

    return opportunities;
  }
}

// 套利计算函数（从之前的示例中复制）
function calculateOptimalArbitrage(pool1: Pool, pool2: Pool): ArbitrageOpportunity {
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
      profit: soldAmount - deltaX
    };
  }
  

// 使用示例
async function main() {
  const provider = new ethers.JsonRpcProvider("YOUR_RPC_URL");

  const pairConfigurations = {
    "0xTokenA": ["0xPool1", "0xPool2", "0xPool3"],
    "0xTokenB": ["0xPool2", "0xPool4", "0xPool5"],
    // ... 其他配置
  };

  const arbitrageSystem = new ArbitrageSystem(provider, pairConfigurations);

  const swapOperations: SwapOperation[] = [
    {
      tokenIn: "0xTokenA",
      tokenOut: "0xTokenB",
      amountIn: BigInt(1000000),
      amountOutMin: BigInt(990000),
      pool: "0xPool1"
    },
    {
      tokenIn: "0xTokenB",
      tokenOut: "0xTokenC",
      amountIn: BigInt(500000),
      amountOutMin: BigInt(495000),
      pool: "0xPool1"
    },
    // ... 其他操作
  ];

  const opportunities = await arbitrageSystem.simulateSwapsAndFindArbitrageOpportunities(swapOperations);

  console.log("Arbitrage opportunities:");
  opportunities.forEach((op, index) => {
    console.log(`Opportunity ${index + 1}:`);
    console.log(`  Buy ${op.buyAmount} from ${op.buyPool.address}`);
    console.log(`  Sell ${op.sellAmount} to ${op.sellPool.address}`);
    console.log(`  Profit: ${op.profit}`);
  });
}

main().catch(console.error);
