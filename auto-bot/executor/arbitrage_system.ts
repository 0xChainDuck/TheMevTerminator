import { ethers } from 'ethers';
import { Pool } from './pool';
import { SwapOperation, ArbitrageOpportunity, ArbitrageParams } from './types';
import { PendingBlockMonitor } from './pending_block_monitor';
import { TransactionExecutor } from './transaction_executor';
import { ArbitrageConfig } from './config';
export class ArbitrageSystem {
  private pools: Map<string, Pool> = new Map();
  private provider: ethers.Provider;
  private pairConfigurations: Map<string, string[]> = new Map();
  private pendingBlockMonitor: PendingBlockMonitor;
  private transactionExecutor: TransactionExecutor;

  constructor(
    provider: ethers.Provider,
    signer: ethers.Signer,
    pairConfigurations: ArbitrageConfig,
    userTransactionRouterAddress: string,
    transactionExecutorAddress: string
  ) {
    this.provider = provider;
    for (const pair of pairConfigurations.pairs) {
      this.pairConfigurations.set(pair.baseToken, pair.relatedPairs);
    }
    this.pendingBlockMonitor = new PendingBlockMonitor(userTransactionRouterAddress, provider);
    this.transactionExecutor = new TransactionExecutor(transactionExecutorAddress, signer);
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

  async checkAndExecuteArbitrage(): Promise<void> {
    const pendingOperations = await this.pendingBlockMonitor.getEarliestPendingOperations();
    
    if (pendingOperations === null) {
      console.log('No pending operations found');
      return;
    }

    console.log(`Found ${pendingOperations.length} pending operations`);
    const opportunities = await this.simulateSwapsAndFindArbitrageOpportunities(pendingOperations);
    
    if (opportunities.length > 0) {
      console.log(`Found ${opportunities.length} arbitrage opportunities`);
      // 这里可以添加执行套利的逻辑
      await this.executeArbitrageOpportunities(opportunities);
    } else {
      console.log('No arbitrage opportunities found');
    }
  }

  private async executeArbitrageOpportunities(opportunities: ArbitrageOpportunity[]): Promise<void> {
    const arbitrageParams: ArbitrageParams[][] = [];

    for (const opportunity of opportunities) {
      console.log(`Executing arbitrage: Buy ${opportunity.buyAmount} from ${opportunity.buyPool.address}, Sell ${opportunity.sellAmount} to ${opportunity.sellPool.address}, Profit: ${opportunity.profit}`);
      
      // Create ArbitrageParams for the buy operation
      const buyParams: ArbitrageParams = {
        dexId: opportunity.buyPool.dexId,
        tokenA: opportunity.buyPool.token1.address,
        tokenB: opportunity.buyPool.token0.address,
        amountIn: opportunity.buyAmount,
        amountOut: opportunity.buyAmountOutMin
      };

      // Create ArbitrageParams for the sell operation
      const sellParams: ArbitrageParams = {
        dexId: opportunity.sellPool.dexId,
        tokenA: opportunity.sellPool.token0.address,
        tokenB: opportunity.sellPool.token1.address,
        amountIn: opportunity.sellAmount,
        amountOut: opportunity.sellAmountOutMin
      };

      arbitrageParams.push([buyParams, sellParams]);
    }

    // Call the TransactionExecutor to execute the arbitrage
    try {
      const receipt = await this.transactionExecutor.executeArbitrage(arbitrageParams);
      console.log(`Arbitrage executed successfully in block ${receipt.blockNumber}`);
    } catch (error) {
      console.error('Failed to execute arbitrage:', error);
    }
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
    buyAmountOutMin: boughtAmount,
    sellAmount: boughtAmount,
    sellAmountOutMin: soldAmount,
    profit: soldAmount - deltaX
  };
}
  

