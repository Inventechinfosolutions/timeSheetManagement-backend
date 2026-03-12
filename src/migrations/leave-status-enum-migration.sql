
-- STEP 1: Migrate leave_requests.status (varchar -> enum)

ALTER TABLE `leave_requests`
MODIFY COLUMN `status` ENUM(
    'Pending',
    'Approved',
    'Rejected',
    'Requesting for Cancellation',
    'Cancellation Approved',
    'Cancellation Rejected',
    'Cancellation Reverted',
    'Requesting for Modification',
    'Request Modified',
    'Modification Approved',
    'Modification Cancelled',
    'Modification Rejected',
    'Cancelled'
) NOT NULL DEFAULT 'Pending';


-- STEP 2: Migrate leave_notifications.status (varchar -> enum)

ALTER TABLE `leave_notifications`
MODIFY COLUMN `status` ENUM(
    'Pending',
    'Approved',
    'Rejected',
    'Requesting for Cancellation',
    'Cancellation Approved',
    'Cancellation Rejected',
    'Cancellation Reverted',
    'Requesting for Modification',
    'Request Modified',
    'Modification Approved',
    'Modification Cancelled',
    'Modification Rejected',
    'Cancelled'
) NOT NULL DEFAULT 'Pending';


-- STEP 3: Migrate employee_details columns (varchar -> enum)

ALTER TABLE `employee_details`
MODIFY COLUMN `month_status` ENUM(
    'Pending',
    'Submitted'
) NOT NULL DEFAULT 'Pending';

-- STEP 4: Migrate employee_details columns (varchar -> enum)

ALTER TABLE `employee_details`
MODIFY COLUMN `user_status` ENUM(
    'DRAFT',
    'ACTIVE',
    'RESET_REQUIRED',
    'INACTIVE'
) NOT NULL DEFAULT 'ACTIVE';


-- STEP 5: Confirm employee_attendance.status enum values

ALTER TABLE `employee_attendance`
MODIFY COLUMN `status` ENUM(
    'Full Day',
    'Half Day',
    'Leave',
    'Pending',
    'Not Updated',
    'Weekend',
    'Holiday',
    'Absent',
    'UPCOMING'
) NULL;
