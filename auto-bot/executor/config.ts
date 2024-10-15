import fs from 'fs';
import path from 'path';

interface PairConfig {
  address: string;
  baseToken: string;
  quoteToken: string;
  relatedPairs: string[];
}

export interface ArbitrageConfig {
  pairs: PairConfig[];
}

function loadConfig(): ArbitrageConfig {
  const configPath = path.join(__dirname, 'arbitrage_config.json');
  const configFile = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(configFile) as ArbitrageConfig;
}

export const arbitrageConfig: ArbitrageConfig = loadConfig();
