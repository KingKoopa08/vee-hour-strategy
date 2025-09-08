CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255),
    market_cap BIGINT,
    pe_ratio DECIMAL(10, 2),
    sector VARCHAR(100),
    industry VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    open DECIMAL(10, 2),
    high DECIMAL(10, 2),
    low DECIMAL(10, 2),
    close DECIMAL(10, 2),
    volume BIGINT,
    vwap DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, timestamp)
);

CREATE TABLE IF NOT EXISTS technical_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    rsi DECIMAL(5, 2),
    sma_20 DECIMAL(10, 2),
    ema_9 DECIMAL(10, 2),
    bollinger_upper DECIMAL(10, 2),
    bollinger_middle DECIMAL(10, 2),
    bollinger_lower DECIMAL(10, 2),
    volume_ratio DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, timestamp)
);

CREATE TABLE IF NOT EXISTS trading_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    signal_type VARCHAR(20) NOT NULL,
    signal_strength VARCHAR(20),
    price DECIMAL(10, 2),
    timestamp TIMESTAMP NOT NULL,
    reason TEXT,
    confidence INTEGER,
    target_price DECIMAL(10, 2),
    stop_loss DECIMAL(10, 2),
    time_window VARCHAR(50),
    indicators JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS safety_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    market_cap_score DECIMAL(3, 1),
    pe_ratio_score DECIMAL(3, 1),
    volume_score DECIMAL(3, 1),
    technical_score DECIMAL(3, 1),
    news_score DECIMAL(3, 1),
    overall_score DECIMAL(3, 1),
    recommendation VARCHAR(20),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id)
);

CREATE TABLE IF NOT EXISTS user_watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE(user_id, stock_id)
);

CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    trade_type VARCHAR(10) NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total_value DECIMAL(12, 2) NOT NULL,
    signal_id UUID REFERENCES trading_signals(id),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profit_loss DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'OPEN'
);

CREATE INDEX idx_price_data_timestamp ON price_data(timestamp);
CREATE INDEX idx_price_data_stock_timestamp ON price_data(stock_id, timestamp);
CREATE INDEX idx_technical_indicators_timestamp ON technical_indicators(timestamp);
CREATE INDEX idx_trading_signals_timestamp ON trading_signals(timestamp);
CREATE INDEX idx_trading_signals_stock ON trading_signals(stock_id);
CREATE INDEX idx_trades_executed_at ON trades(executed_at);
CREATE INDEX idx_trades_status ON trades(status);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stocks_updated_at BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_safety_scores_updated_at BEFORE UPDATE ON safety_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();