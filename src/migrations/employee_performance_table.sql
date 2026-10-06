USE timesheet;

CREATE TABLE IF NOT EXISTS `employee_performance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `employeeId` VARCHAR(100) NOT NULL,
  `quarter` ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
  `financialYear` VARCHAR(50) DEFAULT NULL,
  `overview` TEXT NOT NULL,
  `projectTitle` VARCHAR(255) NOT NULL,
  `projectDescription` TEXT NOT NULL,
  `challenge` TEXT NOT NULL,

  -- Collaboration & Teamwork Metrics (INT, NOT NULL)
  `crossDepartmentCollaboration` INT NOT NULL,
  `mentorshipKnowledgeSharing` INT NOT NULL,
  `reliabilityAccountability` INT NOT NULL,
  `communicationTransparency` INT NOT NULL,
  `peerSupportTeamSpirit` INT NOT NULL,
  `adaptabilityInitiative` INT NOT NULL,

  -- Qualitative Feedback Enums (NOT NULL)
  `learningGoals` ENUM(
    'UPSKILL_TECHNICAL',
    'LEADERSHIP_MANAGEMENT',
    'CERTIFICATION_ACHIEVED',
    'PROCESS_IMPROVEMENT',
    'CROSS_FUNCTIONAL_KNOWLEDGE',
    'ON_TRACK',
    'NEEDS_GUIDANCE'
  ) NOT NULL,

  `feedbackOnWorkCulture` ENUM(
    'EXCELLENT',
    'VERY_GOOD',
    'POSITIVE',
    'NEUTRAL',
    'NEEDS_IMPROVEMENT'
  ) NOT NULL,

  `workLifeBalance` ENUM(
    'EXCELLENT',
    'GOOD',
    'MANAGEABLE',
    'STRESSFUL',
    'NEEDS_ATTENTION'
  ) NOT NULL,

  `suggestionsForImprovement` ENUM(
    'PROCESS_AUTOMATION',
    'TRAINING_WORKSHOPS',
    'BETTER_TOOLING',
    'RESOURCE_ALLOCATION',
    'CROSS_TEAM_SYNC',
    'NONE'
  ) NOT NULL,

  `rateCompanyEnvironment` ENUM(
    'FIVE_STAR',
    'FOUR_STAR',
    'THREE_STAR',
    'TWO_STAR',
    'ONE_STAR'
  ) NOT NULL,

  `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',

  -- BaseEntity Audit Columns
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` VARCHAR(255) DEFAULT NULL,
  `updatedBy` VARCHAR(255) DEFAULT NULL,

  PRIMARY KEY (`id`),
  INDEX `IDX_perf_employee` (`employeeId`),
  INDEX `IDX_perf_quarter` (`quarter`),
  INDEX `IDX_perf_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
