import { ethers } from 'ethers';
import { ArbitrageParams } from './types';

const TRANSACTION_EXECUTOR_ABI = [
  // 添加 executeTransactions 函数的 ABI
  "function executeTransactions(tuple(uint256 dexId, address tokenA, address tokenB, uint256 amountOut)[] transactions) external"
];

export class TransactionExecutor {
  private contract: ethers.Contract;

  constructor(address: string, signer: ethers.Signer) {
    this.contract = new ethers.Contract(address, TRANSACTION_EXECUTOR_ABI, signer);
  }

  async executeArbitrage(arbitrageParams: ArbitrageParams[][]): Promise<ethers.TransactionReceipt> {
    try {
      const tx = await this.contract.executeTransactions(arbitrageParams);
      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      return receipt;
    } catch (error) {
      console.error('Error executing arbitrage on-chain:', error);
      throw error;
    }
  }
}
