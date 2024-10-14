// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TransactionPool {
    struct Transaction {
        address sender;
        string operationName;
        bytes params;
    }

    // 使用区块号作为键的映射
    mapping(uint256 => Transaction[]) public blockTransactions;

    function addTransaction(
        uint256 targetBlock,
        address sender,
        string memory operationName,
        bytes memory params
    ) external {
        blockTransactions[targetBlock].push(
            Transaction(sender, operationName, params)
        );
    }

    function getTransactions(
        uint256 blockNumber
    ) external view returns (Transaction[] memory) {
        return blockTransactions[blockNumber];
    }

    function clearTransactions(uint256 blockNumber) external {
        delete blockTransactions[blockNumber];
    }
}
