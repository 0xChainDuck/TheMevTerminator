// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TransactionPool.sol";

contract UserTransactionRouter {
    TransactionPool public transactionPool;
    address public dexAddress;
    uint256[] public pendingBlocks;

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
        returns (uint256[] memory validBlocks, uint256[] memory txCounts)
    {
        uint256 validCount = 0;
        for (uint i = 0; i < pendingBlocks.length; i++) {
            uint256 txCount = transactionPool
                .getTransactions(pendingBlocks[i])
                .length;
            if (txCount > 0) {
                validCount++;
            }
        }

        validBlocks = new uint256[](validCount);
        txCounts = new uint256[](validCount);
        uint256 index = 0;
        for (uint i = 0; i < pendingBlocks.length; i++) {
            uint256 txCount = transactionPool
                .getTransactions(pendingBlocks[i])
                .length;
            if (txCount > 0) {
                validBlocks[index] = pendingBlocks[i];
                txCounts[index] = txCount;
                index++;
            }
        }
    }

    function getEarliestPendingBlock()
        external
        view
        returns (uint256 blockNumber, uint256 txCount)
    {
        (
            uint256[] memory validBlocks,
            uint256[] memory txCounts
        ) = getValidPendingBlocks();
        require(validBlocks.length > 0, "no valid pending blocks");
        return (validBlocks[0], txCounts[0]);
    }
}
