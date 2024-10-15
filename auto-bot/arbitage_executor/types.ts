import { Pool } from './pool';

export interface SwapOperation {
  tokenIn: string;     // 输入代币的地址
  tokenOut: string;    // 输出代币的地址
  amountIn: bigint;    // 输入数量
  amountOutMin: bigint; // 最小输出数量
  pool: string;        // 交易对（池子）的地址
}

export interface ArbitrageOpportunity {
  buyPool: Pool;       // 买入操作的池子
  sellPool: Pool;      // 卖出操作的池子
  buyAmount: bigint;   // 买入数量
  sellAmount: bigint;  // 卖出数量
  profit: bigint;      // 预期利润
}

// 如果需要，您可以添加更多的类型定义
export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  fee: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

// Add this interface to your types.ts file or in this file
interface ArbitrageParams {
    dexId: number;
    tokenA: string;
    tokenB: string;
    amountIn: bigint;
    amountOut: bigint;
  }