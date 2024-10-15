// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TransactionPool.sol";
import "./SimpleDEX.sol";
import "./Router.sol";
import "../lib/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract TransactionExecutor {
    mapping(uint256 => bool) public blockExecuted;
    TransactionPool public transactionPool;
    UserTransactionRouter public router;
    SimpleDEX public dex;

    mapping(uint256 => address) public dexRouters;

    mapping(uint256 => bool) public isUniswapDex;

    struct ArbitrageParams {
        uint256 dexId;
        address tokenA;
        address tokenB;
        uint256 amountIn;
        uint256 amountOut;
    }

    constructor(address _transactionPool, address _dex, address _router) {
        transactionPool = TransactionPool(_transactionPool);
        dex = SimpleDEX(_dex);
        router = UserTransactionRouter(_router);
    }

    function executeTransactions(
        ArbitrageParams[][] memory arbitrageParams
    ) external {
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
        executePriceMonitoringAndArbitrage(arbitrageParams);

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
            dex.swap(
                address(dex),
                amountIn,
                amountOutMin,
                tokenIn,
                tokenOut,
                to
            );
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

    function executePriceMonitoringAndArbitrage(
        ArbitrageParams[][] memory arbitrageParams
    ) internal {
        for (uint i = 0; i < arbitrageParams.length; i++) {
            ArbitrageParams[] memory arbitragePath = arbitrageParams[i];

            // 记录初始余额
            uint256 initialBalance = IERC20(arbitragePath[0].tokenA).balanceOf(
                address(this)
            );

            // 执行套利路径
            for (uint j = 0; j < arbitragePath.length; j++) {
                ArbitrageParams memory params = arbitragePath[j];
                address dexRouter = dexRouters[params.dexId];
                require(dexRouter != address(0), "Invalid DEX router");

                if (isUniswapDex[params.dexId]) {
                    // Uniswap风格的swap
                    IUniswapV2Router02 uniswapRouter = IUniswapV2Router02(
                        dexRouter
                    );
                    address[] memory path = new address[](2);
                    path[0] = params.tokenA;
                    path[1] = params.tokenB;
                    uniswapRouter.swapExactTokensForTokens(
                        params.amountIn,
                        params.amountOut, // 最小输出金额
                        path,
                        address(this),
                        block.timestamp
                    );
                } else {
                    // 使用自定义DEX的swap逻辑
                    dex.swap(
                        address(dex),
                        params.amountIn,
                        params.amountOut, // 最小输出金额
                        params.tokenA,
                        params.tokenB,
                        address(this) // 使用合约地址作为接收者
                    );
                }
            }

            // 计算收益
            uint256 finalBalance = IERC20(arbitragePath[0].tokenA).balanceOf(
                address(this)
            );
            int256 profit = int256(finalBalance) - int256(initialBalance);

            // 这里可以添加记录收益或其他操作的逻辑
            // 例如：emit ArbitrageProfit(profit);
        }
    }

    // 添加或更新DEX路由器地址
    function setDEXRouter(uint256 dexId, address routerAddress) external {
        // 添加适当的访问控制
        dexRouters[dexId] = routerAddress;
        isUniswapDex[dexId] = true;
    }
}
