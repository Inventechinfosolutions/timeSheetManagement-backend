import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { EmployeeNote, NoteFileRecord } from './entities/employee-note.entity';
import { NoteCategory, NoteType } from './enums/employee-note.enums';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto } from './dto/update-employee-note.dto';
import { ExportNoteDescriptionDto } from './dto/export-employee-note.dto';
import { DocumentUploaderService } from '../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../common/document-uploader/models/documentmetainfo.model';
import PDFDocument from 'pdfkit';

@Injectable()
export class EmployeeNotesService {
  private readonly logger = new Logger(EmployeeNotesService.name);

  constructor(
    @InjectRepository(EmployeeNote)
    private readonly employeeNoteRepo: Repository<EmployeeNote>,
    @InjectRepository(DocumentMetaInfo)
    private readonly documentRepo: Repository<DocumentMetaInfo>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Normalize employee_notes.files to object_store UUID strings only */
  private parseNote(note: EmployeeNote): EmployeeNote {
    note.files = this.extractFileKeys(note.files);
    return note;
  }

  /**
   * PARENT if parent_note_id is empty; CHILD if it points to another note.
   */
  private resolveNoteType(parentNoteId?: number | null): NoteType {
    return parentNoteId != null && Number(parentNoteId) > 0
      ? NoteType.CHILD
      : NoteType.PARENT;
  }

  private extractFileKeys(rawFiles: any): string[] {
    if (!Array.isArray(rawFiles) || rawFiles.length === 0) return [];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const f of rawFiles) {
      const key = typeof f === 'string' ? f : (f?.s3Key || f?.id || f?.key || '');
      if (key && typeof key === 'string' && !key.startsWith('temp-') && !key.startsWith('note-') && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return keys;
  }

  /** Load filename / mime from MinIO using the object_store UUID */
  private async resolveFileFromStore(id: string): Promise<NoteFileRecord> {
    const doc = await this.documentRepo.findOne({
      where: [{ id }, { s3Key: id }],
    });
    const s3Key = doc?.s3Key || id;
    try {
      const meta = await this.documentUploaderService.getMetaData(s3Key);
      const name =
        meta.filename && meta.filename !== 'unknown' ? meta.filename : 'file';
      return {
        id: doc?.id || id,
        name,
        size: 0,
        type: meta.mimetype || '',
        s3Key,
      };
    } catch {
      return { id: doc?.id || id, name: 'file', size: 0, type: '', s3Key };
    }
  }

  /**
   * Point object_store.entityId AND object_store.refId at the same employee_notes.id.
   * Files uploaded during create land with 0; this is what attaches them after save.
   */
  private async linkObjectStoreFiles(noteId: number, files: NoteFileRecord[] | any[]): Promise<void> {
    if (!noteId || Number(noteId) <= 0) return;
    const keys = this.extractFileKeys(files);
    if (keys.length === 0) return;
    try {
      let linked = 0;
      for (const key of keys) {
        const doc = await this.documentRepo.findOne({
          where: [{ id: key }, { s3Key: key }],
        });
        if (!doc) continue;
        if (doc.entityType && doc.entityType !== EntityType.EMPLOYEE_NOTE) continue;
        doc.entityType = EntityType.EMPLOYEE_NOTE;
        doc.refType = doc.refType || ReferenceType.NOTE_ATTACHMENT;
        doc.entityId = noteId;
        doc.refId = noteId;
        await this.documentRepo.save(doc);
        linked++;
      }
      this.logger.log(`[DOCS] Linked ${linked}/${keys.length} object_store record(s) to noteId=${noteId}`);
    } catch (err: any) {
      this.logger.warn(`[DOCS] Failed to link object_store records to note ${noteId}: ${err?.message || err}`);
    }
  }

  /**
   * Hydrate API response files from object_store IDs + MinIO metadata.
   * Does not persist the hydrated objects back to employee_notes.
   */
  private async hydrateNoteFiles(note: EmployeeNote): Promise<EmployeeNote> {
    this.parseNote(note);
    try {
      const storedIds = this.extractFileKeys(note.files);
      const storeDocs = await this.documentRepo.find({
        where: { entityType: EntityType.EMPLOYEE_NOTE, entityId: note.id },
      });
      const related = storeDocs.filter(
        (d) => d.entityId === note.id && (d.refId === note.id || d.refId === 0),
      );
      const ids = [...storedIds];
      for (const d of related) {
        const key = d.id || d.s3Key;
        if (key && !ids.includes(key) && !ids.includes(d.s3Key)) ids.push(key);
      }
      const hydrated = await Promise.all(ids.map((id) => this.resolveFileFromStore(id)));
      (note as any).files = hydrated;
    } catch (err: any) {
      this.logger.warn(`[DOCS] hydrateNoteFiles failed for note ${note.id}: ${err?.message || err}`);
      (note as any).files = [];
    }
    return note;
  }

  // ---------------------------------------------------------------------------
  // CRUD – Notes
  // ---------------------------------------------------------------------------

  async findAllForEmployee(employeeId: string, search?: string): Promise<EmployeeNote[]> {
    try {
      const term = (search || '').trim();
      const qb = this.employeeNoteRepo
        .createQueryBuilder('note')
        .where('note.employeeId = :employeeId', { employeeId })
        .orderBy('note.updatedAt', 'DESC');

      if (term) {
        const q = `%${term.replace(/[\\%_]/g, '\\$&').toLowerCase()}%`;
        qb.andWhere(
          new Brackets((w) => {
            w.where('LOWER(note.projectName) LIKE :q', { q }).orWhere(
              'LOWER(note.title) LIKE :q',
              { q },
            );
          }),
        );
      }

      let notes = await qb.getMany();

      if (term && notes.length > 0) {
        const ids = new Set(notes.map((n) => n.id));
        const missingParentIds = notes
          .map((n) => n.parentNoteId)
          .filter((id): id is number => !!id && !ids.has(id));
        if (missingParentIds.length > 0) {
          const parents = await this.employeeNoteRepo.find({
            where: missingParentIds.map((id) => ({ id, employeeId })),
          });
          for (const parent of parents) {
            if (!ids.has(parent.id)) {
              notes.push(parent);
              ids.add(parent.id);
            }
          }
        }
        const matchedParentIds = notes
          .filter((n) => !n.parentNoteId)
          .map((n) => n.id);
        if (matchedParentIds.length > 0) {
          const children = await this.employeeNoteRepo.find({
            where: matchedParentIds.map((id) => ({ parentNoteId: id, employeeId })),
          });
          for (const child of children) {
            if (!ids.has(child.id)) {
              notes.push(child);
              ids.add(child.id);
            }
          }
        }
      }

      const parsed = notes.map((n) => this.parseNote(n));
      return Promise.all(parsed.map((n) => this.hydrateNoteFiles(n)));
    } catch (err: any) {
      this.logger.error(
        `findAllForEmployee failed for employeeId=${employeeId}: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
      return [];
    }
  }

  async findOne(employeeId: string, id: number | string): Promise<EmployeeNote> {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) {
      throw new NotFoundException('Note not found');
    }
    const where = employeeId
      ? { id: numId, employeeId }
      : { id: numId };
    const note = await this.employeeNoteRepo.findOne({ where });
    if (!note) throw new NotFoundException('Note not found');
    return this.hydrateNoteFiles(this.parseNote(note));
  }


  async create(dto: CreateEmployeeNoteDto): Promise<EmployeeNote> {
    const creator = dto.createdBy || dto.employeeId;
    const parentNoteId = dto.parentNoteId != null && Number(dto.parentNoteId) > 0
      ? Number(dto.parentNoteId)
      : null;
    const type = this.resolveNoteType(parentNoteId);
    const fileIds = this.extractFileKeys(dto.files);

    const note = this.employeeNoteRepo.create({
      employeeId:   dto.employeeId,
      parentNoteId,
      type,
      projectName:  dto.projectName ?? '',
      title:        dto.title       ?? '',
      category:     dto.category    ?? NoteCategory.PERSONAL_NOTE,
      content:      dto.content     ?? '',
      files:        fileIds,
      createdBy:    creator,
      updatedBy:    dto.updatedBy   ?? creator,
    });

    const saved = await this.employeeNoteRepo.save(note);

    await this.linkObjectStoreFiles(saved.id, fileIds.length ? fileIds : (dto.files ?? []));

    return this.hydrateNoteFiles(this.parseNote(saved));
  }

  async update(employeeId: string, id: number | string, dto: UpdateEmployeeNoteDto): Promise<EmployeeNote> {
    const numId = Number(id);
    const existing = await this.employeeNoteRepo.findOne({ where: { id: numId, employeeId } });
    if (!existing) throw new NotFoundException('Note not found');

    this.parseNote(existing);

    const updater = dto.updatedBy || employeeId;

    if (dto.parentNoteId !== undefined) existing.parentNoteId = dto.parentNoteId ?? null;
    existing.type = this.resolveNoteType(existing.parentNoteId);
    if (dto.projectName  !== undefined) existing.projectName  = dto.projectName;
    if (dto.title        !== undefined) existing.title        = dto.title;
    if (dto.category     !== undefined) existing.category     = dto.category;
    if (dto.content      !== undefined) existing.content      = dto.content;
    if (dto.createdBy    !== undefined) existing.createdBy    = dto.createdBy;
    existing.updatedBy = updater;

    if (dto.files !== undefined) {
      existing.files = this.extractFileKeys(dto.files);
      await this.linkObjectStoreFiles(numId, existing.files.length ? existing.files : (dto.files ?? []));
    }

    const saved = await this.employeeNoteRepo.save(existing);
    return this.hydrateNoteFiles(this.parseNote(saved));
  }

  async remove(employeeId: string, id: number | string): Promise<void> {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) {
      throw new NotFoundException('Note not found');
    }
    const existing = await this.employeeNoteRepo.findOne({ where: { id: numId, employeeId } });
    if (!existing) throw new NotFoundException('Note not found');

    const childDelete = await this.employeeNoteRepo
      .createQueryBuilder()
      .delete()
      .from(EmployeeNote)
      .where('parent_note_id = :parentId', { parentId: numId })
      .execute();

    this.logger.log(
      `Deleted ${childDelete.affected ?? 0} child note(s) with parent_note_id=${numId}`,
    );

    await this.employeeNoteRepo.delete({ id: numId, employeeId });
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
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 2cm; color: #1e293b; }
  .note-body { font-size: 11pt; line-height: 1.65; color: #334155; }
  .note-body p { margin: 0 0 8pt 0; }
  .note-body h1, .note-body h2, .note-body h3 { color: #0f172a; margin: 10pt 0 6pt 0; }
  .note-body ul, .note-body ol { margin: 4pt 0 10pt 0; padding-left: 24pt; }
  .note-body ul ul, .note-body ol ol, .note-body ul ol, .note-body ol ul { margin: 3pt 0 3pt 0; padding-left: 20pt; }
  .note-body li { margin: 0 0 4pt 0; line-height: 1.5; }
  .note-body ul { list-style-type: disc; }
  .note-body ul ul { list-style-type: circle; }
  .note-body ul ul ul { list-style-type: square; }
  .note-body ol { list-style-type: decimal; }
  .note-body ol ol { list-style-type: lower-alpha; }
  .note-body ol ol ol { list-style-type: lower-roman; }
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
    id: number | string,
    format: string = 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const note = await this.findOne(employeeId, id);
    const title = note.title || note.projectName || 'Note';
    const content = note.content || '';

    return this.exportDescription({
      htmlContent: content,
      title,
      format: (format as any) || 'pdf',
      employeeId,
      noteId: String(id),
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
          } else if (block.type === 'list' && block.items) {
            for (const item of block.items) {
              const indent = 16 + item.depth * 18;
              doc
                .font('Helvetica')
                .fontSize(11)
                .fillColor('#334155')
                .text(`${item.marker}  ${item.text}`, {
                  indent,
                  lineGap: 2.5,
                  paragraphGap: 3,
                });
            }
            doc.moveDown(0.25);
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
    type: 'h1' | 'h2' | 'p' | 'list' | 'blockquote';
    text?: string;
    items?: Array<{ text: string; depth: number; marker: string }>;
  }> {
    const blocks: Array<{
      type: 'h1' | 'h2' | 'p' | 'list' | 'blockquote';
      text?: string;
      items?: Array<{ text: string; depth: number; marker: string }>;
    }> = [];

    const topBlocks = this.splitTopLevelTags(html, ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'blockquote']);

    for (const block of topBlocks) {
      if (block.tag === 'ul' || block.tag === 'ol') {
        const items = this.parseNestedListItems(block.inner, block.tag === 'ol', 0);
        if (items.length > 0) blocks.push({ type: 'list', items });
      } else if (block.tag === 'h1' || block.tag === 'h2' || block.tag === 'h3') {
        const text = this.stripTags(block.inner);
        if (text) blocks.push({ type: block.tag === 'h1' ? 'h1' : 'h2', text });
      } else if (block.tag === 'blockquote') {
        const text = this.stripTags(block.inner);
        if (text) blocks.push({ type: 'blockquote', text });
      } else {
        const text = this.stripTags(block.inner);
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

  private splitTopLevelTags(
    html: string,
    tags: string[],
  ): Array<{ tag: string; inner: string }> {
    const blocks: Array<{ tag: string; inner: string }> = [];
    const openRe = new RegExp(`<(${tags.join('|')})\\b[^>]*>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = openRe.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const innerStart = match.index + match[0].length;
      const close = this.findMatchingClose(html, tag, innerStart);
      if (close < 0) continue;
      blocks.push({ tag, inner: html.slice(innerStart, close) });
      openRe.lastIndex = close + tag.length + 3;
    }
    return blocks;
  }

  private findMatchingClose(html: string, tag: string, from: number): number {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    const closeRe = new RegExp(`</${tag}>`, 'gi');
    let depth = 1;
    let i = from;
    while (i < html.length && depth > 0) {
      openRe.lastIndex = i;
      closeRe.lastIndex = i;
      const openMatch = openRe.exec(html);
      const closeMatch = closeRe.exec(html);
      if (!closeMatch) return -1;
      if (openMatch && openMatch.index < closeMatch.index) {
        depth++;
        i = openMatch.index + openMatch[0].length;
      } else {
        depth--;
        if (depth === 0) return closeMatch.index;
        i = closeMatch.index + closeMatch[0].length;
      }
    }
    return -1;
  }

  private parseNestedListItems(
    innerHtml: string,
    ordered: boolean,
    depth: number,
  ): Array<{ text: string; depth: number; marker: string }> {
    const items: Array<{ text: string; depth: number; marker: string }> = [];
    const lis = this.splitTopLevelTags(innerHtml, ['li']);
    lis.forEach((li, idx) => {
      const nestedLists = this.splitTopLevelTags(li.inner, ['ul', 'ol']);
      let textHtml = li.inner;
      for (const nested of nestedLists) {
        const full = this.extractFullTag(li.inner, nested.tag, nested.inner);
        if (full) textHtml = textHtml.replace(full, '');
      }
      const text = this.stripTags(textHtml);
      if (text) {
        items.push({
          text,
          depth,
          marker: this.listMarker(ordered, idx, depth),
        });
      }
      for (const nested of nestedLists) {
        items.push(
          ...this.parseNestedListItems(nested.inner, nested.tag === 'ol', depth + 1),
        );
      }
    });
    return items;
  }

  private extractFullTag(html: string, tag: string, inner: string): string | null {
    const idx = html.indexOf(inner);
    if (idx < 0) return null;
    const openStart = html.lastIndexOf('<', idx - 1);
    const close = `</${tag}>`;
    const closeIdx = html.indexOf(close, idx + inner.length);
    if (openStart < 0 || closeIdx < 0) return null;
    return html.slice(openStart, closeIdx + close.length);
  }

  private listMarker(ordered: boolean, index: number, depth: number): string {
    if (!ordered) {
      return depth === 0 ? '•' : depth === 1 ? '◦' : '▪';
    }
    if (depth === 0) return `${index + 1}.`;
    if (depth === 1) return `${String.fromCharCode(97 + (index % 26))}.`;
    return `${index + 1}.`;
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

  // ---------------------------------------------------------------------------
  // Leave Management Standard Document Uploader Methods
  // ---------------------------------------------------------------------------

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    this.logger.log(
      `[DOCS] Uploading ${documents.length} document(s) for note entityId=${entityId}, refId=${refId}`,
    );
    try {
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = refId;
        details.refType = refType;
        details.entityId = entityId;
        details.entityType = entityType;

        return await this.documentUploaderService.uploadImage(doc, details);
      });

      const results = await Promise.all(uploadPromises);
      this.logger.log(
        `[DOCS] Successfully uploaded ${results.length} document(s)`,
      );

      // Sync with note.files column if refId or entityId matches an existing note
      const noteId = refId || entityId;
      if (noteId && noteId !== 0) {
        try {
          const note = await this.employeeNoteRepo.findOne({ where: { id: noteId } });
          if (note) {
            this.parseNote(note);
            const existingIds = this.extractFileKeys(note.files);
            const newIds = results.map((uploaded) => uploaded.key).filter(Boolean);
            note.files = Array.from(new Set([...existingIds, ...newIds]));
            await this.employeeNoteRepo.save(note);
          }
        } catch (err) {
          this.logger.warn(`Could not sync note.files for noteId=${noteId}: ${err}`);
        }
      }

      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error: any) {
      this.logger.error(`[DOCS] Upload failed: ${error.message}`, error.stack);
      throw new HttpException(
        error.message ? `Error uploading documents: ${error.message}` : 'Error uploading documents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllFiles(
    entityType: EntityType,
    entityId: number,
    refId: number,
    referenceType: ReferenceType,
  ) {
    this.logger.log(
      `[DOCS] Getting all files for entity ${entityType} ID ${entityId}, refId ${refId}`,
    );
    try {
      return await this.documentUploaderService.getAllDocs(
        entityType,
        entityId,
        referenceType,
        refId,
      );
    } catch (error: any) {
      this.logger.error(`[DOCS] Failed to get files: ${error.message}`);
      throw new HttpException(
        'Failed to fetch documents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteDocument(
    entityType: EntityType,
    entityId: number,
    refId: number,
    key: string,
  ) {
    this.logger.log(`[DOCS] Deleting document key=${key} for entityId=${entityId}, refId=${refId}`);
    try {
      const result = await this.documentUploaderService.deleteDoc(key);

      const noteId = refId || entityId;
      if (noteId && noteId !== 0) {
        try {
          const note = await this.employeeNoteRepo.findOne({ where: { id: noteId } });
          if (note) {
            this.parseNote(note);
            note.files = this.extractFileKeys(note.files).filter((id) => id !== key);
            await this.employeeNoteRepo.save(note);
          }
        } catch (err) {
          this.logger.warn(`Could not sync note.files on delete for noteId=${noteId}: ${err}`);
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(`[DOCS] Delete failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Error deleting document',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateEntity(
    entityType: EntityType,
    entityId: number,
    refId: number,
  ) {
    try {
      if (entityType === EntityType.EMPLOYEE_NOTE) {
        const noteId = refId !== 0 ? refId : entityId;
        if (noteId !== 0) {
          const note = await this.employeeNoteRepo.findOne({ where: { id: noteId } });
          if (!note) {
            throw new NotFoundException(`Employee note with ID ${noteId} not found`);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`[DOCS] Entity validation failed: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Validation error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}


