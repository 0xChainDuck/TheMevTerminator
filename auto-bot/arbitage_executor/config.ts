import { ArbitrageConfig } from './types';

export const arbitrageConfig: ArbitrageConfig = {
  pairs: [
    {
      address: "0x123...", // WETH-USDC pair address
      baseToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH address
      quoteToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC address
      relatedPairs: ["0x456...", "0x789..."] // Other pairs with WETH as base token
    },
    {
      address: "0xabc...", // WBTC-USDC pair address
      baseToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC address
      quoteToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC address
      relatedPairs: ["0xdef...", "0xghi..."] // Other pairs with WBTC as base token
    },
    // Add more pairs as needed
  ]
};

