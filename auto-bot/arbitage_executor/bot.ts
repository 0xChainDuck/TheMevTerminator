import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ArbitrageSystem } from './arbitrage_system';

// 加载环境变量
dotenv.config();

// 读取 ABI 文件
const duckRouteABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi', 'DuckRouteABI.json'), 'utf8'));
const uniswapRouteABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi', 'UniswapRouteABI.json'), 'utf8'));


async function runArbitrageBot() {
  const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL');
  const userTransactionRouterAddress = 'YOUR_CONTRACT_ADDRESS';
  const arbitrageSystem = new ArbitrageSystem(provider, userTransactionRouterAddress);

  while (true) {
    try {
      await arbitrageSystem.checkAndExecuteArbitrage();
    } catch (error) {
      console.error('Error in arbitrage cycle:', error);
    }

    // 等待一段时间再进行下一次检查
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒
  }
}

runArbitrageBot().catch(console.error);
