import { ethers } from 'ethers';
import { SwapOperation } from './types';

const USER_TRANSACTION_ROUTER_ABI = [
  // 添加 getEarliestPendingBlock 函数的 ABI
  "function getEarliestPendingBlock() external view returns (tuple(uint256 blockNumber, uint256 transactionCount, tuple(uint256 amountIn, uint256 amountOutMin, address tokenIn, address tokenOut, address to)[] swapParams))"
];

export class PendingBlockMonitor {
  private contract: ethers.Contract;

  constructor(address: string, provider: ethers.Provider) {
    this.contract = new ethers.Contract(address, USER_TRANSACTION_ROUTER_ABI, provider);
  }

  async getEarliestPendingOperations(): Promise<SwapOperation[] | null> {
    try {
      const pendingBlock = await this.contract.getEarliestPendingBlock();
      
      if (pendingBlock.swapParams.length === 0) {
        return null;
      }

      return pendingBlock.swapParams.map((param: any) => ({
        tokenIn: param.tokenIn,
        tokenOut: param.tokenOut,
        amountIn: BigInt(param.amountIn.toString()),
        amountOutMin: BigInt(param.amountOutMin.toString()),
        pool: param.to // 假设 'to' 字段是交易对的地址
      }));
    } catch (error) {
      console.error('Error fetching earliest pending block:', error);
      return null;
    }
  }
}
