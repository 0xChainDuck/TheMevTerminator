// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TransactionPool.sol";
import "./SimpleDEX.sol";
import "../lib/chainlink-brownie-contracts/contracts/src/v0.8/vrf/VRFConsumerBase.sol";

contract TransactionExecutor is VRFConsumerBase {
    TransactionPool public transactionPool;
    SimpleDEX public dex;

    bytes32 internal keyHash;
    uint256 internal fee;
    uint256 public randomResult;
    bool public randomnessReceived;

    TransactionPool.Transaction[] public validTransactions;

    constructor(
        address _transactionPool,
        address _dex,
        address _vrfCoordinator,
        address _linkToken,
        bytes32 _keyHash,
        uint256 _fee
    ) VRFConsumerBase(_vrfCoordinator, _linkToken) {
        transactionPool = TransactionPool(_transactionPool);
        dex = SimpleDEX(_dex);
        keyHash = _keyHash;
        fee = _fee;
    }

    function requestRandomness() external returns (bytes32 requestId) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee);
    }

    function fulfillRandomness(
        bytes32 requestId,
        uint256 randomness
    ) internal override {
        randomResult = randomness;
        randomnessReceived = true;
        executeTransactions();
    }

    function executeTransactions() internal {
        require(randomnessReceived, "Randomness not received yet");

        // 获取当前区块的交易
        TransactionPool.Transaction[] memory txs = transactionPool
            .getTransactions(block.number);

        // 使用VRF提供的随机数进行随机排序
        for (uint i = txs.length - 1; i > 0; i--) {
            uint j = uint(keccak256(abi.encodePacked(randomResult, i))) %
                (i + 1);
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
        transactionPool.clearTransactions(block.number);
        randomnessReceived = false;
    }

    function executeDEXOperation(
        address sender,
        string memory operationName,
        bytes memory params
    ) internal {
        if (
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
        } else if (
            keccak256(bytes(operationName)) == keccak256(bytes("swap"))
        ) {
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
        }
    }

    function executePriceMonitoringAndArbitrage() internal {
        // TODO: 实现价格监控和套利逻辑
        // 1. 检查各个交易对的价格
        // 2. 如果发现套利机会,执行套利交易
        // 3. 确保套利交易不会对用户产生负面影响
    }
}
