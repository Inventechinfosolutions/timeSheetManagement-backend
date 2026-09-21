import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EmployeeNote, ProjectRow } from './entities/employee-note.entity';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto, AddProjectRowDto } from './dto/update-employee-note.dto';

@Injectable()
export class EmployeeNotesService implements OnModuleInit {
  private readonly logger = new Logger(EmployeeNotesService.name);

  constructor(
    @InjectRepository(EmployeeNote)
    private readonly employeeNoteRepo: Repository<EmployeeNote>,
  ) {}

  // ---------------------------------------------------------------------------
  // DB bootstrap – run once at startup to ensure table + columns exist
  // ---------------------------------------------------------------------------
  async onModuleInit() {
    try {
      // Create table if not exists (columns match entity exactly)
      await this.employeeNoteRepo.query(`
        CREATE TABLE IF NOT EXISTS \`employee_notes\` (
          \`id\`             varchar(36)   NOT NULL,
          \`employee_id\`    varchar(255)  NOT NULL,
          \`parent_note_id\` varchar(255)  NULL,
          \`projectName\`    varchar(255)  NULL DEFAULT '',
          \`title\`          varchar(255)  NOT NULL DEFAULT '',
          \`category\`       varchar(255)  NOT NULL DEFAULT 'Personal Note',
          \`folder\`         varchar(255)  NULL DEFAULT 'General',
          \`content\`        longtext      NULL,
          \`rows\`           longtext      NULL,
          \`files\`          longtext      NULL,
          \`createdAt\`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`createdBy\`      varchar(255)  NULL,
          \`updatedBy\`      varchar(255)  NULL,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Safely add any missing columns that were introduced later
      const safeAlter = async (sql: string) => {
        try { await this.employeeNoteRepo.query(sql); } catch { /* column already exists */ }
      };

      await safeAlter('ALTER TABLE `employee_notes` ADD COLUMN `parent_note_id` varchar(255) NULL');
      await safeAlter('ALTER TABLE `employee_notes` ADD COLUMN `projectName`    varchar(255) NULL DEFAULT ""');
      await safeAlter('ALTER TABLE `employee_notes` ADD COLUMN `folder`         varchar(255) NULL DEFAULT "General"');
      await safeAlter('ALTER TABLE `employee_notes` ADD COLUMN `files`          longtext     NULL');

      // Ensure longtext types for large fields
      await safeAlter('ALTER TABLE `employee_notes` MODIFY COLUMN `files`   longtext NULL');
      await safeAlter('ALTER TABLE `employee_notes` MODIFY COLUMN `content` longtext NULL');
      await safeAlter('ALTER TABLE `employee_notes` MODIFY COLUMN `rows`    longtext NULL');

      // Back-fill createdBy / updatedBy where missing
      await safeAlter('UPDATE `employee_notes` SET `createdBy` = `employee_id` WHERE `createdBy` IS NULL');
      await safeAlter('UPDATE `employee_notes` SET `updatedBy` = `employee_id` WHERE `updatedBy` IS NULL');

      this.logger.log('employee_notes table verified/created successfully with parent_note_id support.');
    } catch (err: any) {
      this.logger.error(`Failed to ensure employee_notes table: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Parse the `rows` / `files` JSON stored as longtext in MySQL */
  private parseNote(note: EmployeeNote): EmployeeNote {
    try {
      if (note.rows && typeof note.rows === 'string') {
        note.rows = JSON.parse(note.rows as any);
      }
    } catch { note.rows = []; }

    try {
      if (note.files && typeof note.files === 'string') {
        note.files = JSON.parse(note.files as any);
      }
    } catch { note.files = []; }

    return note;
  }

  // ---------------------------------------------------------------------------
  // CRUD – Notes
  // ---------------------------------------------------------------------------

  async findAllForEmployee(employeeId: string): Promise<EmployeeNote[]> {
    try {
      const notes = await this.employeeNoteRepo.find({
        where: { employeeId },
        order: { updatedAt: 'DESC' },
      });
      return notes.map((n) => this.parseNote(n));
    } catch (err: any) {
      this.logger.error(
        `findAllForEmployee failed for employeeId=${employeeId}: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
      // Attempt to recreate table on first-run race condition
      if (err?.message?.includes("doesn't exist") || err?.code === 'ER_NO_SUCH_TABLE') {
        try {
          await this.onModuleInit();
          const notes = await this.employeeNoteRepo.find({
            where: { employeeId },
            order: { updatedAt: 'DESC' },
          });
          return notes.map((n) => this.parseNote(n));
        } catch { return []; }
      }
      return [];
    }
  }

  async create(dto: CreateEmployeeNoteDto): Promise<EmployeeNote> {
    const now = new Date().toISOString();
    const creator = dto.createdBy || dto.employeeId;

    // Ensure every row has an id and timestamps
    const rows: ProjectRow[] = (dto.rows ?? []).map((r) => ({
      id:        r.id        ?? uuidv4(),
      title:     r.title     ?? '',
      notes:     r.notes     ?? '',
      createdBy: r.createdBy ?? creator,
      createdAt: r.createdAt ?? now,
      updatedAt: r.updatedAt ?? now,
    }));

    const note = this.employeeNoteRepo.create({
      employeeId:   dto.employeeId,
      parentNoteId: dto.parentNoteId ?? null,
      projectName:  dto.projectName ?? '',
      title:        dto.title       ?? '',
      category:     dto.category    ?? 'Personal Note',
      folder:       dto.folder      ?? 'General',
      content:      dto.content     ?? '',
      rows:         rows,
      files:        dto.files       ?? [],
      createdBy:    creator,
      updatedBy:    dto.updatedBy   ?? creator,
    });

    // Manually JSON-stringify for longtext columns
    (note as any).rows  = JSON.stringify(note.rows);
    (note as any).files = JSON.stringify(note.files);

    const saved = await this.employeeNoteRepo.save(note);
    return this.parseNote(saved);
  }

  async update(employeeId: string, id: string, dto: UpdateEmployeeNoteDto): Promise<EmployeeNote> {
    const existing = await this.employeeNoteRepo.findOne({ where: { id, employeeId } });
    if (!existing) throw new NotFoundException('Note not found');

    this.parseNote(existing); // deserialize stored JSON first

    const updater = dto.updatedBy || employeeId;
    const now     = new Date().toISOString();

    if (dto.parentNoteId !== undefined) existing.parentNoteId = dto.parentNoteId ?? null;
    if (dto.projectName  !== undefined) existing.projectName  = dto.projectName;
    if (dto.title        !== undefined) existing.title        = dto.title;
    if (dto.category     !== undefined) existing.category     = dto.category;
    if (dto.folder       !== undefined) existing.folder       = dto.folder;
    if (dto.content      !== undefined) existing.content      = dto.content;
    if (dto.createdBy    !== undefined) existing.createdBy    = dto.createdBy;
    existing.updatedBy = updater;

    if (dto.rows !== undefined) {
      existing.rows = dto.rows.map((r) => ({
        id:        r.id        ?? uuidv4(),
        title:     r.title     ?? '',
        notes:     r.notes     ?? '',
        createdBy: r.createdBy ?? updater,
        createdAt: r.createdAt ?? now,
        updatedAt: now,
      }));
    }

    if (dto.files !== undefined) existing.files = dto.files;

    // Stringify for longtext storage
    (existing as any).rows  = JSON.stringify(existing.rows  ?? []);
    (existing as any).files = JSON.stringify(existing.files ?? []);

    const saved = await this.employeeNoteRepo.save(existing);
    return this.parseNote(saved);
  }

  async remove(employeeId: string, id: string): Promise<void> {
    const existing = await this.employeeNoteRepo.findOne({ where: { id, employeeId } });
    if (!existing) throw new NotFoundException('Note not found');
    await this.employeeNoteRepo.remove(existing);
  }

  // ---------------------------------------------------------------------------
  // Sub-table rows (project detail rows inside a Project Note)
  // ---------------------------------------------------------------------------

  /** Add a new row to an existing note's sub-table */
  async addRow(employeeId: string, noteId: string, dto: AddProjectRowDto): Promise<EmployeeNote> {
    const note = await this.employeeNoteRepo.findOne({ where: { id: noteId, employeeId } });
    if (!note) throw new NotFoundException('Note not found');
    this.parseNote(note);

    const now = new Date().toISOString();
    const creator = dto.createdBy || employeeId;

    const newRow: ProjectRow = {
      id:        uuidv4(),
      title:     dto.title     ?? '',
      notes:     dto.notes     ?? '',
      createdBy: creator,
      createdAt: now,
      updatedAt: now,
    };

    const rows = Array.isArray(note.rows) ? note.rows : [];
    rows.push(newRow);
    note.rows = rows;

    (note as any).rows  = JSON.stringify(note.rows);
    (note as any).files = JSON.stringify(note.files ?? []);

    const saved = await this.employeeNoteRepo.save(note);
    return this.parseNote(saved);
  }

  /** Update a specific row inside a note's sub-table */
  async updateRow(
    employeeId: string,
    noteId: string,
    rowId: string,
    dto: AddProjectRowDto,
  ): Promise<EmployeeNote> {
    const note = await this.employeeNoteRepo.findOne({ where: { id: noteId, employeeId } });
    if (!note) throw new NotFoundException('Note not found');
    this.parseNote(note);

    const rows = Array.isArray(note.rows) ? note.rows : [];
    const idx  = rows.findIndex((r) => r.id === rowId);
    if (idx === -1) throw new NotFoundException('Row not found');

    const now = new Date().toISOString();
    rows[idx] = {
      ...rows[idx],
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      updatedAt: now,
    };
    note.rows = rows;

    (note as any).rows  = JSON.stringify(note.rows);
    (note as any).files = JSON.stringify(note.files ?? []);

    const saved = await this.employeeNoteRepo.save(note);
    return this.parseNote(saved);
  }

  /** Delete a specific row from a note's sub-table */
  async removeRow(employeeId: string, noteId: string, rowId: string): Promise<EmployeeNote> {
    const note = await this.employeeNoteRepo.findOne({ where: { id: noteId, employeeId } });
    if (!note) throw new NotFoundException('Note not found');
    this.parseNote(note);

    const rows = Array.isArray(note.rows) ? note.rows : [];
    const filtered = rows.filter((r) => r.id !== rowId);
    if (filtered.length === rows.length) throw new NotFoundException('Row not found');
    note.rows = filtered;

    (note as any).rows  = JSON.stringify(note.rows);
    (note as any).files = JSON.stringify(note.files ?? []);

    const saved = await this.employeeNoteRepo.save(note);
    return this.parseNote(saved);
  }
}
