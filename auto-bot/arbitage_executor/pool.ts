import { ethers } from 'ethers';

// 通用的 ERC20 ABI，用于获取代币信息
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

// 通用的 Pair ABI，适用于大多数 DEX
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function factory() view returns (address)",
  "function fee() view returns (uint24)"  // 注意：不是所有的池都有这个方法
];

class Pool {
  private provider: ethers.Provider;
  private pairContract: ethers.Contract;
  private token0Contract: ethers.Contract;
  private token1Contract: ethers.Contract;

  public address: string;
  public factory: string;
  public dexName: string;
  public token0: { address: string; symbol: string; decimals: number };
  public token1: { address: string; symbol: string; decimals: number };
  public reserves: { reserve0: bigint; reserve1: bigint };
  public fee: number;
  private simulatedReserves: { reserve0: bigint; reserve1: bigint };

  constructor(address: string, provider: ethers.Provider) {
    this.address = address;
    this.provider = provider;
    this.pairContract = new ethers.Contract(address, PAIR_ABI, provider);
    
    // 初始化其他成员
    this.factory = '';
    this.dexName = '';
    this.token0 = { address: '', symbol: '', decimals: 0 };
    this.token1 = { address: '', symbol: '', decimals: 0 };
    this.reserves = { reserve0: 0n, reserve1: 0n };
    this.fee = 0;
    this.simulatedReserves = { reserve0: 0n, reserve1: 0n };

    // token 合约将在 initialize 方法中设置
    this.token0Contract = {} as ethers.Contract;
    this.token1Contract = {} as ethers.Contract;
  }

  async initialize() {
    // 获取 factory 地址
    this.factory = await this.pairContract.factory();

    // 这里可以添加逻辑来根据 factory 地址确定 DEX 名称和版本
    this.dexName = this.determineDexName(this.factory);

    // 获取 token0 和 token1 地址
    const token0Address = await this.pairContract.token0();
    const token1Address = await this.pairContract.token1();

    // 初始化 token 合约
    this.token0Contract = new ethers.Contract(token0Address, ERC20_ABI, this.provider);
    this.token1Contract = new ethers.Contract(token1Address, ERC20_ABI, this.provider);

    // 获取 token 信息
    this.token0 = {
      address: token0Address,
      symbol: await this.token0Contract.symbol(),
      decimals: await this.token0Contract.decimals()
    };

    this.token1 = {
      address: token1Address,
      symbol: await this.token1Contract.symbol(),
      decimals: await this.token1Contract.decimals()
    };

    // 获取 fee 信息
    try {
      this.fee = Number(await this.pairContract.fee()) / 10000; // 转换为百分比
    } catch (error) {
      // 如果合约没有 fee 方法，默认使用 0.3%
      this.fee = 0.003;
    }

    // 同步初始状态
    await this.syncState();
  }

  async syncState() {
    const [reserve0, reserve1, timestamp] = await this.pairContract.getReserves();
    this.reserves = {
      reserve0: BigInt(reserve0),
      reserve1: BigInt(reserve1),
    };
    // 同步模拟储备
    this.simulatedReserves = { reserve0: this.reserves.reserve0, reserve1: this.reserves.reserve1 };
  }

  getAmountOut(amountIn: bigint, isBuy: boolean, reserves = this.reserves): bigint {
    const [reserveIn, reserveOut] = isBuy 
      ? [reserves.reserve1, reserves.reserve0]  // 买入：用 token1 换 token0
      : [reserves.reserve0, reserves.reserve1]; // 卖出：用 token0 换 token1

    const amountInWithFee = amountIn * BigInt(1000 - Math.floor(this.fee * 1000)) / BigInt(1000);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn + amountInWithFee;
    return numerator / denominator;
  }

  buy(amountIn: bigint): bigint {
    // 买入：用 token1 换 token0
    return this.getAmountOut(amountIn, true);
  }

  sell(amountIn: bigint): bigint {
    // 卖出：用 token0 换 token1
    return this.getAmountOut(amountIn, false);
  }

  simulateBuy(amountIn: bigint): bigint {
    // 买入：用 token1 换 token0
    const amountOut = this.getAmountOut(amountIn, true, this.simulatedReserves);
    // 更新模拟储备
    this.simulatedReserves.reserve1 += amountIn;
    this.simulatedReserves.reserve0 -= amountOut;
    return amountOut;
  }

  simulateSell(amountIn: bigint): bigint {
    // 卖出：用 token0 换 token1
    const amountOut = this.getAmountOut(amountIn, false, this.simulatedReserves);
    // 更新模拟储备
    this.simulatedReserves.reserve0 += amountIn;
    this.simulatedReserves.reserve1 -= amountOut;
    return amountOut;
  }

  calculatePrice(useSimulated = false): number {
    const reserves = useSimulated ? this.simulatedReserves : this.reserves;
    // 价格现在是 token0 的价格，以 token1 计价
    const price = Number(reserves.reserve1) / Number(reserves.reserve0);
    const decimalAdjustment = 10 ** (this.token1.decimals - this.token0.decimals);
    return price * decimalAdjustment;
  }

  private determineDexName(factoryAddress: string): string {
    // 这里可以添加逻辑来根据 factory 地址确定 DEX 名称
    // 例如：
    if (factoryAddress === "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f") {
      return "UniswapV2";
    } else if (factoryAddress === "0x1F98431c8aD98523631AE4a59f267346ea31F984") {
      return "UniswapV3";
    } else {
      return "DuckSwap";
    }
    // 添加更多 DEX 的判断逻辑
    return "Unknown DEX";
  }

  calculateBuyAmount(amountIn: bigint): bigint {
    // 计算买入量，但不改变状态
    return this.getAmountOut(amountIn, true, this.simulatedReserves);
  }

  calculateSellAmount(amountIn: bigint): bigint {
    // 计算卖出量，但不改变状态
    return this.getAmountOut(amountIn, false, this.simulatedReserves);
  }

  resetSimulation() {
    this.simulatedReserves = { reserve0: this.reserves.reserve0, reserve1: this.reserves.reserve1 };
  }
}

// 使用示例
async function main() {
  const provider = new ethers.JsonRpcProvider("YOUR_RPC_URL");
  const poolAddress = "0x123..."; // 替换为实际的池地址

  const pool = new Pool(poolAddress, provider);
  await pool.initialize();
  await pool.syncState();

  console.log(`Initial price: ${pool.calculatePrice()}`);

  const buyAmount = BigInt(1e18); // 1 token0
  const boughtAmount = pool.simulateBuy(buyAmount);
  console.log(`Simulated buy ${buyAmount} ${pool.token0.symbol}, got ${boughtAmount} ${pool.token1.symbol}`);
  console.log(`Price after buy: ${pool.calculatePrice(true)}`);

  const sellAmount = BigInt(1e18); // 1 token1
  const soldAmount = pool.simulateSell(sellAmount);
  console.log(`Simulated sell ${sellAmount} ${pool.token1.symbol}, got ${soldAmount} ${pool.token0.symbol}`);
  console.log(`Price after sell: ${pool.calculatePrice(true)}`);

  // 重置模拟
  pool.resetSimulation();
  console.log(`Price after reset: ${pool.calculatePrice(true)}`);
}

main().catch(console.error);
