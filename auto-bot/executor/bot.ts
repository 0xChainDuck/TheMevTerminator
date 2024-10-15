import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { ArbitrageSystem } from './arbitrage_system';
import { arbitrageConfig } from './config';
// 加载环境变量
dotenv.config();

async function runArbitrageBot() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY is not set');
  }
  const signer = new ethers.Wallet(privateKey, provider);
  const userTransactionRouterAddress = process.env.USER_TRANSACTION_ROUTER_ADDRESS;
  if (!userTransactionRouterAddress) {  
    throw new Error('USER_TRANSACTION_ROUTER_ADDRESS is not set');
  }
  const transactionExecutorAddress = process.env.TRANSACTION_EXECUTOR_ADDRESS;
  if (!transactionExecutorAddress) {
    throw new Error('TRANSACTION_EXECUTOR_ADDRESS is not set');
  }
  const arbitrageSystem = new ArbitrageSystem(provider, signer, arbitrageConfig, userTransactionRouterAddress, transactionExecutorAddress);

  while (true) {
    try {
      await arbitrageSystem.checkAndExecuteArbitrage();
    } catch (error) {
      console.error('Error in arbitrage cycle:', error);
    }

    // 等待一段时间再进行下一次检查
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒
  }
}

runArbitrageBot().catch(console.error);
