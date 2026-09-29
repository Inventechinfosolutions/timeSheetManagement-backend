-- Migration for Notes Table (Attachments are stored in object_store)

CREATE TABLE IF NOT EXISTS `notes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` LONGTEXT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'PERSONAL',
  `projectName` VARCHAR(255) NULL,
  `parentId` INT NULL,
  `userId` VARCHAR(100) NULL,
  `employeeId` VARCHAR(100) NULL,
  `color` VARCHAR(50) NULL DEFAULT '#4318FF',
  `isPinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `isArchived` BOOLEAN NOT NULL DEFAULT FALSE,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` VARCHAR(255) NULL,
  `updatedBy` VARCHAR(255) NULL,
  INDEX `idx_notes_parentId` (`parentId`),
  INDEX `idx_notes_type` (`type`),
  INDEX `idx_notes_userId` (`userId`),
  INDEX `idx_notes_employeeId` (`employeeId`),
  CONSTRAINT `fk_notes_parent` FOREIGN KEY (`parentId`) REFERENCES `notes` (`id`) ON DELETE CASCADE
);

-- Update object_store ENUMs to include 'NOTE' and 'NOTE_ATTACHMENT'
ALTER TABLE `object_store` 
  MODIFY COLUMN `entityType` ENUM('PRODUCT', 'MASTER_HOLIDAY', 'EMPLOYEE', 'LEAVE_REQUEST', 'PROJECT', 'NOTE') NOT NULL;

ALTER TABLE `object_store` 
  MODIFY COLUMN `refType` ENUM('PRODUCT_IMG', 'MASTER_HOLIDAY_DOCUMENT', 'EMPLOYEE_PROFILE_PHOTO', 'DOCUMENT', 'PROJECT_DOCUMENT', 'PROJECT_PHOTO', 'NOTE_ATTACHMENT') NOT NULL;

-- If the notes table was already created with snake_case columns, run this migration:
-- ALTER TABLE `notes`
--   CHANGE COLUMN `created_at` `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   CHANGE COLUMN `updated_at` `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   CHANGE COLUMN `created_by` `createdBy` VARCHAR(255) NULL,
--   CHANGE COLUMN `updated_by` `updatedBy` VARCHAR(255) NULL,
--   CHANGE COLUMN `project_name` `projectName` VARCHAR(255) NULL,
--   CHANGE COLUMN `parent_id` `parentId` INT NULL,
--   CHANGE COLUMN `user_id` `userId` VARCHAR(100) NULL,
--   CHANGE COLUMN `employee_id` `employeeId` VARCHAR(100) NULL,
--   CHANGE COLUMN `is_pinned` `isPinned` BOOLEAN NOT NULL DEFAULT FALSE,
--   CHANGE COLUMN `is_archived` `isArchived` BOOLEAN NOT NULL DEFAULT FALSE,
--   CHANGE COLUMN `order_index` `orderIndex` INT NOT NULL DEFAULT 0;


