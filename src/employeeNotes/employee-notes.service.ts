import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EmployeeNote, ProjectRow } from './entities/employee-note.entity';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto, AddProjectRowDto } from './dto/update-employee-note.dto';
import { ExportNoteDescriptionDto } from './dto/export-employee-note.dto';
import PDFDocument from 'pdfkit';

@Injectable()
export class EmployeeNotesService {
  private readonly logger = new Logger(EmployeeNotesService.name);

  constructor(
    @InjectRepository(EmployeeNote)
    private readonly employeeNoteRepo: Repository<EmployeeNote>,
  ) {}

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
      return [];
    }
  }

  async findOne(employeeId: string, id: string): Promise<EmployeeNote> {
    let note = await this.employeeNoteRepo.findOne({ where: { id, employeeId } });
    if (!note) {
      note = await this.employeeNoteRepo.findOne({ where: { id } });
    }
    if (!note) throw new NotFoundException('Note not found');
    return this.parseNote(note);
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

  // ---------------------------------------------------------------------------
  // Export & Download
  // ---------------------------------------------------------------------------

  /**
   * Export note description or content as PDF or Word (.doc) document.
   */
  async exportDescription(
    dto: ExportNoteDescriptionDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    let htmlContent = dto.htmlContent || '';
    let title = dto.title || '';

    // If htmlContent is empty but noteId is provided, load the note
    if (!htmlContent.trim() && dto.noteId) {
      try {
        const note = await this.findOne(dto.employeeId || '', dto.noteId);
        if (note) {
          title = title || note.title || note.projectName || 'Note';
          htmlContent = note.content || '';
        }
      } catch (err: any) {
        this.logger.warn(`Could not load note content for export: ${err.message}`);
      }
    }

    const cleanTitle =
      (title || 'description')
        .trim()
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase() || 'description';

    const format = (dto.format || 'pdf').toLowerCase();

    if (format === 'doc' || format === 'docx') {
      const displayTitle = title.trim();
      const titleHtml = displayTitle
        ? `<h1 style="font-size: 20pt; font-weight: bold; color: #000000; margin-top: 0; margin-bottom: 14pt; line-height: 1.3;">${this.escapeHtml(displayTitle)}</h1>`
        : '';
      const htmlDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 2cm; color: #1e293b; }
  .note-body { font-size: 11pt; line-height: 1.65; color: #334155; }
  .note-body p { margin-bottom: 8pt; }
  .note-body ul, .note-body ol { padding-left: 20pt; margin-bottom: 8pt; }
  .note-body li { margin-bottom: 4pt; }
  .note-body blockquote { border-left: 4px solid #4318FF; background: #f8fafc; padding: 6pt 12pt; color: #475569; font-style: italic; margin: 8pt 0; }
</style></head><body>
${titleHtml}
<div class="note-body">
  ${htmlContent || ''}
</div>
</body></html>`;

      const buffer = Buffer.from(htmlDoc, 'utf-8');
      return {
        buffer,
        filename: `${cleanTitle}.doc`,
        contentType: 'application/msword',
      };
    }

    if (format === 'txt') {
      const plainText = this.stripTags(htmlContent);
      const textOutput = title ? `${title}\n\n${plainText}` : plainText;
      return {
        buffer: Buffer.from(textOutput, 'utf-8'),
        filename: `${cleanTitle}.txt`,
        contentType: 'text/plain; charset=utf-8',
      };
    }

    // Default: PDF generation via pdfkit
    const buffer = await this.generatePdfBuffer(title, htmlContent);
    return {
      buffer,
      filename: `${cleanTitle}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /**
   * Export an existing note by ID
   */
  async exportNoteById(
    employeeId: string,
    id: string,
    format: string = 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const note = await this.findOne(employeeId, id);
    const title = note.title || note.projectName || 'Note';
    let content = note.content || '';

    // If it's a project note and has sub-table rows, combine them if main content is empty
    if (!content.trim() && Array.isArray(note.rows) && note.rows.length > 0) {
      content = note.rows
        .map((r) => `<h2>${this.escapeHtml(r.title || 'Row')}</h2>${r.notes || ''}`)
        .join('<br/>');
    }

    return this.exportDescription({
      htmlContent: content,
      title,
      format: (format as any) || 'pdf',
      employeeId,
      noteId: id,
    });
  }

  // ---------------------------------------------------------------------------
  // PDF Generation Helper
  // ---------------------------------------------------------------------------

  private generatePdfBuffer(title: string, htmlContent: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 44,
          size: 'A4',
          bufferPages: true,
          autoFirstPage: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const displayTitle = (title || '').trim();
        if (displayTitle) {
          doc
            .font('Helvetica-Bold')
            .fontSize(20)
            .fillColor('#000000')
            .text(displayTitle, { paragraphGap: 14 });
          doc.moveDown(0.3);
        }

        const blocks = this.parseHtmlToBlocks(htmlContent || '');
        for (const block of blocks) {
          if (block.type === 'h1') {
            doc
              .font('Helvetica-Bold')
              .fontSize(16)
              .fillColor('#0F172A')
              .text(block.text || '', { paragraphGap: 8 });
          } else if (block.type === 'h2') {
            doc
              .font('Helvetica-Bold')
              .fontSize(13)
              .fillColor('#1E293B')
              .text(block.text || '', { paragraphGap: 6 });
          } else if (block.type === 'p') {
            doc
              .font('Helvetica')
              .fontSize(11)
              .fillColor('#334155')
              .text(block.text || '', { lineGap: 3, paragraphGap: 8 });
          } else if (block.type === 'ul' && block.items) {
            for (const item of block.items) {
              doc
                .font('Helvetica')
                .fontSize(11)
                .fillColor('#334155')
                .text(`•   ${item}`, { indent: 16, lineGap: 2.5, paragraphGap: 4 });
            }
            doc.moveDown(0.3);
          } else if (block.type === 'ol' && block.items) {
            block.items.forEach((item, idx) => {
              doc
                .font('Helvetica')
                .fontSize(11)
                .fillColor('#334155')
                .text(`${idx + 1}.   ${item}`, { indent: 16, lineGap: 2.5, paragraphGap: 4 });
            });
            doc.moveDown(0.3);
          } else if (block.type === 'blockquote') {
            const startY = doc.y;
            doc
              .font('Helvetica-Oblique')
              .fontSize(11)
              .fillColor('#475569')
              .text(block.text || '', { indent: 16, lineGap: 3, paragraphGap: 8 });
            const endY = doc.y;
            try {
              doc
                .save()
                .strokeColor('#4318FF')
                .lineWidth(3)
                .moveTo(44, startY)
                .lineTo(44, Math.max(startY + 12, endY - 4))
                .stroke()
                .restore();
            } catch {
              // Ignore line drawing errors
            }
            doc.moveDown(0.3);
          }
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private parseHtmlToBlocks(html: string): Array<{
    type: 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'blockquote';
    text?: string;
    items?: string[];
  }> {
    const blocks: Array<{
      type: 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'blockquote';
      text?: string;
      items?: string[];
    }> = [];

    const blockRegex = /<(h[1-3]|p|ul|ol|blockquote)(?:[^>]*)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const inner = match[2];

      if (tag === 'ul' || tag === 'ol') {
        const items: string[] = [];
        const liRegex = /<li(?:[^>]*)>([\s\S]*?)<\/li>/gi;
        let liMatch: RegExpExecArray | null;
        while ((liMatch = liRegex.exec(inner)) !== null) {
          const text = this.stripTags(liMatch[1]);
          if (text) items.push(text);
        }
        if (items.length > 0) {
          blocks.push({ type: tag as 'ul' | 'ol', items });
        }
      } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        const text = this.stripTags(inner);
        if (text) blocks.push({ type: tag === 'h1' ? 'h1' : 'h2', text });
      } else if (tag === 'blockquote') {
        const text = this.stripTags(inner);
        if (text) blocks.push({ type: 'blockquote', text });
      } else {
        const text = this.stripTags(inner);
        if (text) blocks.push({ type: 'p', text });
      }
    }

    if (blocks.length === 0) {
      const raw = this.stripTags(html);
      if (raw) {
        const paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        for (const p of paragraphs) {
          blocks.push({ type: 'p', text: p });
        }
      }
    }

    return blocks;
  }

  private stripTags(s: string): string {
    return s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/g, "'")
      .trim();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

