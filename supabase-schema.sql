-- BTC1USD Merkle Distribution Database Schema for Supabase
-- This schema stores distribution data and merkle proofs for the rewards system

-- ============================================================
-- DISTRIBUTIONS TABLE
-- Stores information about each weekly distribution
-- ============================================================
CREATE TABLE IF NOT EXISTS distributions (
  id BIGSERIAL PRIMARY KEY,
  distribution_id INTEGER NOT NULL UNIQUE,
  merkle_root TEXT NOT NULL,
  total_tokens TEXT NOT NULL, -- Stored as string to handle BigInt (8 decimals)
  total_claimed TEXT DEFAULT '0', -- Stored as string to handle BigInt (8 decimals)
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  finalized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_distributions_distribution_id ON distributions(distribution_id);
CREATE INDEX IF NOT EXISTS idx_distributions_finalized ON distributions(finalized);

-- ============================================================
-- MERKLE_CLAIMS TABLE
-- Stores individual user claims with merkle proofs
-- ============================================================
CREATE TABLE IF NOT EXISTS merkle_claims (
  id BIGSERIAL PRIMARY KEY,
  distribution_id INTEGER NOT NULL REFERENCES distributions(distribution_id) ON DELETE CASCADE,
  index INTEGER NOT NULL, -- User's index in merkle tree
  account TEXT NOT NULL, -- User's wallet address (lowercase)
  amount TEXT NOT NULL, -- Reward amount in 8 decimals (stored as string for BigInt)
  proof JSONB NOT NULL, -- Array of merkle proof hashes
  claimed BOOLEAN DEFAULT FALSE,
  claimed_tx_hash TEXT, -- Transaction hash when claimed
  claimed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(distribution_id, account) -- One claim per user per distribution
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_merkle_claims_account ON merkle_claims(account);
CREATE INDEX IF NOT EXISTS idx_merkle_claims_distribution_id ON merkle_claims(distribution_id);
CREATE INDEX IF NOT EXISTS idx_merkle_claims_claimed ON merkle_claims(claimed);
CREATE INDEX IF NOT EXISTS idx_merkle_claims_account_claimed ON merkle_claims(account, claimed);

-- ============================================================
-- DISTRIBUTION_STATS VIEW
-- Materialized view for distribution statistics
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS distribution_stats AS
SELECT 
  distribution_id,
  COUNT(*) as total_claimers,
  SUM(CASE WHEN claimed THEN 1 ELSE 0 END) as total_claimed_count,
  SUM(CASE WHEN claimed THEN amount::NUMERIC ELSE 0 END) as total_claimed,
  SUM(amount::NUMERIC) as total_tokens,
  CASE 
    WHEN SUM(amount::NUMERIC) > 0 
    THEN (SUM(CASE WHEN claimed THEN amount::NUMERIC ELSE 0 END) / SUM(amount::NUMERIC) * 100)
    ELSE 0 
  END as percentage_claimed
FROM merkle_claims
GROUP BY distribution_id;

-- Index for materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_stats_distribution_id ON distribution_stats(distribution_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to refresh distribution stats
CREATE OR REPLACE FUNCTION refresh_distribution_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY distribution_stats;
END;
$$ LANGUAGE plpgsql;

-- Function to update total_claimed in distributions table
CREATE OR REPLACE FUNCTION update_distribution_total_claimed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE distributions
  SET total_claimed = (
    SELECT COALESCE(SUM(amount::NUMERIC), 0)::TEXT
    FROM merkle_claims
    WHERE distribution_id = NEW.distribution_id AND claimed = TRUE
  )
  WHERE distribution_id = NEW.distribution_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update total_claimed
DROP TRIGGER IF EXISTS trigger_update_total_claimed ON merkle_claims;
CREATE TRIGGER trigger_update_total_claimed
AFTER UPDATE OF claimed ON merkle_claims
FOR EACH ROW
WHEN (NEW.claimed = TRUE AND OLD.claimed = FALSE)
EXECUTE FUNCTION update_distribution_total_claimed();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable public read access, admin write access
-- ============================================================

ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merkle_claims ENABLE ROW LEVEL SECURITY;

-- Public read access for distributions
CREATE POLICY "Allow public read access to distributions"
ON distributions FOR SELECT
TO anon, authenticated
USING (true);

-- Public read access for merkle_claims
CREATE POLICY "Allow public read access to merkle_claims"
ON merkle_claims FOR SELECT
TO anon, authenticated
USING (true);

-- Admin write access (you'll need to create an admin role)
-- CREATE POLICY "Allow admin write access to distributions"
-- ON distributions FOR ALL
-- TO admin
-- USING (true);

-- CREATE POLICY "Allow admin write access to merkle_claims"
-- ON merkle_claims FOR ALL
-- TO admin
-- USING (true);

-- ============================================================
-- SAMPLE DATA (for testing)
-- ============================================================

-- Insert sample distribution
-- INSERT INTO distributions (distribution_id, merkle_root, total_tokens, timestamp)
-- VALUES (
--   1,
--   '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
--   '100000000000', -- 1000 BTC1 (8 decimals)
--   NOW()
-- );

-- Insert sample claim
-- INSERT INTO merkle_claims (distribution_id, index, account, amount, proof)
-- VALUES (
--   1,
--   0,
--   '0x742d35cc6634c0532925a3b844bc9e7595f0b55b', -- lowercase address
--   '12000000', -- 0.12 BTC1 (8 decimals)
--   '["0xabcdef...", "0x123456..."]'::jsonb
-- );

-- ============================================================
-- MAINTENANCE QUERIES
-- ============================================================

-- Refresh stats view (run periodically via cron)
-- SELECT refresh_distribution_stats();

-- Get unclaimed rewards for a user
-- SELECT * FROM merkle_claims 
-- WHERE account = '0x742d35cc6634c0532925a3b844bc9e7595f0b55b' 
-- AND claimed = FALSE;

-- Get distribution statistics
-- SELECT * FROM distribution_stats WHERE distribution_id = 1;

-- Mark claim as claimed (typically done by backend after verifying on-chain)
-- UPDATE merkle_claims 
-- SET claimed = TRUE, claimed_tx_hash = '0x...', claimed_at = NOW()
-- WHERE distribution_id = 1 AND account = '0x...';
