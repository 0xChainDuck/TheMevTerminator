// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TransactionPool.sol";

contract UserTransactionRouter {
    TransactionPool public transactionPool;
    uint256 public constant BLOCKS_IN_FUTURE = 5; // 假设交易将在5个区块后执行
    address public dexAddress;

    constructor(address _transactionPool, address _dexAddress) {
        transactionPool = TransactionPool(_transactionPool);
        dexAddress = _dexAddress;
    }

    function submitDEXOperation(
        string memory operationName,
        bytes memory params
    ) external {
        uint256 targetBlock = block.number + BLOCKS_IN_FUTURE;
        transactionPool.addTransaction(
            targetBlock,
            msg.sender,
            operationName,
            params
        );
    }

    // 获取特定区块的所有交易
    function getBlockTransactions(
        uint256 blockNumber
    ) external view returns (TransactionPool.Transaction[] memory) {
        return transactionPool.getTransactions(blockNumber);
    }
}
