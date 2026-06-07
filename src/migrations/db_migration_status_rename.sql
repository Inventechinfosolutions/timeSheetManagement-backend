-- Migration script to rename statuses in the database:
-- 'Requesting for Cancellation' -> 'Cancellation Requested'
-- 'Requesting for Modification' -> 'Modification Requested'

-- STEP 1: Temporarily expand the ENUMs for both tables to include both the old and the new values.
-- This prevents MySQL errors while updating existing rows.

ALTER TABLE `leave_requests` MODIFY COLUMN `status` ENUM(
    'Pending',
    'Approved',
    'Rejected',
    'Requesting for Cancellation',
    'Cancellation Requested',
    'Cancellation Approved',
    'Cancellation Rejected',
    'Cancellation Reverted',
    'Requesting for Modification',
    'Modification Requested',
    'Request Modified',
    'Modification Approved',
    'Modification Cancelled',
    'Modification Rejected',
    'Cancelled'
) NOT NULL DEFAULT 'Pending';



-- STEP 2: Update all existing rows to the new status values.

UPDATE `leave_requests` 
SET `status` = 'Cancellation Requested' 
WHERE `status` = 'Requesting for Cancellation';

UPDATE `leave_requests` 
SET `status` = 'Modification Requested' 
WHERE `status` = 'Requesting for Modification';

UPDATE `leave_notifications` 
SET `status` = 'Cancellation Requested' 
WHERE `status` = 'Requesting for Cancellation';

UPDATE `leave_notifications` 
SET `status` = 'Modification Requested' 
WHERE `status` = 'Requesting for Modification';

-- STEP 3: Restrict the ENUMs to the final set of values, removing the old status strings.

ALTER TABLE `leave_requests` MODIFY COLUMN `status` ENUM(
    'Pending',
    'Approved',
    'Rejected',
    'Cancellation Requested',
    'Cancellation Approved',
    'Cancellation Rejected',
    'Cancellation Reverted',
    'Modification Requested',
    'Request Modified',
    'Modification Approved',
    'Modification Cancelled',
    'Modification Rejected',
    'Cancelled'
) NOT NULL DEFAULT 'Pending';

