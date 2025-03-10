// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract SimpleDEX {
    using SafeERC20 for IERC20;

    struct Pair {
        IERC20 token0;
        IERC20 token1;
        uint256 reserve0;
        uint256 reserve1;
    }

    mapping(bytes32 => Pair) public pairs;
    mapping(bytes32 => uint256) public liquidityTokens;

    address public immutable factory;
    uint24 public constant fee = 30; // 0.3% 费率，用 30 表示
    IERC20 public immutable token0;
    IERC20 public immutable token1;

    event LiquidityAdded(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event LiquidityRemoved(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event Swap(
        address indexed user,
        uint256 amountIn,
        uint256 amountOut,
        address tokenIn,
        address tokenOut
    );

    // 在构造函数中初始化 factory
    constructor(address _token0, address _token1) {
        factory = address(this);
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
    }

    function addLiquidity(
        address token0,
        address token1,
        uint256 amount0Desired,
        uint256 amount1Desired,
        address to
    ) external returns (uint256 liquidity) {
        bytes32 pairKey = _getPairKey(token0, token1);
        Pair storage pair = pairs[pairKey];

        if (pair.token0 == IERC20(address(0))) {
            pair.token0 = IERC20(token0);
            pair.token1 = IERC20(token1);
        }

        uint256 amount0;
        uint256 amount1;
        if (pair.reserve0 == 0 && pair.reserve1 == 0) {
            (amount0, amount1) = (amount0Desired, amount1Desired);
        } else {
            uint256 amount1Optimal = (amount0Desired * pair.reserve1) /
                pair.reserve0;
            if (amount1Optimal <= amount1Desired) {
                (amount0, amount1) = (amount0Desired, amount1Optimal);
            } else {
                uint256 amount0Optimal = (amount1Desired * pair.reserve0) /
                    pair.reserve1;
                (amount0, amount1) = (amount0Optimal, amount1Desired);
            }
        }

        pair.token0.safeTransferFrom(msg.sender, address(this), amount0);
        pair.token1.safeTransferFrom(msg.sender, address(this), amount1);

        liquidity = Math.sqrt(amount0 * amount1);
        liquidityTokens[pairKey] += liquidity;

        pair.reserve0 += amount0;
        pair.reserve1 += amount1;

        emit LiquidityAdded(to, amount0, amount1, liquidity);
    }

    function removeLiquidity(
        address token0,
        address token1,
        uint256 liquidity,
        address to
    ) external returns (uint256 amount0, uint256 amount1) {
        bytes32 pairKey = _getPairKey(token0, token1);
        Pair storage pair = pairs[pairKey];

        require(
            liquidityTokens[pairKey] >= liquidity,
            "Insufficient liquidity"
        );

        amount0 = (liquidity * pair.reserve0) / liquidityTokens[pairKey];
        amount1 = (liquidity * pair.reserve1) / liquidityTokens[pairKey];

        liquidityTokens[pairKey] -= liquidity;
        pair.reserve0 -= amount0;
        pair.reserve1 -= amount1;

        pair.token0.safeTransfer(to, amount0);
        pair.token1.safeTransfer(to, amount1);

        emit LiquidityRemoved(to, amount0, amount1, liquidity);
    }

    function swap(
        address pairAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to
    ) external returns (uint256 amountOut) {
        bytes32 pairKey = _getPairKey(tokenIn, tokenOut);
        Pair storage pair = pairs[pairKey];

        require(
            tokenIn == address(pair.token0) || tokenIn == address(pair.token1),
            "Invalid tokenIn"
        );
        require(
            tokenOut == address(pair.token0) ||
                tokenOut == address(pair.token1),
            "Invalid tokenOut"
        );
        require(tokenIn != tokenOut, "tokenIn and tokenOut must be different");

        bool isToken0 = tokenIn == address(pair.token0);
        (uint256 reserveIn, uint256 reserveOut) = isToken0
            ? (pair.reserve0, pair.reserve1)
            : (pair.reserve1, pair.reserve0);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 amountInWithFee = amountIn * 997;
        amountOut =
            (amountInWithFee * reserveOut) /
            ((reserveIn * 1000) + amountInWithFee);
        require(amountOut >= amountOutMin, "Insufficient output amount");

        if (isToken0) {
            pair.reserve0 += amountIn;
            pair.reserve1 -= amountOut;
            pair.token1.safeTransfer(to, amountOut);
        } else {
            pair.reserve1 += amountIn;
            pair.reserve0 -= amountOut;
            pair.token0.safeTransfer(to, amountOut);
        }

        emit Swap(msg.sender, amountIn, amountOut, tokenIn, tokenOut);
        return amountOut;
    }

    function getReserves()
        public
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
    {
        bytes32 pairKey = _getPairKey(address(token0), address(token1));
        Pair storage pair = pairs[pairKey];
        reserve0 = uint112(pair.reserve0);
        reserve1 = uint112(pair.reserve1);
        blockTimestampLast = 0;
    }

    function _getPairKey(
        address token0,
        address token1
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    token0 < token1 ? token0 : token1,
                    token0 < token1 ? token1 : token0
                )
            );
    }
}
