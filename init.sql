-- Drop the existing 'tabs' table if it exists
DROP TABLE IF EXISTS tabs;

-- Create the updated 'tabs' table
CREATE TABLE IF NOT EXISTS tabs (
    useragent TEXT NOT NULL,
    tabid SERIAL NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    faviconurl TEXT,
    pinned BOOLEAN DEFAULT FALSE,
    lastaccessed TIMESTAMP,
    PRIMARY KEY (useragent, tabid)
);

-- Add an index on the 'url' column
CREATE INDEX IF NOT EXISTS idx_tabs_url ON tabs (url);

-- Add an index on the 'useragent' column
CREATE INDEX IF NOT EXISTS idx_tabs_useragent ON tabs (useragent);

-- Enable Row Level Security (RLS) for the 'tabs' table
ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow authenticated users to insert, select, update, and delete their own data
CREATE POLICY "Allow full access to authenticated users" 
ON tabs 
FOR ALL 
USING (auth.uid() IS NOT NULL);
