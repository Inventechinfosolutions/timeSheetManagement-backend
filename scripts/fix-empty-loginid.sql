-- Fix empty loginId values in users table
-- This script updates all empty loginId values to be unique using the user's ID

-- First, let's see how many rows have empty loginId
-- SELECT COUNT(*) FROM users WHERE loginId = '' OR loginId IS NULL;

-- Update empty loginId values to use a unique identifier
-- Using CONCAT to create a unique value based on the user ID
UPDATE users 
SET loginId = CONCAT('user_', id) 
WHERE loginId = '' OR loginId IS NULL;

-- Verify the update
-- SELECT id, loginId FROM users WHERE loginId LIKE 'user_%';

-- After running this script, restart your application
-- The TypeORM synchronize should now work without the duplicate entry error

