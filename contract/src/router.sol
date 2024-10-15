// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TransactionPool.sol";

contract UserTransactionRouter {
    TransactionPool public transactionPool;
    address public dexAddress;
    uint256[] public pendingBlocks;

    struct SwapParams {
        uint256 amountIn;
        uint256 amountOutMin;
        address tokenIn;
        address tokenOut;
        address to;
    }

    struct PendingBlockInfo {
        uint256 blockNumber;
        uint256 transactionCount;
        SwapParams[] swapParams;
    }

    constructor(address _transactionPool, address _dexAddress) {
        transactionPool = TransactionPool(_transactionPool);
        dexAddress = _dexAddress;
    }
    //修改参数，更易解析
    function submitDEXOperation(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to
    ) external {
        uint256 currentBlock = block.number;
        bytes memory params = abi.encode(
            amountIn,
            amountOutMin,
            tokenIn,
            tokenOut,
            to
        );

        transactionPool.addTransaction(
            currentBlock,
            msg.sender,
            "swap",
            params
        );

        if (
            pendingBlocks.length == 0 ||
            pendingBlocks[pendingBlocks.length - 1] != currentBlock
        ) {
            pendingBlocks.push(currentBlock);
        }
    }

    function getPendingBlocks() external view returns (uint256[] memory) {
        return pendingBlocks;
    }

    function removePendingBlock() external {
        require(
            msg.sender == address(transactionPool),
            "Only TransactionPool can remove pending blocks"
        );
        if (pendingBlocks.length > 0) {
            for (uint i = 0; i < pendingBlocks.length - 1; i++) {
                pendingBlocks[i] = pendingBlocks[i + 1];
            }
            pendingBlocks.pop();
        }
    }

    function getValidPendingBlocks()
        public
        view
        returns (PendingBlockInfo[] memory)
    {
        uint256 validCount = 0;
        for (uint i = 0; i < pendingBlocks.length; i++) {
            TransactionPool.Transaction[] memory txs = transactionPool
                .getTransactions(pendingBlocks[i]);
            if (txs.length > 0) {
                validCount++;
            }
        }

        PendingBlockInfo[] memory blockInfos = new PendingBlockInfo[](
            validCount
        );
        uint256 index = 0;
        for (uint i = 0; i < pendingBlocks.length; i++) {
            TransactionPool.Transaction[] memory txs = transactionPool
                .getTransactions(pendingBlocks[i]);
            if (txs.length > 0) {
                SwapParams[] memory swapParamsArray = new SwapParams[](
                    txs.length
                );
                uint256 swapCount = 0;
                for (uint j = 0; j < txs.length; j++) {
                    if (
                        keccak256(bytes(txs[j].operationName)) ==
                        keccak256(bytes("swap"))
                    ) {
                        (
                            uint256 amountIn,
                            uint256 amountOutMin,
                            address tokenIn,
                            address tokenOut,
                            address to
                        ) = abi.decode(
                                txs[j].params,
                                (uint256, uint256, address, address, address)
                            );
                        swapParamsArray[swapCount] = SwapParams(
                            amountIn,
                            amountOutMin,
                            tokenIn,
                            tokenOut,
                            to
                        );
                        swapCount++;
                    }
                }
                assembly {
                    mstore(swapParamsArray, swapCount)
                }
                blockInfos[index] = PendingBlockInfo(
                    pendingBlocks[i],
                    txs.length,
                    swapParamsArray
                );
                index++;
            }
        }
        return blockInfos;
    }

    function getEarliestPendingBlock()
        external
        view
        returns (PendingBlockInfo memory)
    {
        PendingBlockInfo[] memory blockInfos = getValidPendingBlocks();
        require(blockInfos.length > 0, "no valid pending blocks");

        PendingBlockInfo memory earliestBlock = blockInfos[0];
        for (uint i = 1; i < blockInfos.length; i++) {
            if (blockInfos[i].blockNumber < earliestBlock.blockNumber) {
                earliestBlock = blockInfos[i];
            }
        }

        return earliestBlock;
    }
}
