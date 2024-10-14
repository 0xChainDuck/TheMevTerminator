// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TransactionPool.sol";
import "./SimpleDEX.sol";
import "./Router.sol";

contract TransactionExecutor {
    mapping(uint256 => bool) public blockExecuted;
    TransactionPool public transactionPool;
    UserTransactionRouter public router;
    SimpleDEX public dex;

    constructor(address _transactionPool, address _dex, address _router) {
        transactionPool = TransactionPool(_transactionPool);
        dex = SimpleDEX(_dex);
        router = UserTransactionRouter(_router);
    }

    function executeTransactions() external {
        uint256[] memory pendingBlocks = router.getPendingBlocks();
        require(pendingBlocks.length > 0, "No pending blocks");

        uint256 blockToExecute = pendingBlocks[0];
        require(
            blockToExecute < block.number - 1,
            "Cannot execute current or recent blocks"
        );

        // 使用下一个区块的哈希作为随机数源
        uint256 randomness = uint256(blockhash(blockToExecute));
        require(randomness != 0, "Cannot get block hash");

        // 获取要执行的区块的交易
        TransactionPool.Transaction[] memory txs = transactionPool
            .getTransactions(blockToExecute);

        // 检查是否有交易需要执行
        if (txs.length == 0) {
            // 如果没有交易,直接移除这个区块
            router.removePendingBlock();
            return;
        }

        // 使用区块哈希进行随机排序
        for (uint i = txs.length - 1; i > 0; i--) {
            uint j = uint(keccak256(abi.encodePacked(randomness, i))) % (i + 1);
            (txs[i], txs[j]) = (txs[j], txs[i]);
        }

        // 执行交易
        for (uint i = 0; i < txs.length; i++) {
            TransactionPool.Transaction memory tx = txs[i];
            executeDEXOperation(tx.sender, tx.operationName, tx.params);
        }

        // 监控价格变化并执行套利
        executePriceMonitoringAndArbitrage();

        // 清空交易池
        transactionPool.clearTransactions(blockToExecute);

        // 移除已执行的区块
        router.removePendingBlock();
    }

    function executeDEXOperation(
        address sender,
        string memory operationName,
        bytes memory params
    ) internal {
        if (keccak256(bytes(operationName)) == keccak256(bytes("swap"))) {
            (
                uint256 amountIn,
                uint256 amountOutMin,
                address tokenIn,
                address tokenOut,
                address to
            ) = abi.decode(
                    params,
                    (uint256, uint256, address, address, address)
                );
            dex.swap(amountIn, amountOutMin, tokenIn, tokenOut, to);
        } else if (
            keccak256(bytes(operationName)) == keccak256(bytes("addLiquidity"))
        ) {
            (
                address token0,
                address token1,
                uint256 amount0Desired,
                uint256 amount1Desired,
                address to
            ) = abi.decode(
                    params,
                    (address, address, uint256, uint256, address)
                );
            dex.addLiquidity(
                token0,
                token1,
                amount0Desired,
                amount1Desired,
                to
            );
        } else if (
            keccak256(bytes(operationName)) ==
            keccak256(bytes("removeLiquidity"))
        ) {
            (
                address token0,
                address token1,
                uint256 liquidity,
                address to
            ) = abi.decode(params, (address, address, uint256, address));
            dex.removeLiquidity(token0, token1, liquidity, to);
        }
    }

    function executePriceMonitoringAndArbitrage() internal {
        // TODO: 实现价格监控和套利逻辑
        // 1. 检查各个交易对的价格
        // 2. 如果发现套利机会,执行套利交易
        // 3. 确保套利交易不会对用户产生负面影响
    }
}
